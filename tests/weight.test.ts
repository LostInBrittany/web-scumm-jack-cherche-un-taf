// What a player downloads (src/engine/tools/weight.ts, npm run weight): the images the engine preloads for a room,
// its music and sound effects; the title, the column's icons and the first room before play; budgets in KB.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameDef, RoomDef } from '@engine/core/types';
import { initialAssets, roomAssets, stingerAssets, transitionPeak, weigh, weightReport } from '@engine/tools/weight';
import { runTool } from './run-tool';

const room = (id: string, extra: Partial<RoomDef> = {}): RoomDef =>
  ({ id, name: id, decor: `decor/${id}`, ...extra }) as RoomDef;
const game = {
  hero: 'ann',
  start: { room: 'hall', inventory: ['key'] },
  players: { ids: ['ann', 'bob'] },
  characters: {
    ann: { name: 'Ann', sprites: { idle: ['ann/idle'] }, mouths: { idle: { closed: 'ann/m0', open: ['ann/m1'] } } },
    bob: { name: 'Bob', sprites: { idle: ['bob/idle'] } },
    cat: { name: 'Cat', sprites: { idle: ['cat/idle'] }, variants: [{ if: 'x', sprites: { idle: ['cat/wet'] } }] },
  },
  items: { key: { name: 'key', icon: 'items/key' } },
  audio: { music: { calm: 'calm.mp3' }, sfx: { ding: 'ding.mp3' } },
  titleScreen: { decor: 'decor/title', logo: 'ui/logo', music: 'calm' },
  skin: { icons: { map: 'ui/map', pause: 'ui/pause', music: 'ui/music' } },
  rooms: [
    room('hall', {
      music: 'calm',
      props: { lamp: { img: 'props/lamp', states: { on: 'props/lamp_on' } } } as never,
      actors: { cat: { char: 'cat' } } as never,
      on: [{ verb: 'use', a: 'lamp', do: [{ sfx: 'ding' }] }] as never,
    }),
    room('attic'),
  ],
} as unknown as GameDef;

describe('weight', () => {
  it('a room needs its backdrop, props in every state, every character who can stand there, its music and sounds', () => {
    expect(roomAssets(game, game.rooms[0])).toEqual([
      'img:ann/idle',
      'img:ann/m0',
      'img:ann/m1',
      'img:bob/idle',
      'img:cat/idle',
      'img:cat/wet',
      'img:decor/hall',
      'img:props/lamp',
      'img:props/lamp_on',
      'music:calm.mp3',
      'sfx:ding.mp3',
    ]);
    // No exit, map place or command leads to the attic: nobody can stand in it, only its backdrop counts.
    expect(roomAssets(game, game.rooms[1])).toEqual(['img:decor/attic']);
    const linked = {
      ...game,
      rooms: [{ ...game.rooms[0], exits: { up: { name: 'stairs', to: 'attic' } } }, game.rooms[1]],
    } as GameDef;
    expect(roomAssets(linked, linked.rooms[1])).toEqual([
      'img:ann/idle',
      'img:ann/m0',
      'img:ann/m1',
      'img:bob/idle',
      'img:decor/attic',
    ]);
  });
  it('before play: the first room, the title, the column icons, the bag at the start', () => {
    const i = initialAssets(game);
    for (const k of [
      'img:decor/title',
      'img:ui/logo',
      'img:ui/map',
      'img:ui/pause',
      'img:ui/music',
      'img:items/key',
      'img:decor/hall',
      'music:calm.mp3',
    ])
      expect(i).toContain(k);
    expect(i).not.toContain('img:decor/attic');
  });
  it('weighs, reports missing files and every budget exceeded', () => {
    const sizes: Record<string, number | null> = Object.fromEntries(
      [...new Set([...initialAssets(game), ...game.rooms.flatMap((r) => roomAssets(game, r))])].map((k) => [
        k,
        100 * 1024,
      ]),
    );
    sizes['img:decor/attic'] = null;
    expect(weigh(['img:decor/hall', 'img:decor/attic'], sizes)).toEqual({
      bytes: 100 * 1024,
      files: 1,
      missing: ['img:decor/attic'],
    });
    const r = weightReport(game, sizes, [{ id: 'one', rooms: ['hall', 'attic'] }], {
      initialKB: 1000,
      roomKB: 1000,
      chapterKB: 1000,
    });
    expect(r.rooms[0]).toMatchObject({ id: 'hall', bytes: 11 * 100 * 1024 });
    expect(r.over).toEqual([
      'initial download 1700 KB > initialKB 1000',
      'room hall 1100 KB > roomKB 1000',
      'chapter one 1100 KB > chapterKB 1000',
    ]);
  });
  it('the stems, the offline total and the decoded score have budgets of their own (3.6)', () => {
    const scored = {
      ...game,
      audio: {
        ...game.audio,
        scores: { calm: { stems: { a: 'calm-stems/a.mp3', b: 'calm-stems/b.mp3' }, bpm: 90, pcmBytes: 200 * 1048576 } },
      },
    } as unknown as GameDef;
    const sizes: Record<string, number | null> = {
      'music:calm-stems/a.mp3': 300 * 1024,
      'music:calm-stems/b.mp3': 300 * 1024,
      'music:calm.mp3': 100 * 1024,
      'sfx:ding.mp3': 1024,
      'shell:app.js': 50 * 1024,
    };
    const r = weightReport(
      scored,
      sizes,
      [],
      { backgroundScoreKB: 500, offlineTotalKB: 600, decodedAudioMB: 128 },
      { shell: ['shell:app.js'] },
    );
    expect(r.background).toEqual({ bytes: 600 * 1024, files: 2, missing: [] });
    // The offline warm-up: the shell, both the mix and the stems, every sound (no manifest here: the images the scopes name, none built).
    expect(r.offline.bytes).toBe((50 + 300 + 300 + 100 + 1) * 1024);
    expect(r.decodedAudio).toBe(200 * 1048576);
    expect(r.over).toEqual([
      'stems 600 KB > backgroundScoreKB 500',
      'offline total 751 KB > offlineTotalKB 600',
      'decoded audio 200 MB > decodedAudioMB 128',
    ]);
    const unknown = {
      ...scored,
      audio: { ...scored.audio, scores: { calm: { ...scored.audio!.scores!.calm, pcmBytes: undefined } } },
    } as GameDef;
    expect(weightReport(unknown, sizes, [], { decodedAudioMB: 128 }).over).toEqual([
      expect.stringContaining('decoded audio unknown'),
    ]);
  });
  it('the demo stays within its budgets, chapter by chapter', () => {
    // An empty DIST_DIR: the verdict never depends on a `dist` left by an earlier build (a Studio build carries a
    // whole font). The app shell is weighed on a fresh build in CI (`npm run weight -- --release` after `npm run build`).
    const dist = mkdtempSync(join(tmpdir(), 'weight-dist-'));
    const r = runTool(['tools/weight.ts', '--release', '--json'], {
      env: { ...process.env, GAME: 'demo', DIST_DIR: dist },
    });
    rmSync(dist, { recursive: true, force: true });
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.over).toEqual([]);
    expect(j.missing).toEqual([]);
    expect(j.chapters.map((c: { id: string }) => c.id)).toContain('ending');
    expect(j.initial.bytes).toBeGreaterThan(0);
  }, 120000);
});

