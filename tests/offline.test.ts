import { describe, expect, it } from 'vitest';
import {
  MIN_FREE_BYTES,
  offlineFinish,
  offlineFold,
  offlinePlan,
  offlineStart,
  offlineText,
  planSize,
} from '@engine/dom/offline';
import type { AssetManifest } from '@engine/dom/assets';
import { mini } from './fixtures/mini';
import { game as demo, manifest as demoManifest } from '../games/demo';

describe('offlinePlan', () => {
  it('orders images, effects, voices, music, videos; music and videos one at a time', () => {
    const g = mini();
    g.audio = { sfx: { a: 'a.mp3', b: 'b.mp3' }, voices: { v: 'v.mp3' }, music: { m1: 'm1.mp3', m2: 'm2.mp3' } };
    const manifest: AssetManifest = {
      images: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`img${i}`, [1, 1]])),
      videos: { 'intro.mp4': 3 },
    };
    const plan = offlinePlan(g, manifest, { initialImages: 2, audioFiles: 2 });
    expect(plan.map((b) => `${b.kind}:${b.ids.length}`)).toEqual([
      'img:2',
      'img:2',
      'img:1',
      'sfx:2',
      'voice:1',
      'music:1',
      'music:1',
      'video:1',
    ]);
    expect(planSize(plan)).toEqual({ files: 11, batches: 8 });
  });

  it('covers every image and sound of the sample game, with the default batch sizes', () => {
    const plan = offlinePlan(demo, demoManifest);
    const { files } = planSize(plan);
    const stems = Object.values(demo.audio?.scores ?? {}).flatMap((s) => Object.values(s.stems));
    const expected =
      Object.keys(demoManifest.images).length +
      Object.keys(demo.audio?.sfx ?? {}).length +
      Object.keys(demo.audio?.music ?? {}).length +
      stems.length +
      Object.keys(demoManifest.videos ?? {}).length;
    expect(files).toBe(expected);
    expect(plan.filter((b) => b.kind === 'img').every((b) => b.ids.length <= 120)).toBe(true);
    // The single mix and the theme's stems: which ones a device plays is decided there (dom/director.ts).
    expect(
      plan
        .filter((b) => b.kind === 'music')
        .flatMap((b) => b.ids)
        .sort(),
    ).toEqual([
      'swan-theme-stems/bass.mp3',
      'swan-theme-stems/harp.mp3',
      'swan-theme-stems/melody.mp3',
      'swan-theme-stems/strings.mp3',
      'swan_theme.mp3',
    ]);
  });
});

describe('the offline status', () => {
  const plan = [
    { kind: 'img' as const, ids: ['a', 'b'] },
    { kind: 'sfx' as const, ids: ['c'] },
  ];

  it('is complete only when every file is in the cache', () => {
    let s = offlineStart(plan);
    expect(s).toMatchObject({ state: 'running', done: 0, total: 3 });
    s = offlineFold(s, { ok: 2, failed: [], skipped: null }, 2);
    s = offlineFold(s, { ok: 1, failed: [], skipped: null }, 1);
    expect(offlineFinish(s)).toMatchObject({ state: 'complete', done: 3 });
    expect(offlineText(offlineFinish(s), { complete: 'all here' })).toBe('all here');
  });

  it('a failed file leaves it partial with the reason and the file', () => {
    let s = offlineStart(plan);
    s = offlineFold(s, { ok: 1, failed: ['/b.webp'], skipped: null }, 2);
    s = offlineFold(s, { ok: 1, failed: [], skipped: null }, 1);
    const f = offlineFinish(s);
    expect(f).toMatchObject({ state: 'partial', done: 2, total: 3, reason: 'network', failed: ['/b.webp'] });
    expect(offlineText(f, { retry: 'retry' })).toBe('2/3 ⚠ retry');
  });

  it('a save-data link skips everything, a slow one skips the heavy batches', () => {
    let s = offlineStart(plan);
    s = offlineFold(s, { ok: 0, failed: [], skipped: 'save-data' }, 2);
    s = offlineFold(s, { ok: 0, failed: [], skipped: 'save-data' }, 1);
    expect(offlineFinish(s)).toMatchObject({ state: 'skipped', reason: 'save-data', done: 0 });
    let t = offlineStart(plan);
    t = offlineFold(t, { ok: 2, failed: [], skipped: null }, 2);
    t = offlineFold(t, { ok: 0, failed: [], skipped: 'slow' }, 1);
    expect(offlineFinish(t)).toMatchObject({ state: 'partial', reason: 'slow', done: 2 });
  });

  it('does not start when the free storage is below the floor, and keeps the estimate', () => {
    const s = offlineStart(plan, { usage: 100, quota: 100 + MIN_FREE_BYTES - 1 });
    expect(s).toMatchObject({ state: 'partial', reason: 'quota', done: 0, usage: 100 });
    expect(offlineStart(plan, { usage: 0, quota: MIN_FREE_BYTES * 2 }).state).toBe('running');
  });
});
