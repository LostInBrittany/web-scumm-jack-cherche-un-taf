#!/usr/bin/env node
// npm run locks (4.1.19, plan §6.1): makes the versioned locks of the Bridge, the connectors and the qualification image
// (scripts/pack-manifests.mjs) from the root's package-lock.json: each manifest written in a scratch folder beside a
// copy of the root lock, then `npm install --package-lock-only`, which keeps every version the root lock already
// resolved and drops the rest. Run it when a dependency of those packages changes; review the diff; commit it.
// `npm run locks -- --check` (and tests/pack-locks.test.ts) says whether each lock still fits its manifest and the
// root lock, without the network. A package the root lock does not resolve is pinned in OUTSIDE_ROOT below.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LOCKED, lockProblems } from './pack-manifests.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const rootLock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));

/**
 * The packages a lock holds that the root lock does not resolve (second reading of 4.1.19 PR 2): the connectors' native
 * optionals, which the root replaces by a stand-in (`overrides`), and OpenTelemetry's API, which the repository does
 * not install. Each is pinned here: `npm run locks` that moves one fails its check until this list is changed too.
 */
const OUTSIDE_ROOT = {
  '@quest-n-click/connectors:node_modules/buildcheck': '0.0.7',
  '@quest-n-click/connectors:node_modules/ssh2/node_modules/cpu-features': '0.0.10',
  '@quest-n-click/connectors:node_modules/ssh2/node_modules/nan': '2.29.0',
  'quest-n-click-bridge-image:node_modules/@opentelemetry/api': '1.9.1',
};

/** What is wrong with a versioned lock: against its manifest, then a version the root lock resolves otherwise. */
export function problems(entry, lock = JSON.parse(readFileSync(join(ROOT, entry.lock), 'utf8'))) {
  const manifest = entry.manifest(root);
  const bad = lockProblems(lock, { ...manifest, name: entry.name });
  for (const [path, p] of Object.entries(lock.packages ?? {})) {
    if (!path) continue;
    const there = rootLock.packages[path];
    if (there && !there.link) {
      if (there.version !== p.version)
        bad.push(`${path}: ${p.version} here, ${there.version} in the root lock (npm run locks)`);
      continue;
    }
    // Not in the root lock (or a stand-in there): its version is written here, reviewed, and a new one is a diff.
    const pinned = OUTSIDE_ROOT[`${entry.name}:${path}`];
    if (pinned !== p.version)
      bad.push(
        `${path}: ${p.version} is not in the root lock and not pinned in scripts/locks.mjs (${pinned ?? 'none'})`,
      );
  }
  return bad;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('locks.mjs')) {
  if (process.argv.includes('--check')) {
    let n = 0;
    for (const e of LOCKED) for (const b of problems(e)) console.error(`✖  ${e.lock}: ${b}`), n++;
    if (!n) console.log(`✔  ${LOCKED.length} locks fit their manifests and the root lock`);
    process.exit(n ? 1 : 0);
  }
  const WIN = process.platform === 'win32';
  for (const e of LOCKED) {
    const dir = mkdtempSync(join(tmpdir(), 'locks-'));
    try {
      writeFileSync(join(dir, 'package.json'), `${JSON.stringify(e.manifest(root), null, 2)}\n`);
      copyFileSync(join(ROOT, 'package-lock.json'), join(dir, 'package-lock.json'));
      execFileSync(
        WIN ? 'npm.cmd' : 'npm',
        ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
        {
          cwd: dir,
          stdio: ['ignore', 'ignore', 'inherit'],
          shell: WIN,
        },
      );
      const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
      // Only what an install of this manifest takes: the root's own folders (a vendored stand-in) left out.
      for (const k of Object.keys(lock.packages)) if (k && !k.startsWith('node_modules/')) delete lock.packages[k];
      // The version is the release's, set by pack: the versioned lock does not change at each release.
      lock.version = '0.0.0';
      lock.packages[''].version = '0.0.0';
      writeFileSync(join(ROOT, e.lock), `${JSON.stringify(lock, null, 2)}\n`);
      const bad = problems(e, lock);
      console.log(
        `${bad.length ? '✖' : '✔'}  ${e.lock}: ${Object.keys(lock.packages).length - 1} packages${bad.length ? `: ${bad.join('; ')}` : ''}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
