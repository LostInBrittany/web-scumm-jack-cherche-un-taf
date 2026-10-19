// The music director's plan (core/score.ts): which stems a state asks for, where on the grid a change lands (through
// the loop), and the ramps between two mixes. The browser side (sample-locked stems, no clicks over thirty minutes)
// is scripts/e2e-music.mjs.
import { describe, expect, it } from 'vitest';
import {
  barSec,
  beatSec,
  crossfade,
  landing,
  loopWindow,
  nextBoundary,
  positionAt,
  stemsFor,
  transitionFor,
} from '@engine/core/score';
import type { ScoreDef } from '@engine/core/types';
import { validate } from '@engine/tools/validate';
import { game as demo } from '../games/demo/game';

const score: ScoreDef = {
  stems: { melody: 'm.mp3', strings: 's.mp3', harp: 'h.mp3', bass: 'b.mp3' },
  bpm: 120,
  beatsPerBar: 4,
  states: [
    { if: { player: 'biscuit' }, stems: ['harp', 'bass'] },
    { if: { room: 'garden' }, stems: ['strings', 'harp', 'bass'] },
  ],
};

describe('score: the mix per state', () => {
  it('the first matching state wins; none: every stem', () => {
    const holds = (on: string[]) => (c: unknown) => on.includes(JSON.stringify(c));
    expect(stemsFor(score, holds([JSON.stringify({ room: 'garden' }), JSON.stringify({ player: 'biscuit' })]))).toEqual(
      ['harp', 'bass'],
    );
    expect(stemsFor(score, holds([JSON.stringify({ room: 'garden' })]))).toEqual(['strings', 'harp', 'bass']);
    expect(stemsFor(score, holds([]))).toEqual(['melody', 'strings', 'harp', 'bass']);
  });
  it('an entry without a condition always matches', () => {
    expect(stemsFor({ ...score, states: [{ stems: ['bass'] }] }, () => false)).toEqual(['bass']);
  });
});

describe('score: the grid', () => {
  it('beats and bars from the tempo', () => {
    expect(beatSec(score)).toBe(0.5);
    expect(barSec(score)).toBe(2);
  });
  it('the next bar or beat at or after a time, never closer than the lead', () => {
    expect(nextBoundary(score, 10, 9)).toBe(10);
    expect(nextBoundary(score, 10, 10)).toBe(10);
    expect(nextBoundary(score, 10, 10.1)).toBe(12);
    expect(nextBoundary(score, 10, 11.97, 'bar', 0.05)).toBe(14);
    expect(nextBoundary(score, 10, 10.1, 'beat')).toBe(10.5);
    expect(nextBoundary(score, 10, 12, 'bar')).toBe(12);
  });
  it('through a loop that is not a whole number of bars: the count restarts with the music', () => {
    // A 9-second file at 2 s a bar, looping whole: bars at 0, 2, 4, 6, 8, then the loop's start at 9, 11, 13...
    const s = { ...score };
    expect(loopWindow(s, 9)).toEqual([0, 9]);
    expect(nextBoundary(s, 0, 8.5, 'bar', 0, 9)).toBe(9);
    expect(nextBoundary(s, 0, 9.5, 'bar', 0, 9)).toBe(11);
    expect(nextBoundary(s, 0, 17.5, 'bar', 0, 9)).toBe(18);
    expect(positionAt(9.5, [0, 9])).toBe(0.5);
  });
  it('a loop in bars: the intro once, then the loop; its start is on the grid', () => {
    const s = { ...score, loop: [2, 6] as [number, number] }; // [4 s, 12 s)
    expect(loopWindow(s, 20)).toEqual([4, 12]);
    expect(positionAt(13, [4, 12])).toBe(5);
    expect(nextBoundary(s, 0, 12.5, 'bar', 0, 20)).toBe(14); // the file at 4.5 s: next bar at 6 s, 1.5 s later
    expect(nextBoundary(s, 0, 19.5, 'bar', 0, 20)).toBe(20); // the loop restarts at 20 (file 4 s, a bar)
  });
});

describe('score: crossfades', () => {
  it('only the stems that change, from the boundary over the fade', () => {
    const steps = crossfade(score, ['melody', 'strings', 'harp', 'bass'], ['harp', 'bass'], 12);
    expect(steps).toEqual([
      { stem: 'melody', from: 1, to: 0, at: 12, until: 13 },
      { stem: 'strings', from: 1, to: 0, at: 12, until: 13 },
    ]);
    expect(crossfade(score, ['bass'], ['bass'], 4)).toEqual([]);
  });
});