describe('the most decoded audio at once (3.6.1)', () => {
  const MB = 1048576;
  const g = {
    audio: {
      music: { a: 'a.mp3', b: 'b.mp3', c: 'c.mp3', link: 'link.mp3', hit: 'hit.mp3' },
      scores: {
        a: { stems: { x: 'a-x.mp3' }, bpm: 120, pcmBytes: 40 * MB },
        b: { stems: { x: 'b-x.mp3' }, bpm: 120, pcmBytes: 30 * MB },
        c: { stems: { x: 'c-x.mp3' }, bpm: 120, pcmBytes: 50 * MB },
      },
      transitions: [
        { from: 'a', to: 'b', bridge: 'link' },
        { from: '*', to: 'a' },
      ],
    },
    rooms: [{ id: 'r', on: [{ do: [{ music: { stinger: 'hit' } }] }] }],
  } as unknown as GameDef;
  const pcm = (k: string) =>
    (({ 'music:link.mp3': 10 * MB, 'music:hit.mp3': 2 * MB }) as Record<string, number>)[k] ?? null;

  it('the worst transition (two scores and its bridge), a stinger on top', () => {
    expect(stingerAssets(g)).toEqual(['music:hit.mp3']);
    // c → a: 50 + 40; a → b: 40 + 30 + 10; plus the stinger's 2.
    expect(transitionPeak(g, pcm)).toBe(92 * MB);
    expect(transitionPeak(g, (k) => (k === 'music:link.mp3' ? null : pcm(k)))).toBeNull();
  });

  it('a budget the peak goes over, or cannot be measured against', () => {
    const full = {
      ...game,
      audio: g.audio,
      rooms: [...game.rooms, ...g.rooms.map((r) => ({ ...r, name: 'r', decor: 'decor/r' }))],
    } as GameDef;
    const r = weightReport(full, {}, [], { transitionPeakMB: 90 }, { pcm });
    expect(r.transitionPeak).toBe(92 * MB);
    expect(r.over).toEqual(['decoded peak 92 MB > transitionPeakMB 90']);
    expect(weightReport(full, {}, [], { transitionPeakMB: 90 }).over).toEqual([
      expect.stringContaining('decoded peak unknown'),
    ]);
  });
});
