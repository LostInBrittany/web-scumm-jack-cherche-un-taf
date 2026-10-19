// @vitest-environment happy-dom
// The scene frame (4.1.11 "Viewport", ADR 0011): the room view produces an immutable `SceneFrame`, then paints it.
// Its equivalence with the room view of 4.1.10: every room of the sample game and of the reference chapter, in up to
// three states (checkpoints), gives the same DOM (the painter's markup, byte for byte) and the same answer to a tap
// on a 20-unit grid as before the frame existed. The golden (scene-frame.golden.json) was written by this test on the
// code before the change (`SCENE_GOLDEN=write`); a change of the DOM fails here, and is a visual change to explain.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { GameDef, Layout } from '@engine/core/types';
import { RoomView } from '@engine/dom/room';
import { DomRenderer } from '@engine/dom/render-dom';
import { PaletteCache } from '@engine/dom/palette';
import type { AssetBank } from '@engine/dom/assets';
import { game as demo } from '../../games/demo/game';
import { commands } from '../../games/demo/index';
import { game as reference } from '../../games/reference/game';

const GOLDEN = 'tests/dom/scene-frame.golden.json';
const write = process.env.SCENE_GOLDEN === 'write';
const golden: Record<string, { dom: string; hits: string; n: number }> = write
  ? {}
  : JSON.parse(readFileSync(GOLDEN, 'utf8'));

const layoutsOf = (dir: string): Record<string, Layout> =>
  Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))]),
  );

/** FNV-1a: the golden keeps a digest of each picture, not the markup (a hundred rooms × states). */
const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};

/** A bank whose images all exist, each with a size of its own (a digest of its id), so every box differs. */
const size = (id: string): [number, number] => {
  const h = Number.parseInt(fnv(id), 16);
  return [60 + (h % 200), 80 + ((h >>> 8) % 240)];
};
const bank = {
  img: (id: string) => `img/${id}`,
  size,
  widthFor(id: string, h: number) {
    const [w, hh] = size(id);
    return (w / hh) * h;
  },
  preload: async () => {},
} as unknown as AssetBank;

const GAMES: [string, GameDef, Record<string, Layout>, object][] = [
  ['demo', demo, layoutsOf('games/demo/layout'), { commands }],
  ['reference', reference, layoutsOf('games/reference/layout'), {}],
];

describe('the scene frame paints the DOM the room view painted', () => {
  // happy-dom has no image decoding: the recoloured sprites stay the originals, before and after alike.
  vi.spyOn(PaletteCache.prototype, 'load').mockImplementation(async (url: string) => url);
  vi.spyOn(PaletteCache.prototype, 'get').mockReturnValue(undefined);
  const seen: string[] = [];

  for (const [name, game, layouts, opts] of GAMES) {
    const checkpoints = Object.keys(game.checkpoints ?? {}).slice(0, 3);
    for (const cp of checkpoints)
      for (const room of game.rooms)
        it(`${name} · ${cp} · ${room.id}`, async () => {
          const e = new Engine(structuredClone(game), layouts, new FakePresenter(), new MemoryStore(), opts);
          e.random = () => 0;
          await e.checkpoint(cp);
          e.state.room = room.id;
          const v = new RoomView(e, bank, new DomRenderer());
          v.resize(1.5);
          await v.build(e.room());
          v.still();
          const dom = v.el.outerHTML;
          const n = v.el.children.length;
          const hits: string[] = [];
          for (let y = 0; y <= 400; y += 20)
            for (let x = 0; x <= v.camera.width; x += 20) hits.push(v.hit([x, y]) ?? '-');
          v.destroy();
          expect(n).toBeGreaterThan(0);
          const key = `${name}/${cp}/${room.id}`;
          seen.push(key);
          const got = { dom: fnv(dom), hits: fnv(hits.join(',')), n };
          if (write) golden[key] = got;
          else expect(got, key).toEqual(golden[key]);
        });
  }

  afterAll(() => {
    if (write) writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`);
    else expect(seen.sort()).toEqual(Object.keys(golden).sort());
  });
});
