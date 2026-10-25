// The versioned locks (4.1.19, plan §6.1): the Bridge, the connectors and the qualification image are installed from
// locks kept in this repository (scripts/locks/), made from the root lock by `npm run locks` and copied by pack into
// each archive as npm-shrinkwrap.json. Each lock fits the manifest pack writes, resolves from the npm registry only,
// and gives every package the version the root lock gives it; a range changed without its lock stops pack.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs scripts without declarations
import { LOCKED, lockFor, lockProblems } from '../scripts/pack-manifests.mjs';
// @ts-expect-error: plain .mjs scripts without declarations
import { problems } from '../scripts/locks.mjs';

const root = JSON.parse(readFileSync('package.json', 'utf8'));
type Entry = { name: string; manifest: (r: unknown) => Record<string, unknown>; lock: string };
const read = (e: Entry) => JSON.parse(readFileSync(e.lock, 'utf8'));

describe('the versioned locks', () => {
  it.each(LOCKED as Entry[])('$name fits its manifest and the root lock', (e) => {
    expect(problems(e)).toEqual([]);
  });

  it('a package the root lock does not resolve is pinned here, and moves only with a reviewed change', () => {
    const connectors = (LOCKED as Entry[]).find((e) => e.name === '@quest-n-click/connectors')!;
    const lock = read(connectors);
    lock.packages['node_modules/ssh2/node_modules/nan'].version = '2.30.0';
    expect(problems(connectors, lock).join()).toMatch(/nan: 2\.30\.0 is not in the root lock and not pinned/);
    lock.packages['node_modules/left-pad'] = { ...lock.packages['node_modules/asn1'], version: '1.3.0' };
    expect(problems(connectors, lock).join()).toMatch(/left-pad: 1\.3\.0 is not in the root lock/);
  });

  it('the image installs its peers at exact, locked versions', () => {
    const image = (LOCKED as Entry[]).find((e) => e.name === 'quest-n-click-bridge-image')!;
    const lock = read(image);
    for (const dep of ['pg', '@opentelemetry/api', 'zod', '@biscuit-auth/biscuit-wasm'])
      expect(lock.packages[`node_modules/${dep}`]?.version, dep).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('refuses a range changed without its lock, a package from elsewhere, a link', () => {
    const bridge = (LOCKED as Entry[]).find((e) => e.name === '@quest-n-click/bridge')!;
    const manifest = bridge.manifest(root);
    const lock = read(bridge);
    expect(lockProblems(lock, manifest)).toEqual([]);
    const moved = { ...manifest, dependencies: { ...(manifest.dependencies as object), zod: '^5.0.0' } };
    expect(lockProblems(lock, moved).join()).toMatch(/dependencies/);
    const elsewhere = structuredClone(lock);
    elsewhere.packages['node_modules/zod'].resolved = 'file:../zod.tgz';
    expect(lockProblems(elsewhere, manifest).join()).toMatch(/node_modules\/zod: resolved file:/);
    const linked = structuredClone(lock);
    linked.packages['node_modules/zod'] = { link: true, resolved: 'vendor/zod' };
    expect(lockProblems(linked, manifest).join()).toMatch(/a link/);
    expect(lockProblems({ lockfileVersion: 2 }, manifest)).toEqual(['not a lockfile of version 3']);
  });

  it('a lock takes the release’s name and version only, nothing resolved again', () => {
    const bridge = (LOCKED as Entry[]).find((e) => e.name === '@quest-n-click/bridge')!;
    const manifest = bridge.manifest(root);
    const lock = read(bridge);
    const out = lockFor(lock, manifest);
    expect([out.version, out.packages[''].version]).toEqual([root.version, root.version]);
    const { '': _, ...deps } = out.packages;
    const { '': __, ...before } = lock.packages;
    expect(deps).toEqual(before);
  });
});
