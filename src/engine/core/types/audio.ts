// Music and sound: the audio table, the scores and their state. (core/types.ts re-exports every name; 4.1.0 "Clarity".)
import type { Cond, Id } from './content';

/** The game's music, sounds and voice clips by id, its scores in stems and the transitions between them. @public */
export interface AudioDef {
  music?: Record<Id, string>;
  sfx?: Record<Id, string>;
  /** Voice clips (`games/<id>/audio/voice/<file>`), played by `say` with `voice`. A line whose text has switches looks
   *  up `<id>~<flag>=<value>` (flags sorted, `~` between them) before its plain id (4.3.0, wiki/en/create.voices.md#text-switches). */
  voices?: Record<Id, string>;
  /** The clips of the other languages (3.4), by language: a translated game plays these instead (`npm run voices`). */
  voicesByLang?: Record<string, Record<Id, string>>;
  /**
   * Music in stems (3.5), by the same id as its single mix in `music`: the music director plays the stems
   * sample-locked and changes the mix with the game's state; the mix plays where the director does not (Save-Data,
   * a low-end device, no Web Audio). `npm run audio -- stems` renders them from the arrangement.
   */
  scores?: Record<Id, ScoreDef>;
  /**
   * The most decoded audio the director keeps, in MB (3.6, default 160): past it, the scores least recently played are
   * let go, and a score that alone is larger plays as its single mix.
   */
  maxDecodedMB?: number;
  /**
   * From one score to another (3.6), the first rule naming both (or `*`) applies: the next one starts where the one
   * playing reaches `at` (`beat`, `bar`, `phrase` or a marker of its `markers`; default `bar`), after `bridge` (a
   * track of `music`, played once) if any, crossfading over `fadeBeats` (default 0: on the downbeat). Without a rule,
   * a score replaces another at once, faded. The single mix (no director) ignores them.
   */
  transitions?: {
    from: Id | '*';
    to: Id | '*';
    at?: 'beat' | 'bar' | 'phrase' | string;
    bridge?: Id;
    fadeBeats?: number;
  }[];
}

/** Which stems sound in a given state: the first entry whose condition holds wins (`if` absent: always). @public */
export interface ScoreState {
  if?: Cond;
  stems: Id[];
}

/** A score in stems: its files, its tempo and loop, and which stems sound in each game state. @public */
export interface ScoreDef {
  /** Stem id → file under `audio/music/` (the same length and rate: `npm run audio -- stems` renders them). */
  stems: Record<Id, string>;
  /** Tempo of the arrangement, and the bar's length in beats (default 4). */
  bpm: number;
  beatsPerBar?: number;
  /** The loop in bars, `[first, end)` counted from 0 (default: the whole file). */
  loop?: [number, number];
  /** The mix per game state, in order. Absent, or no entry matching: every stem. */
  states?: ScoreState[];
  /** Where a change of mix lands (default `bar`), and how long its crossfade lasts in beats (default 2). */
  quantize?: 'beat' | 'bar';
  fadeBeats?: number;
  /**
   * The stems decoded, in bytes (all of them, at 48 kHz, 4 bytes a sample; `npm run audio -- stems` writes it). A
   * browser that does not tell its memory plays the stems only below 128 MB (dom/director.ts `directorFits`).
   */
  pcmBytes?: number;
  /** Named bars (3.6), counted from 0, where a transition may land (`audio.transitions[].at`). */
  markers?: Record<string, number>;
  /** A phrase's length in bars, for a transition that lands on `phrase` (default 4). */
  phraseBars?: number;
}
