// `ship preflight-stable --candidate=<run>` (4.1.20 PR 3b, docs/dev/PLAN-4.1.20-LAST-MILE.md §11.1–11.2): what 4.2
// stable still needs, said check by check. It signs nothing, publishes nothing and changes no setting. Each check is
// `ok`, `missing` (a step still to take: the npm bootstrap, a setting to turn on, a proof not made yet; listed, not an
// error) or `blocked` (something wrong: a candidate that does not verify, a version already published, a pin that is
// a range, a GO / NO-GO the reports contradict). `exec(cmd, args)` runs gh, npm and git, so tests give it fakes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PACKAGES as NAMED, RENAMED, SCOPED } from './artifacts.mjs';

/** The exact Node and npm of the staging step (release.yml's `npm-stage` env): npm 11.15.0 at least for `npm stage`. */
export const MINIMUM = { node: '22.14.0', npm: '11.15.0' };
/** The packages' archives, by their names since 4.2.5 (D47); their former names are only aliases, never published. */
export const PACKAGES = NAMED.map((p) => p.name);
/** The names npm carries the packages under since 4.5.2 (D53): the organisation's scope, which owns them. */
export const NPM_NAMES = NAMED.map((p) => p.npm);
/**
 * The unscoped name that stays a live package (D53): `create-quest-n-click`, published on an owner's account as a relay
 * whose command imports `@quest-n-click/create/index.mjs`, so `npx create-quest-n-click my-game` keeps working. Never
 * deprecated.
 */
export const RELAY = 'create-quest-n-click';
/** The other unscoped names (4.2.5 to 4.5.1): reserved by an owner, deprecated, pointing to the scoped ones (D53). */
export const POINTERS = NAMED.map((p) => p.name).filter((n) => n !== RELAY);
/**
 * The npm users who own the organisation `quest-n-click` (D53): a name one of them publishes is ours. Exact user
 * names, never a prefix. A list kept here because npm does not show an organisation's members without a token
 * (`GET /-/org/quest-n-click/user` answers `{}` anonymously, 24 Oct 2026), and CI has none. Both co-maintainers own it
 * (wanoo since 25 Oct 2026); the nightly's `OWNERS` (.github/workflows/nightly.yml) follows this list.
 */
export const OWNERS = ['lostinbrittany', 'wanoo'];
/**
 * The packages of a release (`4.2.1`, `4.2.1-rc.1`), each from the first release it is part of (an older candidate is
 * judged without it), under the name that release packed it: quest-n-click… from 4.2.5, web-scumm… before.
 */
export const packagesFor = (version) => {
  const v = version.replace(/-.*$/, '');
  return NAMED.filter((p) => !p.since || atLeast(v, p.since)).map((p) => (atLeast(v, RENAMED) ? p.name : p.old));
};

/** The name npm carries an archive's package under for a release: the scoped one from 4.5.2 (D53), else the archive's. */
export const npmNameFor = (archive, version) =>
  atLeast(version.replace(/-.*$/, ''), SCOPED) ? (NAMED.find((p) => p.name === archive)?.npm ?? archive) : archive;

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

/** The workflow npm trusts to stage (D34): release.yml, its `npm-stage` job. */
export const WORKFLOW = 'release.yml';

