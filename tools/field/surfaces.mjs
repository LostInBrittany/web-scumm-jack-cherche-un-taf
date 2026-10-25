#!/usr/bin/env node
// node tools/field/surfaces.mjs --dir=<candidate-release> [--root=.] --out=<qualification-surfaces.json> (4.1.20 PR 4,
// docs/dev/PLAN-4.1.20-LAST-MILE.md §9.2, ADR 0024): what each people's pass is bound to, for one candidate. From the
// files the candidate's manifest will list (under --dir) and the built site's own files (site/site-files.json), each
// surface of docs/dev/surfaces.json gets the SHA-256 of the files it reads (its exclusions left out), the digest of the
// checkout's configuration it reads, its exclusions and dependencies, and a digest of all of it. A file in no surface
// and not under `status` fails: nothing public goes unclassified. Plain Node, no dependency: the gate runs it before it
// writes the manifest, so the surfaces are attested with the files.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectOf } from '../release/artifacts.mjs';
import { filesUnder } from '../release/candidate.mjs';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
/** A JSON value with its keys sorted at every level: the bytes a digest is taken over. */
export const stable = (v) =>
  Array.isArray(v)
    ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
          .join(',')}}`
      : JSON.stringify(v);

// A glob of the declaration as a regular expression: `**` then a slash, any folders or none (as workbox reads it);
// `**` any path; `*` within a segment.
export const globRe = (g) =>
  new RegExp(
    `^${g
      .split('**/')
      .join('\u0000')
      .split('**')
      .map((p) =>
        p
          .split('*')
          .map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]*'),
      )
      .join('.*')
      .replaceAll('\u0000', '(?:.*/)?')}$`,
  );

/** The README's install section, as the PR 4 markers delimit it, in both languages: what `readme:install` reads. */
export function readmeInstall(root) {
  const part = (f) => {
    const s = readFileSync(join(root, f), 'utf8');
    const a = s.indexOf('<!-- install:begin -->');
    const b = s.indexOf('<!-- install:end -->');
    if (a < 0 || b < a) throw new Error(`${f}: no <!-- install:begin --> … <!-- install:end --> section`);
    return s.slice(a, b);
  };
  return `${part('README.md')}\n${part('README.fr.md')}`;
}

/** The digest of what a surface reads from the checkout: each config glob's files (and `readme:install`), sorted. */
export function configDigest(globs, root, files) {
  const parts = [];
  for (const g of globs) {
    if (g === 'readme:install') parts.push(['readme:install', sha256(readmeInstall(root))]);
    else {
      const re = globRe(g);
      const hit = files.filter((f) => re.test(f)).sort();
      if (!hit.length) throw new Error(`config ${g}: no file in the checkout`);
      for (const f of hit) parts.push([f, sha256(readFileSync(join(root, f)))]);
    }
  }
  return sha256(stable(parts));
}

/**
 * The surfaces of one candidate. `candidate`: its files (path → SHA-256, as its manifest names them); `site`: the built
 * site's (path → SHA-256); `declared`: docs/dev/surfaces.json; `version`: the package version (`{pkg}`); `config`:
 * (globs) → digest. Throws on a file no surface and no status entry classifies.
 */
export function surfacesOf({ candidate, site, declared, version, config }) {
  const pkg = version.replace(/-.*$/, '');
  const all = {
    ...candidate,
    ...Object.fromEntries(Object.entries(site).map(([p, d]) => [`site:${p}`, d])),
  };
  // `{proj}`: the name the release's own files start with, quest-n-click from 4.2.5 (D47), web-scumm before.
  const fill = (g) => g.replaceAll('{pkg}', pkg).replaceAll('{proj}', projectOf(pkg));
  const claimed = new Set();
  // A surface whose pass came later (`since`, 4.2.1) is not one of an older candidate.
  const atLeast = (a, b) => {
    const [x, y] = [a, b].map((v) => v.replace(/-.*$/, '').split('.').map(Number));
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return true;
  };
  const surfaces = Object.entries(declared.surfaces)
    .filter(([, s]) => !s.since || atLeast(version, s.since))
    .map(([id, s]) => {
      const take = s.artifacts.map((g) => globRe(fill(g)));
      const drop = s.exclusions.map((e) => globRe(fill(e.path)));
      const artifactDigests = {};
      for (const [name, digest] of Object.entries(all).sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (!take.some((r) => r.test(name))) continue;
        claimed.add(name);
        if (drop.some((r) => r.test(name))) continue;
        artifactDigests[name] = digest;
      }
      for (const g of s.artifacts)
        if (!Object.keys(all).some((n) => globRe(fill(g)).test(n)))
          throw new Error(`${id}: ${g} names no file of this candidate`);
      const surface = {
        id,
        artifactDigests,
        configDigest: config(s.config),
        exclusions: s.exclusions,
        dependencies: s.dependencies,
      };
      return { ...surface, surfaceDigest: sha256(stable(surface)) };
    });
  const status = declared.status.map((e) => globRe(fill(e.path)));
  const loose = Object.keys(all).filter((n) => !claimed.has(n) && !status.some((r) => r.test(n)));
  if (loose.length)
    throw new Error(`in no surface and not under status (docs/dev/surfaces.json): ${loose.slice(0, 10).join(', ')}`);
  return { format: 'web-scumm-qualification-surfaces', schema: 1, version, surfaces };
}

const flag = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = flag('dir');
  const out = flag('out');
  const root = flag('root') ?? '.';
  if (!dir || !out) {
    console.error('usage: node tools/field/surfaces.mjs --dir=<candidate-release> --out=<file> [--root=.]');
    process.exit(2);
  }
  const candidate = Object.fromEntries(
    filesUnder(dir)
      .filter((f) => !f.startsWith('surfaces/'))
      .map((f) => [f, sha256(readFileSync(join(dir, f)))]),
  );
  const site = Object.fromEntries(
    JSON.parse(readFileSync(join(dir, 'site', 'site-files.json'), 'utf8')).files.map((f) => [f.path, f.sha256]),
  );
  // The checkout's own files (git's list: never node_modules or a build).
  const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const r = surfacesOf({
    candidate,
    site,
    declared: JSON.parse(readFileSync(join(root, 'docs', 'dev', 'surfaces.json'), 'utf8')),
    version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
    config: (globs) => configDigest(globs, root, tracked),
  });
  writeFileSync(out, `${JSON.stringify(r, null, 1)}\n`);
  console.log(
    `✔  ${r.surfaces.length} surfaces of ${Object.keys(candidate).length} candidate files and ${Object.keys(site).length} site files`,
  );
}
