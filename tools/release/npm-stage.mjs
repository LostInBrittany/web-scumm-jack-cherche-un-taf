#!/usr/bin/env node
// node tools/release/npm-stage.mjs --tag=<vX.Y.Z[-pre]> --dir=<folder> --repo=<owner/name> (4.5.2, #283, D34): the
// release's npm packages **staged** on the registry by npm trusted publishing (OIDC, no token, provenance), for an
// owner of the organisation to promote with 2FA (`npm stage approve <id>`). Run by release.yml's `npm-stage` job on
// the very archives the release carries (downloaded from it, checked against its SHA256SUMS). It never runs
// `npm publish`, never uses a token, approves nothing.
//
// - A stable tag stages each archive with `--tag latest`, engine first (`@quest-n-click/create` depends on its exact
//   version). A version already published is skipped; one already staged is skipped on npm's 409 (a staged version
//   cannot be told without a token: `npm stage list` refuses an OIDC token).
// - A pre-release tag (`v4.5.2-rc.1`) stages nothing: its archives carry the stable version (`4.5.2`), which the stable
//   tag must stage. It rehearses instead: `npm stage publish --dry-run` through OIDC, which proves the trusted
//   publisher answers this workflow, and sends nothing.
// - A tag before 4.5.2 (D53) packed unscoped names, which are never published: nothing to do.
//
// The run summary lists what was staged and the commands an owner runs, in order. `exec(cmd, args)` runs npm and tar,
// so tests give it fakes.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGES, SCOPED } from './artifacts.mjs';

const parts = (v) => v.split('.').map(Number);
const atLeast = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return true;
};
const isPre = (v) => v.includes('-');

/**
 * The dist-tag a package version is staged under for a tag: `next` for a pre-release package version (npm refuses one
 * without `--tag`), `latest` for a stable version of a stable tag, `null` when a pre-release tag carries a stable
 * version (staging it would take the stable tag's version number).
 */
export function distTagFor(tagVersion, pkgVersion) {
  if (isPre(pkgVersion)) return 'next';
  return isPre(tagVersion) ? null : 'latest';
}

/** The `npm` arguments for one archive: staged, never published; `--dry-run` for a rehearsal. */
export function stageArgs(file, distTag, { dryRun = false } = {}) {
  return [
    'stage',
    'publish',
    file,
    '--provenance',
    '--access',
    'public',
    '--tag',
    distTag,
    '--loglevel',
    'verbose',
    ...(dryRun ? ['--dry-run'] : []),
  ];
}

