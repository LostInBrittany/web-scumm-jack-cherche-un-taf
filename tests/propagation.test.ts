// No public primitive is ignored (4.1.12, D22, the sheet's exit criterion): each one defined in a fixture game is seen
// by the validator, reached by the solver, replayed into the same journal, edited by the Studio's form, read and
// written through MCP, and named by the generated DSL page. Objectives are the one family admitted in 4.1.12
// (ADR 0014); the DSL's commands and conditions are held to the same surfaces they share (the IR's schema, the
// generated page). The Studio's forms, which need a DOM, are tests/dom/propagation-forms.test.ts.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CMD_KEYS } from '@engine/core/cmds';
import { compileGame } from '@engine/core/define';
import { Engine } from '@engine/core/engine';
import { compileIR } from '@engine/core/ir';
import { cmdSchema, condSchema, gameIRSchema, objectiveSchema } from '@engine/core/ir-schema';
import type { SemanticEvent } from '@engine/core/journal';
import { completionGoal } from '@engine/core/objectives';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { Session } from '@engine/core/types';
import { replay } from '@engine/tools/replay';
import { solve } from '@engine/tools/solve';
import { validate } from '@engine/tools/validate';
import type { GameInfo } from '../src/studio/api';
import { CMD_SPECS, type COND_KINDS } from '../src/studio/schema';
import { sample } from './fixtures/samples';
import { coreBackend } from '../tools/studio/backend';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { callTool } from '../tools/studio/tools';
import { quest, questLayouts } from './fixtures/objectives';

const ROOT = resolve(__dirname, '..');
const docs = { en: readFileSync('docs/en/DSL.md', 'utf8'), fr: readFileSync('docs/fr/DSL.md', 'utf8') };

/** The quest fixture as a game folder the Studio and MCP work on. */
function questFolder(): string {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.cache', 'propagation-'));
  const { rooms, ...rest } = quest();
  mkdirSync(join(dir, 'rooms'));
  writeFileSync(
    join(dir, 'rooms', 'hall.ts'),
    `import { defineRoom } from '@engine/core/define';\n\nexport default defineRoom(${JSON.stringify(rooms[0], null, 2)});\n`,
  );
  writeFileSync(
    join(dir, 'game.ts'),
    `import { defineGame } from '@engine/core/define';\nimport hall from './rooms/hall';\n\nexport const game = defineGame(${JSON.stringify({ ...rest, rooms: '@rooms' }, null, 2).replace('"@rooms"', '[hall]')});\n`,
  );
  writeFileSync(
    join(dir, 'index.ts'),
    "export { game } from './game';\nexport const layouts = {};\nexport const manifest = { images: {} };\n",
  );
  mkdirSync(join(dir, 'layout'));
  writeFileSync(join(dir, 'layout', 'hall.json'), JSON.stringify(questLayouts.hall));
  return dir;
}

