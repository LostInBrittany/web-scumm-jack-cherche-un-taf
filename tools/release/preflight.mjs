// `ship preflight-stable --candidate=<run>` (4.1.20 PR 3b, docs/dev/PLAN-4.1.20-LAST-MILE.md §11.1–11.2): what 4.2
// stable still needs, said check by check. It signs nothing, publishes nothing and changes no setting. Each check is
// `ok`, `missing` (a step still to take: the npm bootstrap, a setting to turn on, a proof not made yet; listed, not an
// error) or `blocked` (something wrong: a candidate that does not verify, a version already published, a pin that is
// a range, a GO / NO-GO the reports contradict). `exec(cmd, args)` runs gh, npm and git, so tests give it fakes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The exact Node and npm of the future publishing step (release.yml's env): npm 11.15.0 at least for `npm stage`. */
export const MINIMUM = { node: '22.14.0', npm: '11.15.0' };
export const PACKAGES = [
  'web-scumm',
  'create-web-scumm',
  'web-scumm-bridge',
  'web-scumm-connectors',
  'web-scumm-studio-server',
];

/** The first release each package is part of (an older candidate is judged without it). */
const PACKAGE_SINCE = { 'web-scumm-studio-server': '4.2.1' };
/** The packages of a release (`4.2.1`, `4.2.1-rc.1`). */
export const packagesFor = (version) =>
  PACKAGES.filter((p) => !PACKAGE_SINCE[p] || atLeast(version.replace(/-.*$/, ''), PACKAGE_SINCE[p]));

/**
 * The passes asked of a release, from docs/dev/surfaces.json (one surface per pass, with the release it came in): a
 * pass added later is not asked of an older one (4.2.1's studio-hosted and studio-collab).
 */
export function passesAsked(version) {
  const surfaces = JSON.parse(readFileSync(new URL('../../docs/dev/surfaces.json', import.meta.url), 'utf8')).surfaces;
  return Object.entries(surfaces)
    .filter(([, s]) => !s.since || atLeast(version.replace(/-.*$/, ''), s.since))
    .map(([id]) => id);
}

const EXACT = /^\d+\.\d+\.\d+$/;
const parts = (v) => v.split('.').map(Number);
const atLeast = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return true;
};

/** The publishing step's pins as release.yml writes them (`NPM_PUBLISH_NODE`, `NPM_PUBLISH_NPM`), unread when absent. */
export function pinsOf(releaseYml) {
  const at = (k) => new RegExp(`^\\s+${k}: '?([^'\\s]+)'?\\s*$`, 'm').exec(releaseYml)?.[1];
  return { node: at('NPM_PUBLISH_NODE'), npm: at('NPM_PUBLISH_NPM') };
}

/** What is wrong with the pins: absent, a range, or below the minimum. */
export function pinProblems(pins) {
  const bad = [];
  for (const k of ['node', 'npm']) {
    const v = pins[k];
    if (!v) bad.push(`${k}: not pinned`);
    else if (!EXACT.test(v)) bad.push(`${k}: ${v} is not an exact version`);
    else if (!atLeast(v, MINIMUM[k])) bad.push(`${k}: ${v}, below ${MINIMUM[k]}`);
  }
  return bad;
}

/**
 * The JSON objects a command printed one after the other (`npm trust list --json` prints one indented object per
 * configuration, second reading of PR 3b), each parsed; text that is no object is skipped.
 */
export function jsonObjects(text) {
  const out = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth++ === 0) start = i;
    } else if (ch === '}' && depth > 0 && --depth === 0) {
      try {
        out.push(JSON.parse(text.slice(start, i + 1)));
      } catch {
        /* not JSON */
      }
    }
  }
  return out;
}

/** An npm maintainer (`name <email>`) as its user name alone. */
const npmName = (m) => String(m).split(' ')[0];

/** Whether a ruleset protects the release tags: active, on `refs/tags/v*`, refusing deletion, force-push and creation by others. */
export function guardsTags(rs) {
  const types = new Set((rs?.rules ?? []).map((r) => r.type));
  // Creation restricted to someone: with no bypass, the maintainer could not tag either.
  return (
    (rs?.bypass_actors ?? []).length > 0 &&
    rs?.target === 'tag' &&
    rs.enforcement === 'active' &&
    (rs.conditions?.ref_name?.include ?? []).some((p) => p === 'refs/tags/v*' || p === '~ALL') &&
    ['deletion', 'non_fast_forward', 'creation'].every((t) => types.has(t))
  );
}

/**
 * Every check, in order. `o.candidate` is what ship found of the candidate run (`problems`, `[]` when it verifies;
 * `pack`, the folder of its four archives); `o.version` the stable version; `o.root` the checkout; `o.login` the
 * maintainer's GitHub login.
 */
