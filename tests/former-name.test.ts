// The project's former name (4.2.5, D47): web-scumm is now quest-n-click. Through 4.2.x the old names were aliases;
// 4.3.0 removes them (D47, D48): no `web-scumm` command, no `web-scumm/…` import, no package packed under the old name.
// `quest-n-click migrate` renames what a game project of 4.2.x or before still says (tools/migrate-name.ts), and the
// formats keep their names. 4.5.2 (D53): the packages are scoped (`@quest-n-click/engine`…), the commands keep their
// names, and `migrate` moves the unscoped imports and dependencies of 4.5.1 and before the same way.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import * as manifests from '../scripts/pack-manifests.mjs';
import {
  FORMER_PACKAGES,
  renameImports,
  renamePackageJson,
  renameProject,
  renameTsconfig,
  sourcesIn,
  UNSCOPED_PACKAGES,
} from '../tools/migrate-name';

const root = JSON.parse(readFileSync('package.json', 'utf8'));

describe('the former name, web-scumm, gone in 4.3.0', () => {
  it('has no command, no import path and no build alias left', () => {
    expect(existsSync('cli/web-scumm.mjs')).toBe(false);
    const paths = JSON.parse(readFileSync('tsconfig.json', 'utf8')).compilerOptions.paths;
    expect(Object.keys(paths).filter((k) => k.includes('web-scumm'))).toEqual([]);
    for (const f of ['vite.config.ts', 'studio-server/src/worker/preview-build.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).toContain('/^(?:@quest-n-click\\/engine|quest-n-click)\\/(content|player|minigames|testing)$/');
      expect(s, f).not.toContain('|web-scumm)');
    }
  });

  it('packs each package under its own name only, its commands the new ones', () => {
    expect(manifests.aliasManifest).toBeUndefined();
    for (const m of [
      manifests.bridgeManifest(root),
      manifests.connectorsManifest(root),
      manifests.studioServerManifest(root),
    ]) {
      expect(m.name).toMatch(/^@quest-n-click\//);
      expect(JSON.stringify(m.bin), m.name).not.toContain('web-scumm');
      expect(Object.keys(m.peerDependencies ?? {}).join(), m.name).not.toContain('web-scumm');
    }
    // The mutation tool resolves the repository's own imports by the new name only.
    expect(readFileSync('tools/mutate.ts', 'utf8')).not.toContain('web-scumm');
    const pack = readFileSync('scripts/pack.mjs', 'utf8');
    expect(pack).not.toMatch(/create-web-scumm|bin-web-scumm|oldCommand|aliasManifest|'web-scumm'/);
    for (const f of ['quest-n-click-bridge', 'quest-n-click-connectors', 'quest-n-click-studio-server'])
      expect(readFileSync(`scripts/locks/${f}.json`, 'utf8'), f).not.toContain('web-scumm');
  });

  it('imports the engine by its scoped name everywhere in the repository (D53)', () => {
    const tracked = execFileSync('git', ['ls-files', 'games', 'cli', 'scripts', 'tools', 'src', 'studio-server'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => /\.(?:[cm]?[jt]s|tsx)$/.test(f) && f !== 'tools/migrate-name.ts' && existsSync(f));
    expect(tracked.length).toBeGreaterThan(100);
    const left = tracked.filter((f) => renameImports(readFileSync(f, 'utf8')) !== null);
    expect(left).toEqual([]);
  });

  it('creates a project under the engine package’s own name', () => {
    const create = readFileSync('cli/create.mjs', 'utf8');
    expect(create).toContain(
      "const { name: PACKAGE, version } = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));",
    );
    expect(create).toContain('dependencies: { [PACKAGE]: engine }');
    // The repository is the engine's package itself (D53): a project made from it depends on the scoped name.
    expect(root.name).toBe('@quest-n-click/engine');
    for (const f of ['game.ts', 'index.ts', 'items.ts', 'rules.ts', 'cast.ts', 'rooms/start.ts'])
      expect(readFileSync(`games/_template/${f}`, 'utf8'), f).not.toMatch(/from 'web-scumm\//);
  });
});

describe('quest-n-click migrate and the former name', () => {
  it('renames the imports in either quote style, and nothing that only starts like them', () => {
    expect(renameImports("import { defineGame } from 'web-scumm/content';\n")).toBe(
      "import { defineGame } from '@quest-n-click/engine/content';\n",
    );
    expect(renameImports('import type { M } from "web-scumm/minigames";\nawait import(\'web-scumm/testing\');')).toBe(
      'import type { M } from "@quest-n-click/engine/minigames";\nawait import(\'@quest-n-click/engine/testing\');',
    );
    // The formats keep their names (D47): a save envelope, a storage key, a variable, a URL.
    for (const kept of [
      "const f = 'web-scumm-save';",
      "localStorage.getItem('web-scumm.settings');",
      'process.env.WEB_SCUMM_PROJECT',
      "fetch('https://wanoo.github.io/web-scumm/')",
      "import { x } from '@quest-n-click/engine/content';",
      "import { b } from '@quest-n-click/bridge/cli';",
    ])
      expect(renameImports(kept), kept).toBeNull();
  });

  it('renames the unscoped imports of 4.5.1 and before to the scoped packages (D53), and no command', () => {
    expect(renameImports("import { defineGame } from 'quest-n-click/content';\n")).toBe(
      "import { defineGame } from '@quest-n-click/engine/content';\n",
    );
    expect(
      renameImports(
        'import type { M } from "quest-n-click/minigames";\nconst b = await import(\'quest-n-click-bridge/cli\');',
      ),
    ).toBe(
      'import type { M } from "@quest-n-click/engine/minigames";\nconst b = await import(\'@quest-n-click/bridge/cli\');',
    );
    for (const kept of [
      // A command in a script, the repository's address, an archive, a format: no `/` after a package name.
      "spawn('npx', ['quest-n-click', 'dev']);",
      "const u = 'https://github.com/Quest-n-Click/quest-n-click/wiki';",
      "const a = 'quest-n-click-4.5.1.tgz';",
      "const f = 'quest-n-click-save';",
      "const c = 'quest-n-click-connector';",
    ])
      expect(renameImports(kept), kept).toBeNull();
    // Idempotent: a second pass changes nothing.
    expect(renameImports(renameImports("import a from 'quest-n-click/testing';")!)).toBeNull();
    // Every former package has a scoped name of the organisation.
    for (const now of [...Object.values(UNSCOPED_PACKAGES), ...Object.values(FORMER_PACKAGES)])
      expect(now).toMatch(/^@quest-n-click\/(engine|create|bridge|connectors|studio-server)$/);
  });

  it("renames a project tsconfig's paths and includes", () => {
    const before = {
      compilerOptions: {
        paths: {
          '@engine/*': ['./node_modules/web-scumm/src/engine/*'],
          'web-scumm/*': ['./node_modules/web-scumm/src/engine/api/*'],
          '@game': ['./game/index.ts'],
        },
      },
      include: ['game', 'node_modules/web-scumm/src/env.d.ts'],
    };
    const scoped = {
      compilerOptions: {
        paths: {
          '@engine/*': ['./node_modules/@quest-n-click/engine/src/engine/*'],
          '@quest-n-click/engine/*': ['./node_modules/@quest-n-click/engine/src/engine/api/*'],
          '@game': ['./game/index.ts'],
        },
      },
      include: ['game', 'node_modules/@quest-n-click/engine/src/env.d.ts'],
    };
    expect(JSON.parse(renameTsconfig(JSON.stringify(before, null, 2))!)).toEqual(scoped);
    // A project of 4.2.5 to 4.5.1, as `quest-n-click create` made it then (D53).
    const unscoped = JSON.stringify(before).replaceAll('web-scumm', 'quest-n-click');
    expect(JSON.parse(renameTsconfig(unscoped)!)).toEqual(scoped);
    expect(renameTsconfig(JSON.stringify(scoped))).toBeNull();
    expect(renameTsconfig(JSON.stringify({ include: ['game'] }))).toBeNull();
  });

  it("renames package.json's commands, drops a former dependency the new one replaces, says the rest", () => {
    const pkg = {
      name: 'keeper',
      scripts: {
        dev: 'web-scumm dev',
        bridge: 'web-scumm-bridge serve && web-scumm-connector email --config c.json',
        studio: 'WEB_SCUMM_LAN=1 web-scumm studio',
        save: 'cp web-scumm-save.json out/',
        'web-scumm': 'web-scumm',
      },
      dependencies: { '@quest-n-click/engine': 'file:quest-n-click-4.5.2.tgz', 'web-scumm': '^4.2.5' },
      devDependencies: { 'web-scumm-bridge': '^4.2.5' },
    };
    const r = renamePackageJson(`${JSON.stringify(pkg, null, 2)}\n`);
    const after = JSON.parse(r.text!);
    expect(after.scripts).toEqual({
      dev: 'quest-n-click dev',
      bridge: 'quest-n-click-bridge serve && quest-n-click-connector email --config c.json',
      studio: 'WEB_SCUMM_LAN=1 quest-n-click studio',
      save: 'cp web-scumm-save.json out/',
      'quest-n-click': 'quest-n-click',
    });
    expect(after.dependencies).toEqual({ '@quest-n-click/engine': 'file:quest-n-click-4.5.2.tgz' });
    expect(after.devDependencies).toEqual({ 'web-scumm-bridge': '^4.2.5' });
    expect(r.todo).toEqual([
      'package.json depends on web-scumm-bridge: npm uninstall web-scumm-bridge && npm install @quest-n-click/bridge',
    ]);
    const done = {
      name: 'g',
      scripts: { dev: 'quest-n-click dev', 'quest-n-click': 'quest-n-click' },
      dependencies: { '@quest-n-click/engine': '4.5.2' },
    };
    expect(renamePackageJson(JSON.stringify(done))).toEqual({ text: null, todo: [] });
  });

  it('drops an unscoped dependency of 4.5.1 and before its scoped name replaces, says the rest, keeps the commands (D53)', () => {
    const pkg = {
      name: 'keeper',
      scripts: { dev: 'quest-n-click dev', bridge: 'quest-n-click-bridge serve', 'quest-n-click': 'quest-n-click' },
      dependencies: {
        '@quest-n-click/engine': 'file:quest-n-click-4.5.2.tgz',
        'quest-n-click':
          'https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.5.1/quest-n-click-4.5.1.tgz',
      },
      devDependencies: { 'quest-n-click-bridge': 'file:quest-n-click-bridge-4.5.1.tgz' },
    };
    const r = renamePackageJson(`${JSON.stringify(pkg, null, 2)}\n`);
    const after = JSON.parse(r.text!);
    // The commands keep their names: nothing in the scripts moves.
    expect(after.scripts).toEqual(pkg.scripts);
    expect(after.dependencies).toEqual({ '@quest-n-click/engine': 'file:quest-n-click-4.5.2.tgz' });
    expect(after.devDependencies).toEqual(pkg.devDependencies);
    expect(r.todo).toEqual([
      'package.json depends on quest-n-click-bridge: npm uninstall quest-n-click-bridge && npm install @quest-n-click/bridge',
    ]);
  });

  it('finds every file of a project to rename, outside node_modules, builds and hidden folders, and writes them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qnc-former-'));
    try {
      const put = (f: string, s: string) => {
        mkdirSync(join(dir, f, '..'), { recursive: true });
        writeFileSync(join(dir, f), s);
      };
      const imp = "import { defineGame } from 'web-scumm/content';\n";
      put('game/game.ts', imp);
      put('game/rooms/start.ts', imp);
      put('game/items.ts', "import type { ItemDef } from '@quest-n-click/engine/content';\n");
      put('make-save.ts', "import { solve } from 'web-scumm/testing';\n");
      put('node_modules/web-scumm/x.ts', imp);
      put('dist/a.js', imp);
      put('.cache/a.ts', imp);
      put(
        'tsconfig.json',
        '{ "compilerOptions": { "paths": { "web-scumm/*": ["./node_modules/web-scumm/src/engine/api/*"] } } }\n',
      );
      put('package.json', `${JSON.stringify({ name: 'k', scripts: { dev: 'web-scumm dev' } }, null, 2)}\n`);
      expect(sourcesIn(dir)).toEqual(['game/game.ts', 'game/items.ts', 'game/rooms/start.ts', 'make-save.ts']);
      const want = ['game/game.ts', 'game/rooms/start.ts', 'make-save.ts', 'tsconfig.json', 'package.json'];
      expect(renameProject(dir, { write: false })).toEqual({ files: want, todo: [] });
      expect(readFileSync(join(dir, 'game/game.ts'), 'utf8')).toBe(imp);
      expect(renameProject(dir, { write: true }).files).toEqual(want);
      expect(readFileSync(join(dir, 'game/game.ts'), 'utf8')).toContain("from '@quest-n-click/engine/content'");
      expect(readFileSync(join(dir, 'tsconfig.json'), 'utf8')).toContain('"@quest-n-click/engine/*"');
      expect(readFileSync(join(dir, 'tsconfig.json'), 'utf8')).toContain('./node_modules/@quest-n-click/engine/src');
      expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts.dev).toBe('quest-n-click dev');
      expect(readFileSync(join(dir, 'node_modules/web-scumm/x.ts'), 'utf8')).toBe(imp);
      expect(renameProject(dir, { write: false })).toEqual({ files: [], todo: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a package.json's indentation and byte order mark, and says a script name both names hold", () => {
    const tabs = `\uFEFF${JSON.stringify({ name: 'k', scripts: { dev: 'web-scumm dev' } }, null, '\t')}\n`;
    expect(renamePackageJson(tabs).text).toBe(
      `\uFEFF${JSON.stringify({ name: 'k', scripts: { dev: 'quest-n-click dev' } }, null, '\t')}\n`,
    );
    const four = `${JSON.stringify({ scripts: { dev: 'web-scumm dev' } }, null, 4)}\n`;
    expect(renamePackageJson(four).text).toBe(
      `${JSON.stringify({ scripts: { dev: 'quest-n-click dev' } }, null, 4)}\n`,
    );
    const both = { scripts: { 'web-scumm': 'web-scumm', 'quest-n-click': 'quest-n-click --x', dev: 'web-scumm dev' } };
    const r = renamePackageJson(JSON.stringify(both));
    expect(JSON.parse(r.text!).scripts).toEqual({
      'web-scumm': 'web-scumm',
      'quest-n-click': 'quest-n-click --x',
      dev: 'quest-n-click dev',
    });
    expect(r.todo).toEqual([
      'package.json has both a web-scumm and a quest-n-click script: the web-scumm one is left as it is',
    ]);
  });

  it('follows a symbolic link inside the project, and names one that leads out, never calling the project clean', () => {
    const base = mkdtempSync(join(tmpdir(), 'qnc-links-'));
    try {
      const dir = join(base, 'p');
      const imp = "import { defineGame } from 'web-scumm/content';\n";
      mkdirSync(join(dir, 'game', 'shared'), { recursive: true });
      mkdirSync(join(base, 'elsewhere'), { recursive: true });
      writeFileSync(join(dir, 'game', 'shared', 'a.ts'), imp);
      writeFileSync(join(base, 'elsewhere', 'b.ts'), imp);
      symlinkSync(join(dir, 'game', 'shared'), join(dir, 'game', 'linked'), 'dir');
      symlinkSync(join(base, 'elsewhere'), join(dir, 'game', 'outside'), 'dir');
      symlinkSync(join(base, 'nowhere'), join(dir, 'game', 'dangling.ts'));
      const todo: string[] = [];
      // The linked folder is the shared one: its file once, by its first path.
      expect(sourcesIn(dir, todo)).toEqual(['game/linked/a.ts']);
      expect(todo).toEqual([
        'game/dangling.ts: a symbolic link that leads nowhere, not renamed',
        'game/outside: a symbolic link out of the project, not renamed (rename what it leads to by hand)',
      ]);
      const r = renameProject(dir, { write: true });
      expect(r.files).toEqual(['game/linked/a.ts']);
      expect(r.todo).toHaveLength(2);
      expect(readFileSync(join(dir, 'game', 'shared', 'a.ts'), 'utf8')).toContain('@quest-n-click/engine/content');
      expect(readFileSync(join(base, 'elsewhere', 'b.ts'), 'utf8')).toBe(imp);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('runs before the game is loaded, then again in a new process', () => {
    const m = readFileSync('tools/migrate.ts', 'utf8');
    expect(m.indexOf('renameProject(PROJECT')).toBeGreaterThan(0);
    expect(m.indexOf('renameProject(PROJECT')).toBeLessThan(m.indexOf('await loadGameModule()'));
  });
});
