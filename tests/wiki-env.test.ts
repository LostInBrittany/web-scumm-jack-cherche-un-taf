// The environment variable register (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.7.4, demonstrator D2 of §13,
// tools/wiki/env.ts): the scan finds `process.env.X`, `process.env['X']`, `import.meta.env.X`, `env.X` on an `env`
// object, Python's reads and a shell script's, never a comment nor an assignment, and flags a computed name; the check
// fails on a variable read and not described, on a described `code` variable read nowhere, on a dynamic read nobody
// resolved, on a platform variable that does not say who sets it; the repository's register agrees with its code and
// the reference page is the one it generates; the Studio Server's dynamic reads are exactly what `takeSecrets` reads.
import { describe, expect, it } from 'vitest';
import { takeSecrets } from '../studio-server/src/server/config';
import { checkWiki, trackedFiles } from '../tools/wiki/check';
import {
  type EnvRegister,
  envAnchor,
  envIdentifiers,
  envPageProblems,
  envProblems,
  envSections,
  readEnvRegister,
  scanCode,
  scanEnv,
  scanPython,
  scanShell,
  scanWorkflow,
  withEnvIdentifiers,
  withEnvSections,
} from '../tools/wiki/env';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WIKI = join(ROOT, 'wiki');
const names = (uses: { name: string }[]) => [...new Set(uses.map((u) => u.name))].sort();

const register = (over: Partial<EnvRegister> = {}): EnvRegister => ({
  format: 'quest-n-click-docs-env',
  version: 1,
  groups: [{ id: 'g', title: { en: 'G', fr: 'G' }, intro: { en: 'Intro.', fr: 'Intro.' } }],
  variables: [
    { name: 'ALPHA', group: 'g', origin: 'code', description: { en: 'Alpha.', fr: 'Alpha.' } },
    {
      name: 'CC_RUN_COMMAND',
      group: 'g',
      origin: 'platform',
      setBy: { en: 'Clever Cloud', fr: 'Clever Cloud' },
      description: { en: 'Run.', fr: 'Lancer.' },
    },
  ],
  dynamic: [],
  ...over,
});

describe('the scan of the code', () => {
  it('finds the named reads, skips comments and assignments, and flags a computed name', () => {
    const src = [
      'const a = process.env.ALPHA ?? "x";',
      "const b = process.env['BETA'];",
      'const c = import.meta.env.VITE_GAMMA;',
      'export const f = (env = process.env) => env.DELTA || env["EPSILON"];',
      '// process.env.IN_A_COMMENT is not read',
      ' * import.meta.env.IN_A_DOC_COMMENT neither',
      'env.SET_FOR_A_CHILD = "1";',
      'if (env.COMPARED == "1") process.env.KEPT ??= "y";',
      'config.env.lowercase; myenv.NOT_AN_ENV;',
      'const d = process.env[name] ?? env[`${n}_FILE`];',
    ].join('\n');
    const r = scanCode('x.ts', src);
    expect(names(r.uses)).toEqual(['ALPHA', 'BETA', 'COMPARED', 'DELTA', 'EPSILON', 'KEPT', 'VITE_GAMMA']);
    expect(r.dynamic.map((d) => d.expression)).toEqual(['process.env[name]', 'env[`${n}_FILE`]']);
    expect(r.dynamic[0]!.line).toBe(10);
  });

  it('reads a destructuring of process.env, never a delete, and flags a rest as dynamic', () => {
    const src = [
      'const { STUDIO_CONFIG, PORT: port, PROOF_CACHE = "1" } = process.env;',
      'const {',
      '  MULTI_LINE,',
      '  ...others',
      '} = process.env;',
      'if (!env.GIT_DIR) delete env.GIT_DIR;',
      'delete process.env.CLEARED;',
    ].join('\n');
    const r = scanCode('x.ts', src);
    expect(names(r.uses)).toEqual(['GIT_DIR', 'MULTI_LINE', 'PORT', 'PROOF_CACHE', 'STUDIO_CONFIG']);
    expect(r.uses.filter((u) => u.name === 'GIT_DIR')).toHaveLength(1);
    expect(r.dynamic.map((d) => [d.expression, d.line])).toEqual([['{ ...others } = process.env', 2]]);
  });

  it("reads a workflow's env: keys, ${{ env.X }}, $GITHUB_ENV lines and its shell, never its expressions", () => {
    const yml = [
      'env:',
      '  TOP_LEVEL: x',
      'jobs:',
      '  a:',
      '    env:',
      '      JOB_LEVEL: ${{ inputs.x }}',
      '      nested:',
      '        NOT_A_KEY: y',
      '    steps:',
      "      - if: ${{ env.MODE == 'release' }}",
      '        run: |',
      '          echo "LEFT=$x" >> "$GITHUB_ENV"',
      '          OWN=1; echo "$OWN $READ ${{ github.SHA_IN_EXPR }}"',
    ].join('\n');
    expect(names(scanWorkflow('.github/workflows/w.yml', yml))).toEqual([
      'GITHUB_ENV',
      'JOB_LEVEL',
      'LEFT',
      'MODE',
      'READ',
      'TOP_LEVEL',
    ]);
  });

  it("reads Python's os.environ and a shell script's variables, minus those the script assigns", () => {
    expect(
      names(scanPython('t.py', "a = os.environ.get('GAME')\nb = os.environ['GAME_DIR']\nc = os.getenv(\"FURNACE\")")),
    ).toEqual(['FURNACE', 'GAME', 'GAME_DIR']);
    const sh = [
      '#!/bin/bash -l',
      '# ${IN_A_COMMENT} is not read',
      'OWN=1',
      '[[ "${STUDIO_BACKUP_CRON:-}" == "1" ]] || exit 0',
      'cd "${APP_HOME:-$ROOT}" && echo $OWN $$ $1',
    ].join('\n');
    expect(names(scanShell('b.sh', sh))).toEqual(['APP_HOME', 'ROOT', 'STUDIO_BACKUP_CRON']);
  });
});

