// The official contents are at this engine's authoring format (4.1.12, D22): `web-scumm migrate --check` (tools/migrate.ts)
// finds nothing due in the sample game, the reference chapter, the template and the signals game, and each of them
// validates. 4.1.12 changes no authoring format, so no step was added to `migrate`: this test is what tells the next
// release that adds one whether the official contents follow it (`npm run upgrade-check` does the same for a project
// made on the previous release, in CI).
import { describe, expect, it } from 'vitest';
import { runTool } from './run-tool';

describe('the official contents need no migration', () => {
  for (const game of ['demo', 'reference', '_template', 'signals'])
    it(`${game}: migrate --check finds it up to date`, () => {
      const r = runTool(['tools/migrate.ts', '--check'], { env: { ...process.env, GAME: game } });
      expect(r.status, r.stderr + r.stdout).toBe(0);
      expect(r.stdout).toContain(`[${game}] authoring schema 3: up to date`);
    });

  it('a game still on schema 2 is said due, and nothing is written', () => {
    const r = runTool(['tools/migrate.ts', '--check'], {
      env: { ...process.env, GAME_DIR: 'tests/fixture', GAME: '' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/authoring schema 2: a migration to 3 is due/);
  });
});