export function preflight({ exec, repo, login, npmUser, version, root = '.', candidate, home = homedir() }) {
  const rows = [];
  const add = (id, state, say) => rows.push({ id, state, say });
  const ok = (r) => r.status === 0;
  const json = (r) => {
    try {
      return JSON.parse(r.stdout);
    } catch {
      return null;
    }
  };

  // The signing key: local, an SSH key, registered on GitHub as a signing key, and in the trust root.
  // `user.signingkey` is a file, `~/` allowed, or the key itself after `key::` (git's two forms; second reading of #122).
  const setting = exec('git', ['config', '--get', 'user.signingkey']).stdout.trim();
  const format = exec('git', ['config', '--get', 'gpg.format']).stdout.trim();
  const literal = setting.startsWith('key::') ? setting.slice('key::'.length).trim() : '';
  const keyFile = literal ? '' : setting.replace(/^~(?=\/)/, home);
  const pubFile = keyFile && (keyFile.endsWith('.pub') ? keyFile : `${keyFile}.pub`);
  const pub = (literal || (pubFile && existsSync(pubFile) ? readFileSync(pubFile, 'utf8').trim() : ''))
    .split(' ')
    .slice(0, 2)
    .join(' ');
  if (!pub || format !== 'ssh')
    add('signing-key', 'missing', 'no SSH signing key here (git config gpg.format ssh, user.signingkey <key>)');
  else add('signing-key', 'ok', literal ? 'key:: in user.signingkey' : `${pubFile}`);
  // An error body (a 403, a 404) is JSON too: only a list is a list.
  const list = (v) => (Array.isArray(v) ? v : []);
  const registered = list(json(exec('gh', ['api', `users/${login}/ssh_signing_keys`])));
  if (!pub) add('signing-key-on-github', 'missing', 'no local key to look for');
  else if (registered.some((k) => String(k.key).startsWith(pub)))
    add('signing-key-on-github', 'ok', `registered for ${login}`);
  else
    add(
      'signing-key-on-github',
      'missing',
      `not among ${login}'s signing keys on GitHub (Settings → SSH and GPG keys → New SSH key, type Signing)`,
    );
  const signers = join(root, '.github', 'allowed_signers');
  if (!existsSync(signers))
    add(
      'allowed-signers',
      'missing',
      '.github/allowed_signers does not exist (the maintainer adds it, in a commit signed by that key)',
    );
  else if (pub && readFileSync(signers, 'utf8').includes(pub))
    add('allowed-signers', 'ok', 'names the local signing key');
  else add('allowed-signers', 'missing', '.github/allowed_signers does not name the local signing key');

  // The repository: immutable releases, and a ruleset on the release tags.
  const imm = json(exec('gh', ['api', `repos/${repo}/immutable-releases`]));
  add(
    'immutable-releases',
    imm?.enabled ? 'ok' : 'missing',
    imm?.enabled ? 'enabled' : 'disabled (Settings → General → Releases: immutable)',
  );
  const ids = list(json(exec('gh', ['api', `repos/${repo}/rulesets`]))).map((r) => r.id);
  const tagged = ids.map((id) => json(exec('gh', ['api', `repos/${repo}/rulesets/${id}`]))).filter(guardsTags);
  add(
    'tag-ruleset',
    tagged.length ? 'ok' : 'missing',
    tagged.length
      ? `ruleset ${tagged[0].name}`
      : 'no active ruleset on refs/tags/v* refusing creation, deletion and force-push',
  );

  // The candidate: its run, its manifest and its attestation.
  add(
    'candidate',
    candidate.problems.length ? 'blocked' : 'ok',
    candidate.problems.length ? candidate.problems.join('; ') : `run ${candidate.run}: verified`,
  );

  // npm, per package: the archive, the name, the bootstrap, the trusted publisher, the OIDC proof, the version.
  const pkgVersion = version.replace(/-.*$/, '');
  for (const p of packagesFor(pkgVersion)) {
    const tgz = candidate.pack ? join(candidate.pack, `${p}-${pkgVersion}.tgz`) : '';
    if (!tgz || !existsSync(tgz)) add(`${p}:archive`, 'blocked', `the candidate has no ${p}-${pkgVersion}.tgz`);
    else {
      const dry = exec('npm', ['publish', '--dry-run', '--ignore-scripts', tgz]);
      add(
        `${p}:archive`,
        ok(dry) ? 'ok' : 'blocked',
        ok(dry)
          ? 'npm publish --dry-run accepts it'
          : `npm publish --dry-run: ${(dry.stderr || '').trim().split('\n').at(-1)}`,
      );
    }
    const view = exec('npm', ['view', p, 'name', 'maintainers', '--json']);
    const exists = ok(view);
    // Only npm's 404 says the package does not exist; any other failure (network, registry, auth) says nothing about
    // the name (second reading of #122), and nothing else of this package is judged on it.
    if (!exists && !/E404|404 Not Found/.test(`${view.stdout}\n${view.stderr}`)) {
      const why = `${view.stderr || view.stdout || ''}`.trim().split('\n').at(-1) || `exit ${view.status}`;
      add(`${p}:name`, 'blocked', `npm view ${p} failed, the registry said nothing of the name: ${why}`);
      continue;
    }
    if (!exists) {
      add(
        `${p}:name`,
        'ok',
        'available (still watched each night: squatting accepted until npm publishing, a 4.2.x, D34, D38)',
      );
      add(
        `${p}:bootstrap`,
        'missing',
        'the package does not exist: bootstrap by `npm stage publish` of 0.0.0-bootstrap.0 (RELEASING)',
      );
      add(`${p}:trusted-publisher`, 'missing', 'configurable once the package exists');
    } else {
      const names = list(json(view)?.maintainers).map(npmName);
      if (!npmUser)
        add(`${p}:name`, 'missing', `taken by ${names.join(', ')}: whose cannot be told (npm whoami: not logged in)`);
      else if (names.includes(npmUser)) add(`${p}:name`, 'ok', `ours (${npmUser})`);
      else add(`${p}:name`, 'blocked', `taken by someone else: ${names.join(', ')}`);
      add(`${p}:bootstrap`, 'ok', 'the package exists');
      const trust = exec('npm', ['trust', 'list', p, '--json']);
      // One object per configuration; `permissions`: createPackage (may publish), createStagedPackage (may stage).
      const entries = ok(trust) ? jsonObjects(trust.stdout) : [];
      const ours = entries.filter((e) => e.type === 'github' && Object.values(e).includes(repo));
      if (!ours.length)
        add(
          `${p}:trusted-publisher`,
          'missing',
          `no trusted publisher for ${repo} (npm trust github ${p} --repo ${repo} --file release.yml --allow-stage-publish)`,
        );
      else if (entries.some((e) => list(e.permissions).includes('createPackage')))
        add(
          `${p}:trusted-publisher`,
          'blocked',
          'a configuration may publish directly: stage-only is the rule (the maintainer promotes with 2FA)',
        );
      else if (ours.every((e) => list(e.permissions).includes('createStagedPackage')))
        add(`${p}:trusted-publisher`, 'ok', 'configured, stage-only');
      else add(`${p}:trusted-publisher`, 'missing', 'configured, but npm names no permission for it');
    }
    const published = exists && ok(exec('npm', ['view', `${p}@${pkgVersion}`, 'version']));
    add(
      `${p}:version`,
      published ? 'blocked' : 'ok',
      published ? `${p}@${pkgVersion} is already published` : `${pkgVersion} not published yet`,
    );
    const proven = exists && /"provenance"|"attestations"/.test(exec('npm', ['view', p, 'dist', '--json']).stdout);
    add(
      `${p}:oidc`,
      proven ? 'ok' : 'missing',
      proven ? 'a version carries an OIDC provenance' : 'no publication by OIDC proven yet',
    );
  }

  // The publishing step's exact Node and npm.
  const pins = pinsOf(readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8'));
  const bad = pinProblems(pins);
  add(
    'publish-pins',
    bad.length ? 'blocked' : 'ok',
    bad.length ? bad.join('; ') : `Node ${pins.node}, npm ${pins.npm}`,
  );

  // GO / NO-GO against the people's reports of this version.
  const go = readFileSync(join(root, 'docs', 'dev', 'GO-NO-GO-4.2.md'), 'utf8');
  // The last verdict the sheet writes (an older one may stay above it). "GO for 4.2 on a reduced scope" (D38) is the
  // maintainer's decision to ship before the passes, every surface without its pass said limited or experimental
  // (tests/support-truth.test.ts holds the rows to it): not a GO, so no report contradicts it.
  const last = [...go.matchAll(/\*\*(NO-GO|GO) for 4\.2( on a reduced scope)?/g)].at(-1);
  const verdict = last?.[1] === 'GO' && last?.[2] ? 'GO on a reduced scope' : (last?.[1] ?? 'NO-GO');
  const field = join(root, 'docs', 'dev', 'field', version);
  const statuses = existsSync(field)
    ? readdirSync(field)
        .filter((x) => x.endsWith('.json') && x !== 'candidate-manifest.json')
        .map((x) => JSON.parse(readFileSync(join(field, x), 'utf8')).status)
    : [];
  const asked = passesAsked(version).length;
  const passed = statuses.filter((s) => s === 'passed').length;
  const allPassed = statuses.length === asked && passed === asked;
  if (verdict === 'GO' && !allPassed)
    add('go-no-go', 'blocked', `GO, but ${passed}/${asked} passes passed in docs/dev/field/${version}`);
  else if (verdict !== 'GO' && allPassed)
    add('go-no-go', 'missing', 'every pass passed: the GO / NO-GO can be written GO');
  else add('go-no-go', 'ok', `${verdict}, ${passed}/${asked} passes passed`);
  return rows;
}
