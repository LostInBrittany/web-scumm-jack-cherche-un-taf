// Reality Bridge (4.1.1): the signals a game may receive from the world outside, as data. A signal is an identifier
// from a finite alphabet the game declares; it reaches the game as an event (`events: [{ on: '<signal id>' }]`),
// never as text from outside (wiki/en/bridge.what-it-is.md). (core/types.ts re-exports every name.)
import type { Cmd, Id } from './content';

/**
 * A signal the game may receive from the world outside: its id, source, availability, replay mode and fallback.
 * @public
 */
export interface SignalDef {
  /** The signal's identifier, also the event it emits: `mail.answer.correct`. */
  id: Id;
  /** Where it comes from (a connector's family): `mail`, `webhook`, `badge`… Informative for the Bridge's policy. */
  source: string;
  /**
   * `optional`: the game can be finished without it. `required`: the main ending needs it, so the game declares a
   * `fallback` (what a player does when the outside never answers) and a scenario proves it (`npm run solve`).
   */
  availability: 'optional' | 'required';
  /** How a session keeps it: `record`, an entry replayed offline (the only mode of 4.1.1). */
  replay: 'record';
  /**
   * `true` (the default): its effect applies once per game, whatever the deliveries. `false`: each distinct signal
   * (a new id from the Bridge) applies again; a delivery repeated with the same id never does.
   */
  once?: boolean;
  /** For a `required` signal: the commands a player can trigger instead (`npm run validate` checks they exist). */
  fallback?: { verb: Id; a: Id; b?: Id; do?: Cmd[] };
}

/** A command of a virtual terminal (Telnet, SSH; 4.1.9): what a player types, what it prints, the signal it proposes. */
type TerminalCommandDef = {
  /** The words, lower case, one space apart: `lamp on`. Matched whole, never as a pattern. */
  says: string;
  /** What the terminal prints back: the game's own words, plain text. */
  reply: string;
  /** The signal it proposes (one of `signals`); none: an answer only. */
  signal?: Id;
};
/** A virtual terminal: its banner, its prompt and the only commands it knows (no host shell behind it). */
type TerminalDef = { banner?: string; prompt?: string; commands: TerminalCommandDef[] };

/** The game's link to the world outside: the signals it declares and the Reality Bridge it pairs with. @public */
export interface RealityDef {
  signals: SignalDef[];
  /**
   * The Reality Bridge this game links to (`https://…`; `http://127.0.0.1` or `localhost` while developing): the
   * pause menu's "World link" pairs with it. Public, not a secret. Absent: signals only in the Studio's simulator.
   */
  bridge?: string;
  /**
   * What each connector may turn into a signal (4.1.9, wiki/en/bridge.connectors.md), as data: words an email must say,
   * the commands of a virtual terminal and the files of its virtual disk, the badge issuers a game trusts. Public (it
   * goes into the Reality manifest); every signal named here is one of `signals`. A game runs without any connector.
   */
  connectors?: {
    /** An email's subject or text containing every word of an answer (whole words, any case) proposes its signal. */
    email?: { answers: { words: string[]; signal: Id }[]; otherwise?: Id };
    telnet?: TerminalDef;
    /** `files`: the virtual disk (`/notes/readme.txt` → its text), read with `ls`, `cd` and `cat`. */
    ssh?: TerminalDef & { files?: Record<string, string> };
    /** The issuers (`issuer.id`) whose badges count, and the signal of each verdict. */
    'open-badge'?: {
      issuers: string[];
      valid: Id;
      invalid?: Id;
      expired?: Id;
      revoked?: Id;
      indeterminate?: Id;
    };
  };
}

/** What a save keeps of the link (`GameState.reality`): no token, no email, no payload. @public */
export interface RealityState {
  /** The pseudonymous id the Bridge gave this game when it was paired. */
  playerId?: string;
  /** The last sequence delivered without a gap. */
  cursor: number;
  /**
   * Signal ids applied above the cursor, with their sequence (at or below the cursor everything was applied: they
   * are compacted away, so the set stays small).
   */
  applied: Record<string, number>;
}