describe('the register against the code', () => {
  const scan = (uses: string[], dynamic: { file: string; expression: string }[] = []) => ({
    uses: uses.map((name) => ({ name, file: 'src/x.ts', line: 1 })),
    dynamic: dynamic.map((d) => ({ ...d, line: 1 })),
  });

  it('agrees when every variable read is described and every code variable is read', () => {
    expect(envProblems(register(), scan(['ALPHA']))).toEqual([]);
  });

  it('fails on a variable read and not described, naming where it is read', () => {
    expect(envProblems(register(), scan(['ALPHA', 'NEW_ONE']))).toEqual([
      expect.stringMatching(/NEW_ONE is read by src\/x\.ts:1 and has no description/),
    ]);
  });

  it('fails on a described code variable the code no longer reads, but not on a platform one', () => {
    expect(envProblems(register(), scan([]))).toEqual([expect.stringMatching(/ALPHA \(code\) is read nowhere/)]);
  });

  it('fails on a platform or add-on variable that does not say who sets it', () => {
    const r = register();
    delete r.variables[1]!.setBy;
    expect(envProblems(r, scan(['ALPHA']))).toEqual([expect.stringMatching(/CC_RUN_COMMAND comes from the platform/)]);
  });

  it('fails on a dynamic read nobody listed, and on a listed one that is gone', () => {
    const d = { file: 'src/x.ts', expression: 'env[name]' };
    expect(envProblems(register(), scan(['ALPHA'], [d]))).toEqual([
      expect.stringMatching(/src\/x\.ts:1 reads a computed name \(env\[name\]\)/),
    ]);
    const listed = register({ dynamic: [{ ...d, reads: ['ALPHA'], note: 'resolved' }] });
    expect(envProblems(listed, scan(['ALPHA'], [d]))).toEqual([]);
    expect(envProblems(listed, scan(['ALPHA']))).toEqual([expect.stringMatching(/env\[name\] of src\/x\.ts is gone/)]);
  });

  it('accepts a secret file variant only when a read resolves to it', () => {
    const r = register();
    r.variables[0]!.fileVariant = true;
    expect(envProblems(r, scan(['ALPHA']))).toEqual([expect.stringMatching(/nothing reads ALPHA_FILE/)]);
    const d = { file: 'src/x.ts', expression: 'env[f]' };
    r.dynamic = [{ ...d, reads: ['ALPHA_FILE'], note: 'the file variant' }];
    expect(envProblems(r, scan(['ALPHA'], [d]))).toEqual([]);
  });
});

