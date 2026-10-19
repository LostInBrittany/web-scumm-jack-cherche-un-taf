// The asset graph (src/engine/core/asset-graph.ts): one place that says which files each part of the game needs. The
// weight budgets, the warm-up, the offline plan and provenance read it; scripts/e2e-weight.mjs checks it against the
// bytes a browser transfers.
import { describe, expect, it } from 'vitest';
import type { GameDef } from '@engine/core/types';
import { assetGraph, characterImages, initialScope, playerRooms } from '@engine/core/asset-graph';
import { offlinePlan } from '@engine/dom/offline';
import type { AssetManifest } from '@engine/dom/assets';
import { minigames } from '@engine/minigames';
import { game as demo } from '../games/demo/game';
import demoManifest from '../games/demo/assets.gen.json';

const char = (id: string, extra = {}) => ({ name: id, color: '#fff', sprites: { idle: [`${id}/idle`] }, ...extra });
const game = {
  hero: 'ann',
  players: { ids: ['ann', 'bob'], start: { bob: { room: 'past' } } },
  start: { room: 'hall', inventory: ['key'] },
  characters: {
    ann: char('ann', { portrait: 'ann/face', variants: [{ if: 'wet', sprites: { idle: ['ann/wet'] } }] }),
    bob: char('bob'),
    cat: char('cat'),
    aunt: char('aunt'),
  },
  items: { key: { name: 'key', icon: 'items/key' }, coin: { name: 'coin', icon: 'items/coin' } },
  audio: {
    music: { calm: 'calm.mp3', storm: 'storm.mp3' },
    sfx: { ding: 'ding.mp3', ring: 'ring.mp3', zap: 'zap.mp3' },
    voices: { 'hall.l-hello': 'hello.mp3' },
  },
  skin: { icons: { map: 'ui/map', pause: 'ui/pause', music: 'ui/music' }, sounds: { phone: 'ring' } },
  titleScreen: { decor: 'decor/title', music: 'calm', video: 'intro.mp4' },
  rooms: [
    {
      id: 'hall',
      name: 'Hall',
      decor: 'decor/hall',
      props: {
        box: { img: 'p/box', states: { open: 'p/box_open' }, anims: { shake: { frames: ['p/box1', 'p/box2'] } } },
      },
      actors: { cat: { char: 'cat' } },
      exits: { up: { name: 'up', to: 'attic' } },
      on: [
        {
          verb: 'use',
          a: 'box',
          do: [
            { say: ['ann', 'Hello.'], id: 'hall.l-hello' },
            { sfx: 'ding' },
            { music: { push: 'storm' } },
            { gain: 'coin' },
            { phone: 'aunt', do: [] },
            { minigame: 'scratch', params: { ticket: 'mg/ticket', sfx: 'zap' } },
            { moveActor: ['cat', 'attic'] },
          ],
        },
      ],
    },
    { id: 'attic', name: 'Attic', decor: 'decor/attic', exits: { down: { name: 'down', to: 'hall' } } },
    { id: 'past', name: 'Past', decor: 'decor/past' },
  ],
  rules: { fallbacks: {} },
} as unknown as GameDef;
const bindings = { scratch: { images: ['ticket'], sfx: ['sfx'] } };

describe('the asset graph', () => {
  const g = assetGraph(game, { bindings });
  it('a room: backdrop, props in every state and animation frame, who can stand there, what its commands play or show', () => {
    expect(g.rooms.hall).toEqual(
      expect.arrayContaining([
        'img:decor/hall',
        'img:p/box',
        'img:p/box_open',
        'img:p/box1',
        'img:p/box2',
        'img:cat/idle',
        'img:ann/idle',
        'img:ann/wet',
        'img:ann/face',
        'voice:hello.mp3',
        'sfx:ding.mp3',
        'music:storm.mp3',
        'img:items/coin',
        'img:aunt/idle',
        'sfx:ring.mp3',
        'img:mg/ticket',
        'sfx:zap.mp3',
      ]),
    );
  });
  it('a playable character only counts where it can stand: Bob lives in the past, the cat is moved to the attic', () => {
    expect(g.rooms.hall).not.toContain('img:bob/idle');
    expect(g.rooms.past).toEqual(['img:bob/idle', 'img:decor/past']);
    expect(g.rooms.attic).toEqual(expect.arrayContaining(['img:ann/idle', 'img:cat/idle']));
    expect([...playerRooms(game).get('bob')!]).toEqual(['past']);
  });
  it('the title and the first room are the initial scope; the video and the bag at the start are in it', () => {
    expect(initialScope(g, game)).toEqual(
      expect.arrayContaining([
        'img:decor/title',
        'music:calm.mp3',
        'video:intro.mp4',
        'img:items/key',
        'img:ui/map',
        'img:decor/hall',
      ]),
    );
    expect(initialScope(g, game)).not.toContain('img:decor/past');
  });
  it('offline: every file the game ships, the manifest for images', () => {
    const o = assetGraph(game, {
      manifest: { images: { 'decor/hall': [1, 1], 'sheet/r1c1': [1, 1] } },
      bindings,
    }).offline;
    expect(o).toEqual([
      'img:decor/hall',
      'img:sheet/r1c1',
      'music:calm.mp3',
      'music:storm.mp3',
      'sfx:ding.mp3',
      'sfx:ring.mp3',
      'sfx:zap.mp3',
      'voice:hello.mp3',
    ]);
  });
  it('the sample game: every file a room can need is shipped, and the offline plan is the offline scope', () => {
    const b = Object.fromEntries(Object.entries(minigames).map(([k, m]) => [k, m.bindings ?? {}]));
    const d = assetGraph(demo, { manifest: demoManifest, bindings: b });
    for (const [room, keys] of Object.entries(d.rooms))
      for (const k of keys) expect(d.offline, `${room}: ${k}`).toContain(k);
    const plan = offlinePlan(demo, demoManifest as unknown as AssetManifest);
    expect(plan.reduce((n, x) => n + x.ids.length, 0)).toBe(d.offline.length);
    // The renderer preloads the active character's images when it builds a room: inside the room's scope.
    for (const r of demo.rooms)
      for (const f of characterImages(demo, demo.hero)) expect(d.rooms[r.id]).toContain(`img:${f}`);
  });
});

describe('asset graph: scores in stems (3.5)', () => {
  const scored = structuredClone(game);
  scored.audio!.scores = { calm: { stems: { a: 'calm/a.mp3', b: 'calm/b.mp3' }, bpm: 90 } };
  scored.rooms[1].on = [{ verb: 'use', a: 'down', do: [{ music: { stinger: 'ding' } }, { music: 'calm' }] }] as never;
  it('where the director plays them, a scored track is its stems; elsewhere its single mix', () => {
    const withStems = assetGraph(scored);
    expect(withStems.title).toEqual(expect.arrayContaining(['music:calm/a.mp3', 'music:calm/b.mp3']));
    expect(withStems.title).not.toContain('music:calm.mp3');
    expect(withStems.rooms.attic).toEqual(expect.arrayContaining(['music:calm/a.mp3', 'sfx:ding.mp3']));
    const mixOnly = assetGraph(scored, { stems: false });
    expect(mixOnly.title).toContain('music:calm.mp3');
    expect(mixOnly.title.some((k) => k.startsWith('music:calm/'))).toBe(false);
  });
  it('offline keeps both: which one a device plays is decided there', () => {
    expect(assetGraph(scored, { stems: false }).offline).toEqual(
      expect.arrayContaining(['music:calm.mp3', 'music:calm/a.mp3', 'music:calm/b.mp3']),
    );
  });
});