/** What would let npm authenticate otherwise than by OIDC: a token in the environment or in an `.npmrc`. */
export function tokenProblems(env, npmrcs) {
  const bad = [];
  for (const [k, v] of Object.entries(env))
    if (
      v &&
      /^(NODE_AUTH_TOKEN|NPM_TOKEN|npm_config_(_auth|_authtoken|token)|npm_config_\/\/.*:_auth(token)?)$/i.test(k)
    )
      bad.push(`${k} is set: no token here, npm authenticates by OIDC only`);
  for (const [file, text] of Object.entries(npmrcs))
    if (/(^|\n)\s*[^#;\n]*_auth(Token)?\s*=/.test(text)) bad.push(`${file} holds an auth token: no token here`);
  return bad;
}

/** The trusted publisher's command for a package, and why it may be missing. */
export const trustHint = (name, repo) =>
  `npm trust github ${name} --repo ${repo} --file release.yml --allow-stage-publish (an owner, with 2FA; a new configuration expires unless it stages within two days: run it just before the tag)`;

/**
 * The plan for a tag: which archives, under which names and dist-tag, and what is wrong with them. `read(file)` is the
 * archive's package.json, parsed. `mode`: `stage`, `rehearse` (a pre-release tag) or `skip` (before 4.5.2).
 */
export function plan({ tag, dir, repo, read }) {
  const version = tag.replace(/^v/, '');
  const pkgVersion = version.replace(/-.*$/, '');
  if (!atLeast(pkgVersion, SCOPED))
    return {
      mode: 'skip',
      why: `${tag} predates the scoped names (${SCOPED}, D53): nothing of it goes to npm`,
      items: [],
      problems: [],
    };
  const problems = [];
  const items = PACKAGES.map((p) => {
    const file = resolve(dir, `${p.name}-${pkgVersion}.tgz`);
    const item = { archive: `${p.name}-${pkgVersion}.tgz`, file, name: p.npm, version: pkgVersion };
    if (!existsSync(file)) {
      problems.push(`${item.archive}: not among the release's files`);
      return item;
    }
    let m;
    try {
      m = read(file);
    } catch (e) {
      problems.push(`${item.archive}: no readable package/package.json (${e.message})`);
      return item;
    }
    if (m.name !== p.npm) problems.push(`${item.archive}: names ${m.name}, not ${p.npm}`);
    if (m.version !== pkgVersion) problems.push(`${item.archive}: version ${m.version}, not ${pkgVersion}`);
    if (m.private) problems.push(`${item.archive}: private`);
    const url = `git+https://github.com/${repo}.git`;
    // npm refuses a provenance whose repository is not the workflow's.
    if (m.repository?.url !== url)
      problems.push(`${item.archive}: repository ${m.repository?.url ?? 'missing'}, not ${url} (provenance needs it)`);
    item.version = m.version ?? pkgVersion;
    item.engineDep = m.dependencies?.['@quest-n-click/engine'];
    return item;
  });
  const create = items.find((i) => i.name === '@quest-n-click/create');
  if (create?.engineDep !== undefined && create.engineDep !== pkgVersion)
    problems.push(`${create.archive}: depends on @quest-n-click/engine ${create.engineDep}, not exactly ${pkgVersion}`);
  const distTag = distTagFor(version, pkgVersion);
  for (const i of items) i.distTag = distTag ?? 'next';
  return {
    mode: distTag ? 'stage' : 'rehearse',
    why: distTag
      ? `stage ${items.length} packages under ${distTag}`
      : `${tag} is a pre-release whose archives carry ${pkgVersion}, the stable version: rehearsed (dry run through OIDC), nothing staged`,
    items,
    problems,
  };
}

const text = (r) => `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
const lastLine = (s) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^npm (verb|http|info|sill|timing)\b/.test(l))
    .at(-1) ?? '';
/** npm's answer when no credential reached it: OIDC did not give one (no trusted publisher for this workflow). */
const NO_AUTH = /ENEEDAUTH|requires you to be logged in|Unable to authenticate/;

/**
 * Stages (or rehearses) every item in order, stopping at the first failure. Each result: `staged` (with its `id`),
 * `published` (already on npm: skipped), `already-staged` (npm's 409: skipped), `rehearsed`, or `failed`.
 */
export function stageAll({ exec, plan: p, repo }) {
  const results = [];
  for (const i of p.items) {
    const spec = `${i.name}@${i.version}`;
    const viewed = () => {
      const v = exec('npm', ['view', spec, 'version']);
      if (v.status === 0 && v.stdout.trim() === i.version) return 'published';
      if (v.status === 0 || /E404|404 Not Found/.test(text(v))) return 'absent';
      return `npm view ${spec}: ${lastLine(text(v)) || `exit ${v.status}`}`;
    };
    const before = viewed();
    if (before === 'published') {
      results.push({ ...i, state: 'published' });
      continue;
    }
    if (before !== 'absent') {
      results.push({ ...i, state: 'failed', why: `${before} (the registry said nothing of the version)` });
      break;
    }
    const rehearse = p.mode === 'rehearse';
    const r = exec('npm', stageArgs(i.file, i.distTag, { dryRun: rehearse }));
    const out = text(r);
    if (rehearse) {
      // A dry run without a credential only warns: OIDC gave none, so the trusted publisher would refuse.
      if (r.status === 0 && !NO_AUTH.test(out)) results.push({ ...i, state: 'rehearsed' });
      else
        results.push({
          ...i,
          state: 'failed',
          why: NO_AUTH.test(out)
            ? `OIDC gave no credential for ${i.name}: no trusted publisher for this workflow. ${trustHint(i.name, repo)}`
            : `npm stage publish --dry-run: ${lastLine(out) || `exit ${r.status}`}`,
        });
      if (results.at(-1).state === 'failed') break;
      continue;
    }
    if (r.status === 0) {
      results.push({ ...i, state: 'staged', id: /\(staged with id ([^\s)]+)\)/.exec(out)?.[1] ?? null });
      continue;
    }
    if (/You cannot publish over the previously published versions/.test(out) || viewed() === 'published') {
      results.push({ ...i, state: 'published' });
      continue;
    }
    if (/\bE409\b|\b409\b/.test(out)) {
      // Not published, refused as a conflict: staged by an earlier run (a staged version holds its number).
      results.push({ ...i, state: 'already-staged', why: lastLine(out) });
      continue;
    }
    results.push({
      ...i,
      state: 'failed',
      why: NO_AUTH.test(out)
        ? `OIDC gave no credential for ${i.name}: no trusted publisher for this workflow, or it expired unused. ${trustHint(i.name, repo)}`
        : /\bE40[13]\b/.test(out)
          ? `the registry refused ${spec}: ${lastLine(out)}. The trusted publisher must allow staging: ${trustHint(i.name, repo)}`
          : `npm stage publish ${i.archive}: ${lastLine(out) || `exit ${r.status}`}`,
    });
    break;
  }
  return results;
}

/** The run summary: what was done to each package, then what an owner runs, in order. */
export function summary({ tag, plan: p, results, problems = [], runSha, tagSha }) {
  const lines = [`## npm: ${tag}`, ''];
  if (p.mode === 'skip') return [...lines, p.why, ''].join('\n');
  lines.push(p.why, '');
  if (problems.length) lines.push('**Stopped before npm:**', '', ...problems.map((x) => `- ${x}`), '');
  if (results.length) {
    lines.push('| Package | Version | Dist-tag | State |', '|---|---|---|---|');
    const say = {
      staged: (r) => (r.id ? `staged, id \`${r.id}\`` : 'staged (no id printed: `npm stage list`)'),
      published: () => 'already published: skipped',
      'already-staged': () => 'already staged by an earlier run (409): skipped',
      rehearsed: () => 'rehearsed: OIDC accepted, nothing sent',
      failed: (r) => `**failed**: ${r.why}`,
    };
    for (const r of results) lines.push(`| \`${r.name}\` | ${r.version} | ${r.distTag} | ${say[r.state](r)} |`);
    lines.push('');
  }
  const pending = results.filter((r) => r.state === 'staged' || r.state === 'already-staged');
  if (pending.length) {
    lines.push(
      'An owner of the npm organisation `quest-n-click` publishes them with 2FA, **in this order** (the engine first:',
      '`@quest-n-click/create` depends on its exact version):',
      '',
      '```sh',
      '# anywhere, signed in to npm as an owner (npm 11.15.0 or later)',
    );
    for (const r of pending)
      lines.push(
        r.state === 'staged' && r.id
          ? `npm stage approve ${r.id}   # ${r.name}@${r.version}`
          : `npm stage list ${r.name}   # then: npm stage approve <the id of ${r.version}>`,
      );
    lines.push('```', '');
    lines.push(
      // Since 4.5.3 (#291) release.yml runs on the tag's push: the provenance names the tag and its commit.
      `Before approving, \`npm stage view <id>\` shows each one. Provenance names \`release.yml\` at \`refs/tags/${tag}\`${runSha ? `, commit \`${runSha.slice(0, 12)}\`` : ''}${tagSha && runSha && tagSha !== runSha ? ` (**not the tag's \`${tagSha.slice(0, 12)}\`**: do not approve)` : ''}: release.yml runs on the tag's push.`,
      '',
    );
  }
  return lines.join('\n');
}

