// The Studio and MCP write objectives (4.1.12, ADR 0014): set_value with `id: "@game"` edits the game file's
// `defineGame({...})` as code, for `objectives` only; a dry run shows the diff, a write that adds a validation error
// (a `done` that can never hold) is taken back, undo restores, list_rooms shows them.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createStudio, GAME_FILE_ID, importInChild } from '../studio-server/src/ops/core';
import { setValueInSource } from '../studio-server/src/ops/source';

const ROOT = resolve(__dirname, '..');
mkdirSync(join(ROOT, '.cache'), { recursive: true });
const dir = mkdtempSync(join(ROOT, '.cache', 'studio-objectives-'));
cpSync(join(ROOT, 'games', 'demo'), dir, {
  recursive: true,
  filter: (src) => !/[\\/](art|audio|private)([\\/]|$)/.test(src.slice(join(ROOT, 'games', 'demo').length)),
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const studio = createStudio({ gameDir: dir, root: ROOT, importFresh: (f: string) => importInChild(f, ROOT) });
const gameTs = () => readFileSync(join(dir, 'game.ts'), 'utf8');

describe('objectives as code in the game file', () => {
  it('writes into defineGame({...}), not a room', () => {
    const code =
      "export const game = defineGame({\n  id: 'g',\n  objectives: {\n    a: { title: 'A', done: 'x' },\n  },\n});\n";
    const r = setValueInSource(code, 'objectives.b', { title: 'B', done: 'y', parent: 'a' }, 'game.ts', 'defineGame');
    expect(r.code).toContain("b: { title: 'B', done: 'y', parent: 'a' }");
    expect(() => setValueInSource(code, 'objectives.b', {}, 'game.ts')).toThrow(/no defineRoom/);
  });

  it('set_value on @game: dry run, write, refusal of an objective that can never complete, undo', async () => {
    expect(GAME_FILE_ID).toBe('@game');
    const value = { title: 'Ring the bell', done: 'tank_drained', optional: true };
    const dry = await studio.setValue('@game', 'objectives.extra', value, { dry: true });
    expect(dry.diff).toContain("+    extra: { title: 'Ring the bell', done: 'tank_drained', optional: true },");
    expect(gameTs()).not.toContain('extra:');
    const w = await studio.setValue('@game', 'objectives.extra', value);
    expect(w.changed).toBe(true);
    expect(gameTs()).toContain("extra: { title: 'Ring the bell'");
    expect((await studio.gameInfo()).objectives?.extra).toEqual(value);
    // A field of one objective.
    await studio.setValue('@game', 'objectives.extra.title', 'Ring it');
    expect(gameTs()).toContain("title: 'Ring it'");
    // Validated after the write: a `done` that can never hold is refused and taken back.
    const bad = await studio
      .setValue('@game', 'objectives.ghost', { title: 'Ghost', done: 'never_set_anywhere' })
      .catch((e: unknown) => e);
    expect((bad as { status?: number }).status).toBe(422);
    expect(String((bad as Error).message)).toContain('objectives.ghost.done › can never hold');
    expect(gameTs()).not.toContain('ghost');
    // Only objectives: the rest of the game file is not this tool's to write.
    const other = await studio.setValue('@game', 'title', 'Other').catch((e: unknown) => e);
    expect(String((other as Error).message)).toMatch(/only "objectives"/);
    // Undo takes back the field, then the objective.
    await studio.undo();
    await studio.undo();
    expect(gameTs()).not.toContain('extra:');
  }, 60000);

  it('the IR the Language tab and get_ir read: the objectives with the line that writes them', async () => {
    const ir = await studio.ir();
    expect(ir.objectives.map((o) => o.id)).toEqual(['guess', 'key', 'tank', 'lou', 'pantry']);
    const at = ir.provenance['objective:pantry'];
    expect(at?.file).toMatch(/studio-objectives-[^/]+\/game\.ts$/);
    expect(gameTs().split('\n')[at!.line - 1]).toContain('pantry:');
    expect(ir.extensions.trusted).toMatch(/^[0-9a-f]{64}$/);
  });
});