describe('score: validation', () => {
  it('the demo theme validates; unknown stems, a missing mix and a bad tempo are errors', () => {
    const g = structuredClone(demo);
    expect(validate(g, {}).errors.filter((e) => e.includes('audio.scores'))).toEqual([]);
    g.audio!.scores!.ghost = { stems: { a: 'a.mp3' }, bpm: 0, states: [{ stems: ['zz'] }] };
    const errs = validate(g, {}).errors.filter((e) => e.includes('audio.scores.ghost'));
    expect(errs.some((e) => e.includes('no single mix'))).toBe(true);
    expect(errs.some((e) => e.includes('tempo'))).toBe(true);
    expect(errs.some((e) => e.includes('unknown stem "zz"'))).toBe(true);
  });
});

describe('score: transitions between scores (3.6)', () => {
  // 120 BPM in 4/4: a bar is 2 s. A file of 16 bars (32 s) looping over bars [4, 12) (8 s to 24 s).
  const s: ScoreDef = { ...score, loop: [4, 12], phraseBars: 4, markers: { bridge: 6, intro: 1 } };
  it('beat and bar land as a change of mix does', () => {
    expect(landing(s, 0, 0.7, 'beat')).toBe(1);
    expect(landing(s, 0, 0.7, 'bar')).toBe(2);
  });
  it('a phrase lands on its first bar, through the loop', () => {
    expect(landing(s, 0, 0.7, 'phrase', 0, 32)).toBe(8); // bar 4
    expect(landing(s, 0, 8.5, 'phrase', 0, 32)).toBe(16); // bar 8
    // Past bar 12 the file is back at bar 4 (24 s on the clock): a phrase starts there.
    expect(landing(s, 0, 16.5, 'phrase', 0, 32)).toBe(24);
  });
  it('a marker lands on its bar, each time round the loop; one the loop never reaches again falls back to a bar', () => {
    expect(landing(s, 0, 0.7, 'bridge', 0, 32)).toBe(12); // bar 6
    expect(landing(s, 0, 12.5, 'bridge', 0, 32)).toBe(28); // the loop's next pass: 24 s is bar 4, 28 s is bar 6
    expect(landing(s, 0, 0.7, 'intro', 0, 32)).toBe(2);
    expect(landing(s, 0, 2.5, 'intro', 0, 32)).toBe(4); // bar 1 is gone for good: the next bar
    expect(landing(s, 0, 0.7, 'nowhere', 0, 32)).toBe(2);
  });
  it('the first rule naming both scores applies, * for any', () => {
    const rules = [
      { from: 'a', to: 'b', at: 'phrase' },
      { from: '*', to: 'b', at: 'beat' },
      { from: 'a', to: '*', at: 'bar' },
    ];
    expect(transitionFor(rules, 'a', 'b')?.at).toBe('phrase');
    expect(transitionFor(rules, 'c', 'b')?.at).toBe('beat');
    expect(transitionFor(rules, 'a', 'c')?.at).toBe('bar');
    expect(transitionFor(rules, 'c', 'd')).toBeUndefined();
  });
  it('validate checks the rules', () => {
    const g = structuredClone(demo);
    g.audio!.scores!.theme.markers = { bridge: 2, bad: -1 };
    g.audio!.transitions = [
      { from: 'theme', to: 'nope', at: 'bridge' },
      { from: 'theme', to: 'theme', at: 'coda', bridge: 'jingle?' },
    ];
    const { errors } = validate(g, {});
    expect(errors.filter((e) => /transitions|markers/.test(e))).toEqual([
      expect.stringContaining('audio.transitions[0].to'),
      expect.stringContaining('audio.transitions[1].at'),
      expect.stringContaining('audio.transitions[1].bridge'),
      expect.stringContaining('audio.scores.theme.markers.bad'),
    ]);
  });
  it('validate: a marker from any score needs it on each, and a rule an earlier one covers is never used (3.6.1)', () => {
    const g = structuredClone(demo);
    g.audio!.scores!.other = { ...g.audio!.scores!.theme, markers: {} };
    g.audio!.music!.other = g.audio!.music!.theme;
    g.audio!.scores!.theme.markers = { coda: 2 };
    // Rule 1 is fine: the only score it can leave is the theme, which has the marker.
    g.audio!.transitions = [
      { from: '*', to: 'theme', at: 'coda' },
      { from: '*', to: 'other', at: 'coda' },
      { from: 'other', to: 'theme', at: 'bar' },
    ];
    const { errors } = validate(g, {});
    expect(errors.filter((e) => /transitions/.test(e))).toEqual([
      expect.stringMatching(/transitions\[0\]\.at.*"other" has no such marker/),
      expect.stringMatching(/transitions\[2\].*never used: audio\.transitions\[0\]/),
    ]);
  });
});