/** What is wrong with release.yml's npm step: absent, a direct `npm publish`, or a token. */
export function stepProblems(releaseYml) {
  const code = releaseYml
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
  const bad = [];
  if (!/^ {2}npm-stage:$/m.test(code) || !code.includes('node tools/release/npm-stage.mjs'))
    bad.push('no npm-stage job running tools/release/npm-stage.mjs');
  if (/npm publish(?! --dry-run)/.test(code)) bad.push('npm publish: CI stages, an owner publishes (D34)');
  if (/NODE_AUTH_TOKEN|NPM_TOKEN|_authToken/.test(code)) bad.push('a token: npm authenticates by OIDC only');
  return bad;
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

  // npm, per package: the archive, the name, the bootstrap, the trusted publisher, the OIDC proof, the version. The
  // archive by its file name; the rest by the name npm carries it under (the organisation's scope from 4.5.2, D53).
  const pkgVersion = version.replace(/-.*$/, '');
  /** A name is ours when one of the organisation's owners publishes it, or the npm user logged in here. */
  const oursOf = (names) => names.filter((n) => OWNERS.includes(n) || (npmUser && n === npmUser));
  for (const p of packagesFor(pkgVersion)) {
    const n = npmNameFor(p, pkgVersion);
    const tgz = candidate.pack ? join(candidate.pack, `${p}-${pkgVersion}.tgz`) : '';
    if (!tgz || !existsSync(tgz)) add(`${p}:archive`, 'blocked', `the candidate has no ${p}-${pkgVersion}.tgz`);
    else {
      const dry = exec('npm', ['publish', '--dry-run', '--ignore-scripts', tgz]);
      add(
        `${p}:archive`,
        ok(dry) ? 'ok' : 'blocked',
        ok(dry)
          ? `npm publish --dry-run accepts it${n === p ? '' : ` (${n})`}`
          : `npm publish --dry-run: ${(dry.stderr || '').trim().split('\n').at(-1)}`,
      );
    }
    const view = exec('npm', ['view', n, 'name', 'maintainers', '--json']);
    const exists = ok(view);
    // Only npm's 404 says the package does not exist; any other failure (network, registry, auth) says nothing about
    // the name (second reading of #122), and nothing else of this package is judged on it.
    if (!exists && !/E404|404 Not Found/.test(`${view.stdout}\n${view.stderr}`)) {
      const why = `${view.stderr || view.stdout || ''}`.trim().split('\n').at(-1) || `exit ${view.status}`;
      add(`${n}:name`, 'blocked', `npm view ${n} failed, the registry said nothing of the name: ${why}`);
      continue;
    }
    if (!exists) {
      add(
        `${n}:name`,
        'ok',
        'available (still watched each night; a scoped name exists once an owner bootstraps it, D53)',
      );
      add(
        `${n}:bootstrap`,
        'missing',
        'the package does not exist: bootstrap by `npm stage publish` of 0.0.0-bootstrap.0 (RELEASING)',
      );
      add(`${n}:trusted-publisher`, 'missing', 'configurable once the package exists');
    } else {
      const names = list(json(view)?.maintainers).map(npmName);
      const ours = oursOf(names);
      if (ours.length) add(`${n}:name`, 'ok', `ours (${ours.join(', ')})`);
      else if (!npmUser)
        add(
          `${n}:name`,
          'missing',
          `taken by ${names.join(', ')}, none of the owners (${OWNERS.join(', ')}): whose cannot be told (npm whoami: not logged in)`,
        );
      else add(`${n}:name`, 'blocked', `taken by someone else: ${names.join(', ')}`);
      add(`${n}:bootstrap`, 'ok', 'the package exists');
      const trust = exec('npm', ['trust', 'list', n, '--json']);
      // One object per configuration; `permissions`: createPackage (may publish), createStagedPackage (may stage).
      const entries = ok(trust) ? jsonObjects(trust.stdout) : [];
      const mine = entries.filter((e) => e.type === 'github' && Object.values(e).includes(repo));
      // The workflow that stages is release.yml (its `npm-stage` job): npm checks the workflow's file name.
      const staging = mine.filter((e) => e.file === WORKFLOW || Object.values(e).includes(WORKFLOW));
      const hint = `npm trust github ${n} --repo ${repo} --file ${WORKFLOW} --allow-stage-publish; a new configuration expires unless it stages within two days: just before the tag`;
      if (!mine.length) add(`${n}:trusted-publisher`, 'missing', `no trusted publisher for ${repo} (${hint})`);
      else if (!staging.length)
        add(`${n}:trusted-publisher`, 'missing', `a trusted publisher for ${repo}, none on ${WORKFLOW} (${hint})`);
      else if (entries.some((e) => list(e.permissions).includes('createPackage')))
        add(
          `${n}:trusted-publisher`,
          'blocked',
          'a configuration may publish directly: stage-only is the rule (the maintainer promotes with 2FA)',
        );
      else if (staging.every((e) => list(e.permissions).includes('createStagedPackage')))
        add(`${n}:trusted-publisher`, 'ok', 'configured, stage-only');
      else add(`${n}:trusted-publisher`, 'missing', 'configured, but npm names no permission for it');
    }
    const published = exists && ok(exec('npm', ['view', `${n}@${pkgVersion}`, 'version']));
    add(
      `${n}:version`,
      published ? 'blocked' : 'ok',
      published ? `${n}@${pkgVersion} is already published` : `${pkgVersion} not published yet`,
    );
    const proven = exists && /"provenance"|"attestations"/.test(exec('npm', ['view', n, 'dist', '--json']).stdout);
    add(
      `${n}:oidc`,
      proven ? 'ok' : 'missing',
      proven ? 'a version carries an OIDC provenance' : 'no publication by OIDC proven yet',
    );
    // The unscoped name it had (D53): reserved by an owner, deprecated toward the scoped package, so nobody else
    // publishes under it. Taken by someone else blocks; free, not deprecated, or unknown is a step still to take.
    // `create-quest-n-click` is the exception: a relay, an owner's and never deprecated.
    if (n !== p && p === RELAY) {
      const pv = exec('npm', ['view', p, 'name', 'maintainers', 'deprecated', '--json']);
      if (!ok(pv)) {
        const free = /E404|404 Not Found/.test(`${pv.stdout}\n${pv.stderr}`);
        const why = `${pv.stderr || pv.stdout || ''}`.trim().split('\n').at(-1) || `exit ${pv.status}`;
        add(
          `${p}:relay`,
          'missing',
          free
            ? `not published: the relay to ${n} (its command imports ${n}/index.mjs) from an owner's account (D53)`
            : `npm view ${p} failed, the registry said nothing of the name: ${why}`,
        );
      } else {
        const names = list(json(pv)?.maintainers).map(npmName);
        if (!oursOf(names).length) add(`${p}:relay`, 'blocked', `taken by someone else: ${names.join(', ')}`);
        else if (json(pv)?.deprecated)
          add(`${p}:relay`, 'missing', `deprecated, but it is the relay to ${n}: npm deprecate ${p} "" (D53)`);
        else add(`${p}:relay`, 'ok', `ours, the relay to ${n}`);
      }
    } else if (n !== p) {
      const pv = exec('npm', ['view', p, 'name', 'maintainers', 'deprecated', '--json']);
      if (!ok(pv)) {
        const free = /E404|404 Not Found/.test(`${pv.stdout}\n${pv.stderr}`);
        const why = `${pv.stderr || pv.stdout || ''}`.trim().split('\n').at(-1) || `exit ${pv.status}`;
        add(
          `${p}:pointer`,
          'missing',
          free
            ? `not reserved: publish 0.0.1 from an owner's account, then npm deprecate ${p} "moved to ${n}" (D53)`
            : `npm view ${p} failed, the registry said nothing of the name: ${why}`,
        );
      } else {
        const names = list(json(pv)?.maintainers).map(npmName);
        const deprecated = json(pv)?.deprecated;
        if (!oursOf(names).length) add(`${p}:pointer`, 'blocked', `taken by someone else: ${names.join(', ')}`);
        else if (!deprecated)
          add(`${p}:pointer`, 'missing', `ours, not deprecated: npm deprecate ${p} "moved to ${n}" (D53)`);
        else add(`${p}:pointer`, 'ok', `ours, deprecated: ${String(deprecated).slice(0, 120)}`);
      }
    }
  }

  // The publishing step: release.yml stages through tools/release/npm-stage.mjs, never publishes; its exact Node and npm.
  const yml = readFileSync(join(root, '.github', 'workflows', WORKFLOW), 'utf8');
  const step = stepProblems(yml);
  add(
    'publish-step',
    step.length ? 'blocked' : 'ok',
    step.length ? step.join('; ') : 'release.yml stages each package (npm stage publish, OIDC), never publishes',
  );
  const pins = pinsOf(yml);
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