function main() {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const tag = arg('tag');
  const dir = arg('dir');
  const repo = arg('repo') ?? process.env.GITHUB_REPOSITORY;
  if (!tag || !dir || !repo) {
    console.error(
      'usage: node tools/release/npm-stage.mjs --tag=<vX.Y.Z> --dir=<folder of the .tgz> --repo=<owner/name>',
    );
    process.exit(2);
  }
  const exec = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (cmd === 'npm') process.stdout.write(`$ npm ${args.join(' ')}\n${r.stdout ?? ''}${r.stderr ?? ''}\n`);
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  const npmrcs = {};
  for (const f of [join(homedir(), '.npmrc'), resolve('.npmrc'), process.env.NPM_CONFIG_USERCONFIG].filter(Boolean))
    if (existsSync(f)) npmrcs[f] = readFileSync(f, 'utf8');
  const read = (file) => {
    const r = exec('tar', ['-xzOf', file, 'package/package.json']);
    if (r.status !== 0) throw new Error(r.stderr.trim() || `tar exit ${r.status}`);
    return JSON.parse(r.stdout);
  };
  const p = plan({ tag, dir, repo, read });
  const problems = [...tokenProblems(process.env, npmrcs), ...p.problems];
  const results = p.mode === 'skip' || problems.length ? [] : stageAll({ exec, plan: p, repo });
  const md = summary({ tag, plan: p, results, problems, runSha: process.env.GITHUB_SHA, tagSha: arg('sha') });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  console.log(md);
  if (p.mode === 'skip') console.log(`::notice::${p.why}`);
  for (const x of problems) console.log(`::error::${x}`);
  for (const r of results.filter((x) => x.state === 'failed')) console.log(`::error::${r.why}`);
  process.exit(problems.length || results.some((r) => r.state === 'failed') ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
