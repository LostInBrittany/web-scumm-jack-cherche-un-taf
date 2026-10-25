// The manifests scripts/pack.mjs writes (4.5.2, D53): the scoped names, public, with what a provenance publish needs.
// `@quest-n-click/create` is also what the unscoped `create-quest-n-click` relays to: published on an owner's account,
// its command does `await import('@quest-n-click/create/index.mjs')`, so `npx create-quest-n-click my-game` keeps
// working. The relay depends on `index.mjs` at the package's root and on no `exports` map closing that subpath.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import * as manifests from '../scripts/pack-manifests.mjs';

const root = JSON.parse(readFileSync('package.json', 'utf8'));

describe('the packages’ manifests (D53)', () => {
  it('names each package under the scope, public, with its repository and engines', () => {
    const all = [
      manifests.createManifest(root),
      manifests.bridgeManifest(root),
      manifests.connectorsManifest(root),
      manifests.studioServerManifest(root),
    ];
    expect(all.map((m) => m.name)).toEqual([
      '@quest-n-click/create',
      '@quest-n-click/bridge',
      '@quest-n-click/connectors',
      '@quest-n-click/studio-server',
    ]);
    for (const m of all) {
      expect(m.publishConfig, m.name).toEqual({ access: 'public' });
      expect(m.repository?.url, m.name).toBe('git+https://github.com/Quest-n-Click/quest-n-click.git');
      expect(m.engines, m.name).toEqual(root.engines);
    }
    expect(manifests.createManifest(root).dependencies).toEqual({ '@quest-n-click/engine': root.version });
  });

  it('keeps @quest-n-click/create/index.mjs importable: the create-quest-n-click relay imports it', () => {
    const m = manifests.createManifest(root);
    // The relay imports this exact subpath: the command at the root, and no `exports` map that would close it.
    expect(m.bin).toEqual({ 'create-quest-n-click': 'index.mjs' });
    expect(m.exports).toBeUndefined();
    expect(readFileSync('scripts/pack.mjs', 'utf8')).toContain("join(create, 'index.mjs')");
    // Resolved as Node resolves it from the relay's package.
    const dir = mkdtempSync(join(tmpdir(), 'qnc-relay-'));
    try {
      const pkg = join(dir, 'node_modules', '@quest-n-click', 'create');
      mkdirSync(pkg, { recursive: true });
      writeFileSync(join(pkg, 'package.json'), JSON.stringify(m));
      writeFileSync(join(pkg, 'index.mjs'), "console.log('created');\n");
      writeFileSync(join(dir, 'relay.mjs'), "await import('@quest-n-click/create/index.mjs');\n");
      expect(execFileSync(process.execPath, [join(dir, 'relay.mjs')], { cwd: dir, encoding: 'utf8' })).toBe(
        'created\n',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
