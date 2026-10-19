// Voice production (3.4): the table per language, CSV out and back, statuses, the clips judged; per-language clips;
// captions for the sounds that matter.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GameDef } from '@engine/core/types';
import { clipVerdict, mergeSheet, orphanClips, parseCsv, toCsv, voiceTable } from '@engine/tools/voices';
import { assetGraph } from '@engine/core/asset-graph';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { applyLocale, textPaths } from '@engine/tools/i18n';
import { clipFacts } from '../tools/voice-facts';
import { game as demo } from '../games/demo/game';
import fr from '../games/demo/locales/fr.json';
import { game as fixture, layouts } from './fixture';

describe('the voice table', () => {
  const g = structuredClone(demo) as GameDef;
  const [first, second] = voiceTable(g, {}, 'en');
  g.audio = {
    ...g.audio,
    voices: { [first.id]: 'en/first.mp3', ghost: 'en/ghost.mp3' },
    voicesByLang: { fr: { [second.id]: 'fr/second.mp3' } },
  };
  it('a row per line with an id: who, the text in that language, the clip, a status (recorded when a clip is there)', () => {
    const en = voiceTable(g, {}, 'en');
    expect(en[0]).toMatchObject({ id: first.id, file: 'en/first.mp3', status: 'recorded' });
    expect(en[1]).toMatchObject({ id: second.id, status: 'draft' });
    const frRows = voiceTable(g, {}, 'fr', applyLocale(structuredClone(g), fr as Record<string, string>));
    expect(frRows[1]).toMatchObject({ file: 'fr/second.mp3', status: 'recorded' });
    expect(frRows[0].text).not.toBe(en[0].text);
    expect(orphanClips(g, 'en')).toEqual([{ id: 'ghost', file: 'en/ghost.mp3' }]);
  });
  it('CSV out and back: quotes, commas and line breaks survive; statuses and notes merge, unknown lines are refused', () => {
    const rows = voiceTable(
      g,
      { en: { [second.id]: { status: 'approved', note: 'Warmer, "please", slower,\nagain' } } },
      'en',
    );
    const back = parseCsv(toCsv(rows));
    expect(back[1]).toMatchObject({ id: second.id, status: 'approved', note: 'Warmer, "please", slower,\nagain' });
    const m = mergeSheet(
      {},
      'fr',
      [
        { id: first.id, status: 'record', actor: 'Ann' },
        { id: 'nope', status: 'draft' },
        { id: second.id, status: 'perfect' },
      ],
      new Set([first.id, second.id]),
    );
    expect(m.sheet.fr[first.id]).toEqual({ status: 'record', actor: 'Ann' });
    expect(m.unknown).toEqual(['nope']);
    expect(m.bad).toEqual([`${second.id}: unknown status "perfect"`]);
  });
  it('a clip judged: approved without a file is an error; length, level, peak and rate are warnings', () => {
    const row = { id: 'a', who: 'hero', text: 'Hello there.', status: 'approved' as const };
    expect(clipVerdict(row, null).errors).toEqual(['a: approved without a clip']);
    const v = clipVerdict(
      { ...row, file: 'a.mp3' },
      { durationMs: 200, sampleRate: 16000, codec: 'mp3', lufs: -30, peak: 0 },
    );
    expect(v.errors).toEqual([]);
    expect(v.warnings.join('\n')).toMatch(/too short.*\n.*16000 Hz|16000 Hz/s);
    expect(v.warnings.join('\n')).toContain('LUFS');
    expect(v.warnings.join('\n')).toContain('peak');
    expect(
      clipVerdict({ ...row, file: 'a.wma' }, { durationMs: 900, sampleRate: 44100, codec: 'wmav2' }).errors[0],
    ).toContain('codec wmav2');
  });
  it('ffmpeg measures a clip: a second of tone', () => {
    if (spawnSync('ffmpeg', ['-version']).status !== 0) return;
    const f = join(mkdtempSync(join(tmpdir(), 'voice-')), 'tone.mp3');
    spawnSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-ar',
      '44100',
      f,
    ]);
    const x = clipFacts(f)!;
    expect(x.codec).toBe('mp3');
    expect(x.sampleRate).toBe(44100);
    expect(Math.abs(x.durationMs - 1000)).toBeLessThan(80);
    expect(Number.isFinite(x.lufs)).toBe(true);
  });
  it("the other languages' clips are shipped files: the offline plan and provenance count them", () => {
    expect(assetGraph(g, { manifest: { images: {} } }).offline).toEqual(
      expect.arrayContaining(['voice:en/first.mp3', 'voice:fr/second.mp3']),
    );
  });
});

describe('captions', () => {
  it('a sound effect carries its caption to the presenter, translated like any line', async () => {
    const ui = new FakePresenter();
    const g = structuredClone(fixture) as GameDef;
    g.audio = { ...g.audio, sfx: { ...g.audio?.sfx, slam: 'slam.mp3' } };
    g.rooms[0].on = [
      ...(g.rooms[0].on ?? []),
      { verb: 'look', a: 'lamp', do: [{ sfx: 'slam', caption: '[A door slams]' }] },
    ];
    const e = new Engine(g, layouts, ui, new MemoryStore());
    await e.checkpoint('free');
    await e.exec([{ sfx: 'slam', caption: '[A door slams]' }], { room: e.room(), fast: false } as never);
    expect(ui.log).toContain('sfx slam [[A door slams]]');
    expect(textPaths(g).some((p) => p.path.endsWith('.caption') && p.text === '[A door slams]')).toBe(true);
  });
});
