// The `voices` mutation set's survivors (4.3.1, tools/mutation-sets.ts): the recording table's CSV, the import's
// rows, a clip's verdict, the validator's sentence and the solver's sentences, each held by the case that tells the
// mutant from the source. The equivalent ones are named in docs/dev/mutants.json.
import { describe, expect, it } from 'vitest';
import type { Cmd, GameDef } from '@engine/core/types';
import { voiceBase } from '@engine/core/voice-key';
import { mini } from './fixtures/mini';
import { chaptersHeadline, solveHeadline } from '@engine/tools/status';
import { voiceValueChecks } from '@engine/tools/validate/voices';
import {
  type ClipFacts,
  clipVerdict,
  mergeSheet,
  parseCsv,
  toCsv,
  type VoiceRow,
  voiceTable,
} from '@engine/tools/voices';

/** A game with one line, `l1`, spoken by the hero. */
const line = (text: string): GameDef => {
  const g = mini();
  g.rooms[0]!.on!.push({ verb: 'look', a: 'valise', do: [{ say: ['hero', text], id: 'l1' }] as Cmd[] });
  return g;
};

describe('the voice table', () => {
  it('a switch with one value is still recorded by value', () => {
    expect(
      voiceTable(line('Saw {form?f=her}.'), {}, 'en')
        .filter((r) => r.id.startsWith('l1'))
        .map((r) => r.id),
    ).toEqual(['l1~form=f']);
  });
  it('a line whose switches list only `*=` reads its default in the sheet, never the braces', () => {
    const rows = voiceTable(line('Hello {form?*=there}.'), {}, 'en').filter((r) => r.id.startsWith('l1'));
    expect(rows.map((r) => [r.id, r.text])).toEqual([['l1', 'Hello there.']]);
    expect(voiceTable(line('Hello {hero}.'), {}, 'en').find((r) => r.id === 'l1')?.text).toBe('Hello {hero}.');
  });
  it('a row without a clip has no file field at all', () => {
    const row = voiceTable(line('Hello.'), {}, 'en').find((r) => r.id === 'l1');
    expect(Object.keys(row!)).not.toContain('file');
  });
  it('a key that starts with the separator belongs to the empty id', () => {
    expect(voiceBase('~form=f')).toBe('');
  });
});

describe('the CSV', () => {
  it('quotes only a cell that needs it', () => {
    const row: VoiceRow = { id: 'a', who: 'b', text: 'Say "hi", then\ngo', status: 'draft' };
    expect(toCsv([row])).toBe('id,who,text,status,file,actor,note\na,b,"Say ""hi"", then\ngo",draft,,,\n');
  });
  it('reads a last line without a line break, and skips blank lines', () => {
    expect(parseCsv('id,status\n\na,draft\n\nb,record')).toEqual([
      { id: 'a', status: 'draft' },
      { id: 'b', status: 'record' },
    ]);
    expect(parseCsv('id\nx\n')).toEqual([{ id: 'x' }]);
    // One column, its last line unended; a last line of empty cells is blank.
    expect(parseCsv('id\nx')).toEqual([{ id: 'x' }]);
    expect(parseCsv('id,status\n,')).toEqual([]);
  });
  it('reads lone carriage returns as line breaks, and never eats the next character', () => {
    expect(parseCsv('id,status\rb,x\n\rc,y\r')).toEqual([
      { id: 'b', status: 'x' },
      { id: 'c', status: 'y' },
    ]);
  });
});

describe('the import', () => {
  it('skips a row without an id, and trims a note', () => {
    const m = mergeSheet({}, 'en', [{ id: '' }, { id: 'l1', status: 'record', note: '  slower  ' }], new Set(['l1']));
    expect(m.unknown).toEqual([]);
    expect(m.sheet.en).toEqual({ l1: { status: 'record', note: 'slower' } });
  });
});