describe('the reference page', () => {
  it('gives each variable its own section id, and its origin in each language', () => {
    const s = { uses: [{ name: 'ALPHA', file: 'src/x.ts', line: 3 }], dynamic: [] };
    const en = envSections(register(), s, 'en');
    expect(en).toContain('<a name="alpha"></a>\n\n### `ALPHA`');
    expect(en).toContain('- Read by: [`src/x.ts`](../../src/x.ts).');
    expect(en).toContain('- Origin: set by Clever Cloud.');
    expect(envSections(register(), s, 'fr')).toContain('- Origine : vous la posez ; le code la lit.');
    expect(envAnchor('STUDIO_SESSION_KEY')).toBe('studio-session-key');
    expect(envAnchor('npm_lifecycle_event')).toBe('npm-lifecycle-event');
  });

  it('replaces only what is between its markers, and refuses a page without them', () => {
    const page = 'lead\n<!-- env:begin -->\nold\n<!-- env:end -->\ntail\n';
    expect(withEnvSections(page, '<!-- env:begin -->new<!-- env:end -->').text).toBe(
      'lead\n<!-- env:begin -->new<!-- env:end -->\ntail\n',
    );
    expect(withEnvSections('no markers', 'x').problem).toMatch(/once, around its generated part/);
  });

  it("sets the page's identifiers in the manifest in place, every other byte kept", () => {
    const text = [
      '{',
      '  "pages": [',
      '    {',
      '      "id": "reference.environment-variables",',
      '      "identifiers": ["OLD"],',
      '      "owner": "@wanoo"',
      '    },',
      '    {',
      '      "id": "other.page",',
      '      "identifiers": ["KEEP"]',
      '    }',
      '  ]',
      '}',
    ].join('\n');
    const out = withEnvIdentifiers(text, ['A', 'B']);
    expect(JSON.parse(out).pages.map((p: { identifiers: string[] }) => p.identifiers)).toEqual([['A', 'B'], ['KEEP']]);
    expect(out.split('\n').slice(8).join('\n')).toBe(text.split('\n').slice(5).join('\n'));
  });
});

// A whole \`wiki -- check\` of the repository per case: past a minute on Windows' runners.
describe("the repository's register", { timeout: 300_000 }, () => {
  const { register: real, errors } = readEnvRegister(WIKI);
  const tracked = trackedFiles(ROOT);
  const scanned = scanEnv(ROOT, tracked);

  it('is valid, agrees with the code, and generates the page as it is written', () => {
    expect(errors).toEqual([]);
    expect(envProblems(real!, scanned)).toEqual([]);
    const page = (lang: 'en' | 'fr') => readFileSync(join(WIKI, lang, 'reference.environment-variables.md'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(WIKI, 'manifest.json'), 'utf8')) as {
      pages: { id: string; identifiers: string[] }[];
    };
    const ids = manifest.pages.find((p) => p.id === 'reference.environment-variables')!.identifiers;
    expect(envPageProblems(real!, scanned, { en: page('en'), fr: page('fr') }, ids)).toEqual([]);
    expect(ids).toEqual(envIdentifiers(real!));
    expect(ids).toContain('STUDIO_SESSION_KEY');
  });

  it("resolves the Studio Server's computed reads to exactly what takeSecrets reads", () => {
    const asked = new Set<string>();
    const env = new Proxy({} as NodeJS.ProcessEnv, {
      get: (_t, k) => {
        if (typeof k === 'string') asked.add(k);
        return undefined;
      },
      deleteProperty: () => true,
    });
    takeSecrets(env);
    const listed = real!.dynamic.filter((d) => d.file === 'studio-server/src/server/config.ts').flatMap((d) => d.reads);
    expect([...asked].sort()).toEqual([...new Set(listed)].sort());
  });

  it('makes `wiki -- check` fail when the code reads a variable the register does not describe', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiki-env-'));
    try {
      cpSync(WIKI, tmp, { recursive: true });
      const file = join(tmp, 'data', 'env.json');
      const r = JSON.parse(readFileSync(file, 'utf8')) as EnvRegister;
      r.variables = r.variables.filter((v) => v.name !== 'PYTHON');
      writeFileSync(file, JSON.stringify(r));
      const report = checkWiki({ wikiDir: tmp, tracked, root: ROOT });
      expect(report.errors).toContainEqual(
        'data/env.json: PYTHON is read by cli/quest-n-click.mjs:66 and has no description: add it to the register (npm run wiki -- env)',
      );
      expect(report.errors).toContainEqual(expect.stringMatching(/generated part is not the register's/));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