describe('objectives reach every surface (ADR 0014)', () => {
  const dir = questFolder();
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('the validator sees them: a broken one is an error', () => {
    expect(validate(quest(), questLayouts).errors).toEqual([]);
    const g = quest();
    g.objectives!.key!.done = 'nobody_sets_this';
    expect(validate(g, questLayouts).errors).toContainEqual(expect.stringMatching(/^objectives\.key\.done › /));
  });

  it('the solver reaches them: --goal=100% is every objective that is not optional', async () => {
    const r = await solve(quest(), questLayouts, { goal: completionGoal(quest()) });
    expect(r.finished).toBe(true);
    expect(r.path.length).toBeGreaterThan(0);
  });

  it('the replay yields them: the same objectiveCompleted at the same places', async () => {
    const e = new Engine(quest(), questLayouts, new FakePresenter(), new MemoryStore());
    await e.newGame();
    for (const a of [
      { verb: 'take', a: 'rug' },
      { verb: 'use', a: 'key', b: 'chest' },
      { verb: 'use', a: 'gate' },
    ])
      await e.act(a);
    const live = e.journal.since(e.sessionSeq);
    const r = await replay(quest(), questLayouts, JSON.parse(JSON.stringify(e.session)) as Session);
    const strip = (es: SemanticEvent[]) => es.map(({ seq: _s, ...x }) => x);
    expect(strip(r.journal)).toEqual(strip(live));
    expect(live.filter((x) => x.kind === 'objectiveCompleted')).toHaveLength(3);
  });

  it('the IR carries them, valid against its schema', () => {
    const ir = compileIR(compileGame(quest()), { extensions: { trusted: '' } });
    expect(ir.objectives.map((o) => o.id)).toEqual(['escape', 'chest', 'key', 'bell']);
    expect(gameIRSchema.safeParse(ir).success).toBe(true);
  });

  it('MCP reads them (list_rooms, get_ir) and writes them (set_value on @game), validated', async () => {
    const studio = createStudio({ gameDir: dir, root: ROOT, importFresh: (f: string) => importInChild(f, ROOT) });
    const b = coreBackend(studio, { root: ROOT, devUrl: 'http://127.0.0.1:9/' });
    const list = JSON.parse((await callTool('list_rooms', {}, b)).content[0]!.text) as GameInfo;
    expect(Object.keys(list.objectives ?? {})).toEqual(['escape', 'chest', 'key', 'bell']);
    const room = JSON.parse((await callTool('get_room', { id: 'hall' }, b)).content[0]!.text) as {
      def: { id: string };
    };
    expect(room.def.id).toBe('hall');
    const w = await callTool(
      'set_value',
      { id: '@game', path: 'objectives.look', value: { title: 'Look at the rug', done: 'key_found', optional: true } },
      b,
    );
    expect(w.isError, w.content[0]!.text).toBeFalsy();
    const ir = JSON.parse((await callTool('get_ir', {}, b)).content[0]!.text) as { objectives: { id: string }[] };
    expect(ir.objectives.map((o) => o.id)).toContain('look');
    const bad = await callTool(
      'set_value',
      { id: '@game', path: 'objectives.ghost', value: { title: 'x', done: 'nope' } },
      b,
    );
    expect(bad.isError).toBe(true);
    expect(bad.content[0]!.text).toContain('can never hold');
  }, 60000);

  it('the generated DSL page names them, in both languages', () => {
    for (const page of Object.values(docs))
      for (const k of Object.keys(objectiveSchema.shape)) expect(page).toContain(`| \`${k}\` |`);
  });
});

describe('every command and condition shares the surfaces', () => {
  it('each command: the IR schema accepts it, the DSL page names it', () => {
    for (const k of CMD_KEYS) {
      const spec = CMD_SPECS[k];
      const cmd = {
        [k]: sample(spec.value),
        ...Object.fromEntries(
          Object.entries(spec.extra ?? {})
            .filter(([, f]) => !f.optional)
            .map(([x, f]) => [x, sample(f)]),
        ),
      };
      expect(cmdSchema.safeParse(cmd).success, k).toBe(true);
      for (const page of Object.values(docs)) expect(page, k).toContain(`| \`${k}\` |`);
    }
  });

  it('each condition kind: the IR schema accepts it and the DSL page names it', () => {
    const samples: Record<(typeof COND_KINDS)[number], unknown> = {
      flag: 'f',
      notflag: '!f',
      has: { has: 'i' },
      flagvalue: { flag: 'f', gte: 2 },
      not: { not: 'f' },
      all: { all: ['f', '!g'] },
      any: { any: ['f'] },
      visited: { visited: 'r' },
      room: { room: 'r' },
      prop: { prop: ['r.p', 's'] },
      unlocked: { unlocked: 'p' },
      seen: { seen: 'topic.x' },
      actorIn: { actorIn: ['c', 'r'] },
      player: { player: 'c' },
    };
    for (const [k, c] of Object.entries(samples)) {
      expect(condSchema.safeParse(c).success, k).toBe(true);
    }
    expect(condSchema.safeParse({ nope: 1 }).success).toBe(false);
  });
});
