// Portraits in a choice (4.3.0, PLAN-4.3-HERO-CHOICE §3.3): an option may carry `img`, a manifest image shown as a card.
// It is presentation only: the schema accepts it, the engine hands it to the presenter, the asset graph preloads it
// with the intro or the room, the validator checks the id, the IR (logic) leaves it out and the presentation hash
// carries it, and the solver still branches over an intro choice of cards.
import { describe, expect, it } from 'vitest';
import { assetGraph } from '@engine/core/asset-graph';
import { compileGame } from '@engine/core/define';
import { Engine } from '@engine/core/engine';
import { fingerprint, presentationOf } from '@engine/core/fingerprint';
import { compileIR } from '@engine/core/ir';
import { choiceSchema, cmdSchema } from '@engine/core/ir-schema';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { Choice, GameDef, Layout } from '@engine/core/types';
import { solve } from '@engine/tools/solve';
import { validate } from '@engine/tools/validate';
import { collectRefs } from '../tools/refs';

const layouts: Record<string, Layout> = {
  room: { entries: { default: [320, 360] }, hotspots: { exit: { rect: [10, 10, 40, 40] } } },
};
const heroes: Choice[] = [
  { text: 'Knight', img: 'heroes/knight', do: [{ set: ['form', 'knight'] }] },
  { text: 'Witch', img: 'heroes/witch', do: [{ set: ['form', 'witch'] }] },
  { text: 'Robot', img: 'heroes/robot', do: [{ set: ['form', 'robot'] }] },
];
const game = (choice: Choice[] = heroes): GameDef => ({
  id: 'choice-img',
  title: 'Choice img',
  saveVersion: 1,
  hero: 'hero',
  verbs: [{ id: 'use', label: 'Use', color: '#fff' }],
  characters: { hero: { name: 'Hero', color: '#fff', sprites: { idle: ['hero'] } } },
  items: {},
  rooms: [
    {
      id: 'room',
      name: 'Room',
      decor: 'room',
      hotspots: { exit: { name: 'exit' } },
      look: { exit: 'The exit.' },
      on: [
        // Only the first hero (never the silent presenter's default, the last option) sets `knighted`.
        { verb: 'use', a: 'exit', if: { flag: 'form', eq: 'knight' }, do: [{ set: 'knighted' }, { end: true }] },
        { verb: 'use', a: 'exit', do: [{ end: true }] },
      ],
    },
  ],
  rules: { fallbacks: { use: ['No.'] } },
  start: { room: 'room', intro: ['Who am I?', { choice }] },
  skin: { icons: { map: 'map', pause: 'pause', music: 'music' } },
  ui: {} as GameDef['ui'],
});
const images = Object.fromEntries(
  ['hero', 'room', 'map', 'pause', 'music', 'heroes/knight', 'heroes/witch', 'heroes/robot'].map((k) => [
    k,
    [10, 10] as [number, number],
  ]),
);

describe('a choice with portraits (Choice.img)', () => {
  it('the schema accepts an img on an option, and refuses a malformed option', () => {
    expect(choiceSchema.safeParse(heroes[0]).success).toBe(true);
    expect(cmdSchema.safeParse({ choice: heroes }).success).toBe(true);
    expect(cmdSchema.safeParse({ choice: [{ text: 'x', img: '', do: [] }] }).success).toBe(false);
    expect(cmdSchema.safeParse({ choice: [{ text: 'x', img: 3, do: [] }] }).success).toBe(false);
  });

  it('the engine hands the img to the presenter, only on the options that have one', async () => {
    const ui = new FakePresenter();
    const seen: unknown[] = [];
    const choose = ui.choose.bind(ui);
    ui.choose = async (options, who) => {
      seen.push(options);
      return choose(options, who);
    };
    const e = new Engine(game([...heroes, { text: 'Nobody', do: [] }]), layouts, ui, new MemoryStore());
    await e.newGame();
    expect(seen[0]).toEqual([
      { text: 'Knight', img: 'heroes/knight' },
      { text: 'Witch', img: 'heroes/witch' },
      { text: 'Robot', img: 'heroes/robot' },
      { text: 'Nobody' },
    ]);
  });

  it('the asset graph preloads the cards with the intro (title scope) and with a room that offers them', () => {
    const g = game();
    expect(assetGraph(g).title).toEqual(expect.arrayContaining(['img:heroes/knight', 'img:heroes/witch']));
    g.rooms[0].onEnter = [{ choice: [{ text: 'Me', img: 'heroes/me', do: [] }] }];
    expect(assetGraph(g).rooms.room).toContain('img:heroes/me');
  });

  it('npm run assets prepares the cards’ images (tools/refs.ts)', () => {
    expect(collectRefs({ game: game() }).images).toEqual(
      expect.arrayContaining(['heroes/knight', 'heroes/witch', 'heroes/robot']),
    );
  });

  it('the validator flags an img that is not an image of the manifest', () => {
    expect(validate(game(), layouts, { assets: { images } }).errors).toEqual([]);
    const g = game([...heroes, { text: 'Ghost', img: 'heroes/ghost', do: [] }]);
    expect(validate(g, layouts, { assets: { images } }).errors).toContainEqual(
      expect.stringMatching(/start\.intro.*choice\[3\]\.img › image not found: "heroes\/ghost"/),
    );
  });

  it('is presentation: the logic fingerprint ignores it, the presentation one moves', async () => {
    const print = (g: GameDef) => {
      const c = compileGame(g);
      return fingerprint(compileIR(c, { extensions: { trusted: '' }, engine: 'x' }), {
        presentation: presentationOf(c),
        engine: 'x',
      });
    };
    const plain = game(heroes.map(({ img: _img, ...o }) => o));
    const [a, b, c] = await Promise.all([
      print(plain),
      print(game()),
      print(game(heroes.map((o) => ({ ...o, img: `${o.img}_v2` })))),
    ]);
    expect(b.logic).toBe(a.logic);
    expect(c.logic).toBe(a.logic);
    expect(b.presentation).not.toBe(a.presentation);
    expect(c.presentation).not.toBe(b.presentation);
    // The IR carries no img at all.
    expect(JSON.stringify(compileIR(compileGame(game()), { extensions: { trusted: '' } }))).not.toContain('heroes/');
    // A game without a card keeps the presentation it had (no new key).
    expect(presentationOf(compileGame(plain))).not.toHaveProperty('game.choiceImages');
  });

  it('the solver still branches over an intro choice of cards', async () => {
    const r = await solve(game(), layouts, { mode: 'prove' });
    expect(r.finished).toBe(true);
    expect(r.flagsReached).toContain('knighted');
  });
});