describe("a clip's verdict", () => {
  const row = (o: Partial<VoiceRow>): VoiceRow => ({ id: 'l1', who: 'h', text: 'Hello there.', status: 'draft', ...o });
  const ok: ClipFacts = { durationMs: 1500, sampleRate: 44100, codec: 'mp3', lufs: -16, peak: -3 };
  it('without a clip: approved is an error, recorded a warning, the others nothing', () => {
    expect(clipVerdict(row({ status: 'approved' }), null)).toEqual({
      errors: ['l1: approved without a clip'],
      warnings: [],
    });
    expect(clipVerdict(row({ status: 'recorded' }), null)).toEqual({
      errors: [],
      warnings: ['l1: recorded, but no clip in audio.voices'],
    });
    for (const status of ['draft', 'record'] as const)
      expect(clipVerdict(row({ status }), null)).toEqual({ errors: [], warnings: [] });
  });
  it('an unreadable clip is named with its file', () => {
    expect(clipVerdict(row({ file: 'a.mp3' }), null)).toEqual({
      errors: ['l1 (a.mp3): the clip cannot be read'],
      warnings: [],
    });
  });
  it('the limits themselves pass; one step beyond warns', () => {
    const r = row({ file: 'a.mp3' });
    const reading = Math.max(1500, r.text.length * 70);
    const edge: ClipFacts[] = [
      ok,
      { ...ok, sampleRate: 22050 },
      { ...ok, durationMs: 300 },
      { ...ok, durationMs: reading * 3 },
      { ...ok, lufs: -23 },
      { ...ok, lufs: -12 },
      { ...ok, peak: -1 },
      { durationMs: 1500, sampleRate: 44100, codec: 'mp3' },
    ];
    for (const f of edge) expect(clipVerdict(r, f), JSON.stringify(f)).toEqual({ errors: [], warnings: [] });
    const beyond: [ClipFacts, RegExp][] = [
      [{ ...ok, sampleRate: 22049 }, /22049 Hz/],
      [{ ...ok, durationMs: 299 }, /299 ms, too short/],
      [{ ...ok, durationMs: reading * 3 + 1 }, /more than three times/],
      [{ ...ok, lufs: -23.1 }, /LUFS/],
      [{ ...ok, lufs: -11.9 }, /LUFS/],
      [{ ...ok, peak: -0.9 }, /peak/],
    ];
    for (const [f, re] of beyond)
      expect(clipVerdict(r, f).warnings, JSON.stringify(f)).toEqual([expect.stringMatching(re)]);
  });
});

describe("the validator's sentence", () => {
  it('says the plain clip plays when there is one, and that there is none otherwise', () => {
    const said = (voices: Record<string, string>) => {
      const g = line('Saw {form?f=her|m=him}.');
      g.audio = { voices };
      const out: string[] = [];
      voiceValueChecks(g, (w, m) => out.push(`${w} › ${m}`));
      return out;
    };
    expect(said({ l1: 'l1.mp3' })).toEqual([
      'voice:l1 › voiced line with text switches lacks 2 of 2 clip(s) by value: l1~form=f, l1~form=m (the plain id plays instead)',
    ]);
    expect(said({ 'l1~form=f': 'f.mp3' })).toEqual([
      'voice:l1 › voiced line with text switches lacks 1 of 2 clip(s) by value: l1~form=m (the plain id plays instead, and it has no clip either)',
    ]);
  });
});

describe("the solver's sentences", () => {
  const base = { mode: 'prove' as const, states: 9, softlockCount: 0, broken: [], errors: [] };
  it('names the goal when there is one', () => {
    expect(solveHeadline({ ...base, status: 'unsolved', goal: true })).toBe(
      'unsolved: the goal is not reached from any of the 9 states explored',
    );
  });
  it('says why a search stopped', () => {
    const t = (stoppedBy?: 'states' | 'time' | 'memory') => solveHeadline({ ...base, status: 'truncated', stoppedBy });
    expect(t('time')).toMatch(/\(out of time: raise --time\)$/);
    expect(t('memory')).toMatch(/\(out of memory: raise --mem, or resume from the checkpoint\)$/);
    expect(t('states')).toMatch(/\(raise --max\)$/);
    expect(t()).toMatch(/\(raise --max\)$/);
  });
  it('a proof by chapters names its first chapter that is not solved', () => {
    expect(
      chaptersHeadline({
        status: 'softlocks',
        chapters: [
          { id: 'one', status: 'solved' },
          { id: 'two', status: 'softlocks' },
        ],
      }),
    ).toBe('softlocks: chapter two is softlocks');
  });
});
