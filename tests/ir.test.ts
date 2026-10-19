// The game's intermediate representation (core/ir.ts, 4.1.12, ADR 0013): the logic of a compiled game as plain data,
// deterministic, with the provenance of its ids, every field of the content classified once (core/ir-fields.ts), and
// checked by its own schema (core/ir-schema.ts).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@engine/core/canonical';
import { compileGame } from '@engine/core/define';
import { compileIR, IR_SCHEMA_VERSION, logicView, provenanceOf, type GameIR } from '@engine/core/ir';
import { FIELD_CLASSES } from '@engine/core/ir-fields';
import { gameIRSchema } from '@engine/core/ir-schema';
import type { GameDef } from '@engine/core/types';
import { game as demo, commands as demoCommands } from '../games/demo';
import { game as reference } from '../games/reference';
import { game as signals } from '../games/signals';
import { randomGame } from './gen/random-game';
import { runTool } from './run-tool';

const NO_EXT = { extensions: { trusted: '' } };
const ir = (g: GameDef, o: Parameters<typeof compileIR>[1] = NO_EXT): GameIR => compileIR(compileGame(g), o);

/** Every .ts file of a game folder, as `games/<id>/…` → text (what `npm run ir` hands to the provenance). */
function sources(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d).sort()) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        if (!['art', 'audio', 'layout', 'locales', 'playtests', 'private', 'tests'].includes(e)) walk(p);
      } else if (e.endsWith('.ts')) out[relative(process.cwd(), p).split(sep).join('/')] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

describe('compileIR', () => {
  const bundled: [string, GameDef][] = [
    ['demo', demo],
    ['reference', reference],
    ['signals', signals],
  ];
  for (const [name, g] of bundled)
    it(`${name}: deterministic (two compilations, the same canonical text) and valid against the schema`, () => {
      const a = ir(structuredClone(g));
      const b = ir(structuredClone(g));
      expect(canonicalJson(a)).toBe(canonicalJson(b));
      expect(a.schema).toBe(IR_SCHEMA_VERSION);
      expect(a.variant).toEqual({ mode: 'story' });
      const parsed = gameIRSchema.safeParse(a);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
    });

  it('fifty generated games: deterministic and valid', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const a = ir(randomGame(seed).game);
      const b = ir(randomGame(seed).game);
      expect(canonicalJson(a), `seed ${seed}`).toBe(canonicalJson(b));
      expect(gameIRSchema.safeParse(a).success, `seed ${seed}`).toBe(true);
    }
  });

  it('carries the logic of the sample game: every rule, topic, listener, script, entity and checkpoint', () => {
    const r = ir(demo, { extensions: { trusted: 'x', commands: demoCommands } });
    const ids = new Set(r.rules.map((x) => x.id).filter(Boolean));
    for (const room of demo.rooms) {
      for (const rule of room.on ?? []) expect(ids, rule.id).toContain(rule.id);
      for (const topics of Object.values(room.talk ?? {})) for (const t of topics) expect(ids).toContain(t.id);
      for (const e of room.events ?? []) expect(ids).toContain(e.id);
      for (const p of Object.keys(room.props ?? {})) expect(r.entities.map((x) => x.key)).toContain(`${room.id}.${p}`);
      expect(r.scripts.map((s) => s.id)).toContain(`${room.id}.enter`);
    }
    for (const e of demo.events ?? []) expect(ids).toContain(e.id);
    for (const it of Object.keys(demo.items)) expect(r.entities.map((x) => x.key)).toContain(`item:${it}`);
    for (const c of Object.keys(demo.characters)) expect(r.entities.map((x) => x.key)).toContain(`char:${c}`);
    expect(Object.keys(r.world.checkpoints)).toEqual(Object.keys(demo.checkpoints ?? {}));
    expect(r.scripts.map((s) => s.id)).toContain('game.intro');
    // Exits are written once and generated into a hotspot and rules by compileGame: the IR keeps both, said as such.
    expect(r.rules.some((x) => x.kind === 'rule' && x.exit)).toBe(true);
    // The custom command by name, with its declared effects; its code is not logic.
    expect(r.extensions.commands).toEqual([{ name: 'sparkle', pure: true }]);
    expect(r.extensions.trusted).toBe('x');
  });

  it('keeps presentation out: no decor, image, sprite, icon, colour or music field reaches the IR', () => {
    const text = canonicalJson(ir(demo));
    for (const field of ['decor', 'img', 'icon', 'sprites', 'mouths', 'portrait', 'palette', 'skin', 'titleScreen'])
      expect(text, field).not.toContain(`"${field}":`);
    // Every decor id of the game: none appears anywhere in the IR.
    for (const room of demo.rooms) expect(text).not.toContain(`"${room.decor}"`);
  });

  it('classifies every field it meets: every section of the compiled bundled games and fifty generated ones', () => {
    const unclassified: string[] = [];
    const check = (table: Readonly<Record<string, unknown>>, o: object | undefined, where: string) => {
      for (const k of Object.keys(o ?? {})) if (!(k in table)) unclassified.push(`${where}.${k}`);
    };
    const games = [demo, reference, signals, ...Array.from({ length: 50 }, (_, i) => randomGame(i + 1).game)];
    for (const g of games) {
      const c = compileGame(structuredClone(g));
      check(FIELD_CLASSES.game, c, 'GameDef');
      for (const it of Object.values(c.items)) check(FIELD_CLASSES.item, it, 'ItemDef');
      for (const ch of Object.values(c.characters)) check(FIELD_CLASSES.character, ch, 'CharacterDef');
      for (const room of c.rooms) {
        check(FIELD_CLASSES.room, room, 'RoomDef');
        for (const p of Object.values(room.props ?? {})) check(FIELD_CLASSES.prop, p, 'PropDef');
        for (const a of Object.values(room.actors ?? {})) check(FIELD_CLASSES.actor, a, 'ActorDef');
        for (const h of Object.values(room.hotspots ?? {})) check(FIELD_CLASSES.hotspot, h, 'HotspotDef');
        for (const x of Object.values(room.exits ?? {})) check(FIELD_CLASSES.exit, x, 'ExitDef');
        check(FIELD_CLASSES.stage, room.stage, 'StageDef');
      }
    }
    expect([...new Set(unclassified)]).toEqual([]);
    // A logic field present in the sources reaches the IR: one example per section.
    const r = ir(demo);
    expect(r.world.hero).toBe(demo.hero);
    expect(r.world.saveVersion).toBe(demo.saveVersion);
    expect(r.world.invariants).toEqual(demo.invariants);
    expect(r.reality).toEqual({ signals: [] });
    expect(ir(signals).reality.signals.length).toBeGreaterThan(0);
    // The Bridge's address is deployment, not logic.
    expect(JSON.stringify(ir(signals).reality)).not.toContain('"bridge"');
  });

  it('logic leaves out the engine, the provenance and the extensions hash', () => {
    const a = ir(demo, { extensions: { trusted: 'one' }, engine: '4.1.12' });
    const b = ir(demo, { extensions: { trusted: 'two' }, engine: '9.9.9', sources: sources('games/demo') });
    expect(Object.keys(b.provenance).length).toBeGreaterThan(50);
    expect(canonicalJson(logicView(a))).toBe(canonicalJson(logicView(b)));
  });
});

describe('provenance', () => {
  const files = sources('games/demo');
  const p = provenanceOf(ir(demo), files);
  const lineOf = (file: string, needle: string) => files[file]!.split('\n').findIndex((l) => l.includes(needle)) + 1;

  it('finds a rule, a topic, a room, an item, a character and a prop where they are written', () => {
    expect(p['garden.grandpa.where-is-the-key']).toEqual({
      file: 'games/demo/rooms/garden.ts',
      line: lineOf('games/demo/rooms/garden.ts', "id: 'garden.grandpa.where-is-the-key'"),
    });
    expect(p.house?.file).toBe('games/demo/rooms/house.ts');
    expect(p['item:key']).toEqual({ file: 'games/demo/items.ts', line: lineOf('games/demo/items.ts', '  key: {') });
    expect(p['char:grandma']?.file).toBe('games/demo/cast.ts');
    expect(p['game.on-key-found']?.file).toBe('games/demo/game.ts');
    // A prop is searched in its own room's file, not in the first file that has the word.
    const prop = Object.keys(demo.rooms.find((r) => r.id === 'garden')!.props ?? {})[0]!;
    expect(p[`garden.${prop}`]?.file).toBe('games/demo/rooms/garden.ts');
  });

  it("gives a declared exit's line to what is generated from it, and no line rather than a wrong one", () => {
    const exitRule = ir(demo).rules.find((r) => r.kind === 'rule' && r.exit);
    expect(exitRule).toBeDefined();
    const room = exitRule!.kind === 'rule' ? exitRule!.scope : '';
    const exitId = exitRule!.kind === 'rule' ? exitRule!.exit! : '';
    const file = `games/demo/rooms/${room}.ts`;
    expect(p[exitRule!.id]).toEqual({ file, line: lineOf(file, `${exitId}: {`) });
    expect(p[`${room}.${exitId}`]).toEqual(p[exitRule!.id]);
    // Without the sources, nothing; an id the sources do not write, nothing.
    expect(provenanceOf(ir(demo), {})).toEqual({});
    expect(p['nothing.like.this']).toBeUndefined();
    // An id that comes from a spread or a computed key is not written literally: no entry, never a wrong line.
    const g = structuredClone(demo);
    g.objectives = { ...g.objectives, built: { title: 'Built', done: 'pantry_open' } };
    const code = "const k = 'built';\nexport const more = { objectives: { ...base, [`${k}`]: { title: 'Built' } } };\n";
    const q = provenanceOf(ir(g), { ...files, 'games/demo/more.ts': code });
    expect(q['objective:built']).toBeUndefined();
    expect(q['objective:pantry']).toEqual(p['objective:pantry']);
  });
});

describe('npm run ir', () => {
  it('dumps the sample game: readable, with the provenance, deterministic', () => {
    const a = runTool(['tools/ir.ts', '--game', 'demo', '--json']);
    expect(a.status, a.stderr).toBe(0);
    const dumped = JSON.parse(a.stdout) as GameIR;
    expect(dumped.gameId).toBe('demo');
    expect(dumped.provenance['garden.grandpa.where-is-the-key']?.file).toBe('games/demo/rooms/garden.ts');
    const b = runTool(['tools/ir.ts', '--game', 'demo', '--json']);
    expect(b.stdout).toBe(a.stdout);
    const human = runTool(['tools/ir.ts', '--game', 'demo']);
    expect(human.stdout).toMatch(/demo · schema 1 · \d+ rooms · \d+ entities · \d+ rules · \d+ scripts/);
  });
});
