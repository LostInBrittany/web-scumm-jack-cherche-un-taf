// The session: what each input recorded (entries, the answers given while it ran, digests), fed back by a replay.
// Its owner since 4.1.5 (`Engine.sessions`): the feed, the open entries and the clock's origin live here, where
// 4.1.0 kept them on the Engine for these functions; the Engine's methods of the same name forward here. Since 4.1.14
// (ADR 0016) it also owns the run's seed and its `logic` stream (what `engine.random` draws), and the run clock it
// tells of every entry; a listener (a speedrun's recorder, the verifier) hears each entry begin and end.
import { stateDigest } from './diff';
import type { GameDef, GameState, Id, MinigameResult, MinigameTranscript, Session, SessionEntry } from './types';
import type { Presenter } from './ports';
import { SESSION_MAX } from './engine-shared';
import { derive, newSeed, type Prng } from './prng';
import { type ClockHost, EngineRunClock } from './run-clock';

/** What the session reads from its engine: the game, the state, the clock, the randomness, and whom it asks. */
export interface SessionHost extends ClockHost {
  readonly game: GameDef;
  readonly state: GameState;
  clock: (() => number) | null;
  random: () => number;
  readonly ui: Pick<Presenter, 'choose' | 'openMap' | 'minigame'>;
}

/** Hears the session's entries: `begin` when one opens (in the log's order), `end` when it closes. */
export interface SessionListener {
  begin?(entry: SessionEntry): void;
  end?(entry: SessionEntry): void;
}

/** An entry being answered: its recorded twin when replaying, and how far into its picks, maps and draws it is. */
export interface OpenEntry {
  entry: SessionEntry;
  src?: SessionEntry;
  pi: number;
  mi: number;
  ri: number;
  /** How far into its minigames' results (4.1.16). */
  gi: number;
  steps: number;
}

export class SessionLog {
  /**
   * The session: the player's inputs since the game started or a save was loaded, with the answers given on the way
   * (`SessionEntry`). Always recorded: exported with a save, it is the bug report `replay()` reproduces.
   */
  session: Session | null = null;
  /** Store a digest of the state after every input (the browser app does; the solver has no use for it). */
  digestOn = false;
  /** Replay: the recorded entries to take the answers from, in order (`feedSession`). */
  feed: SessionEntry[] | null = null;
  /** The open entries (an input can resume a pending one: the tutorial step the intro waits for). */
  open: OpenEntry[] = [];
  /** The clock's value when the session began: its entries are dated from it. */
  t0 = 0;
  /** The run's seed (`Session.seed`): set by a new game or a checkpoint, kept by a load and a rollover. */
  seed: string | null = null;
  /** The seed the next new game or checkpoint takes (a speedrun category's, a verifier's); a fresh one when null. */
  nextSeed: string | null = null;
  private logic: Prng | null = null;
  /** The seed was given by the host (`nextSeed`), not drawn: the session writes it. */
  private chosen = false;
  /** The run clock (4.1.14, core/run-clock.ts): told of every entry and every command; it never writes the state. */
  readonly runClock: EngineRunClock;
  readonly listeners = new Set<SessionListener>();

  constructor(private host: SessionHost) {
    this.runClock = new EngineRunClock(host);
  }

  /** A draw from the run's `logic` stream (the default `engine.random`). */
  draw(): number {
    if (!this.logic) this.reseed(this.nextSeed ?? newSeed());
    return this.logic!.next();
  }

  /** Where the `logic` stream stands (a resumed run restores it with `restoreDraws`). */
  drawState(): { seed: string; state: [number, number, number, number] } | null {
    // The stream and its seed are set together (`reseed`).
    return this.logic ? { seed: this.seed!, state: this.logic.state() } : null;
  }
  restoreDraws(d: { seed: string; state: readonly [number, number, number, number] }) {
    this.nextSeed = d.seed;
    this.reseed(d.seed);
    this.logic!.restore(d.state);
  }

  private reseed(seed: string) {
    // Chosen when the host named it (`nextSeed`, or `restoreDraws` for a resumed run), drawn otherwise.
    this.chosen = this.nextSeed === seed;
    this.seed = seed;
    this.nextSeed = null;
    this.logic = derive(seed, 'logic');
  }

  /** The entry being answered now. */
  get cur(): OpenEntry | undefined {
    return this.open.length ? this.open[this.open.length - 1] : undefined;
  }

  /** Opens an entry of the session (and takes its recorded twin when replaying). */
  begin(entry: SessionEntry) {
    if (!this.open.length && this.session && this.session.log.length >= SESSION_MAX) this.newSession({ kind: 'load' });
    this.session ??= this.newSession({ kind: 'load' });
    if (this.host.clock) entry.t = Math.round(this.host.clock() - this.t0);
    this.session.log.push(entry);
    this.open.push({ entry, src: this.feed?.shift(), pi: 0, mi: 0, ri: 0, gi: 0, steps: 0 });
    // Listeners first: what they read of the run clock is the state before this entry.
    for (const l of this.listeners) l.begin?.(entry);
    this.runClock.entry();
  }

  /** A fresh session from the current state; the clock, when set, dates it and its entries. */
  newSession(start: Session['start']): Session {
    const { host } = this;
    this.t0 = host.clock?.() ?? 0;
    // A new game or a checkpoint is a new run: a new seed, the clock at zero. A load and a rollover continue both.
    if (start.kind !== 'load') this.reseed(this.nextSeed ?? newSeed());
    else if (!this.logic) this.reseed(this.nextSeed ?? this.seed ?? newSeed());
    if (start.kind !== 'load') this.runClock.reset();
    this.session = {
      v: host.game.saveVersion,
      start,
      base: structuredClone(host.state),
      log: [],
      ...(host.clock ? { at: host.clock() } : {}),
      // Written when a host chose it (a speedrun, a verifier): a session nobody seeded stays as it was before 4.1.14.
      ...(this.chosen ? { seed: this.seed! } : {}),
      // The world it is played in (4.1.15): a replay rebuilds it from this assignment.
      ...(host.game.variant ? { variant: host.game.variant } : {}),
    };
    return this.session;
  }

  end() {
    const o = this.open.pop();
    if (o && this.digestOn) o.entry.digest = stateDigest(this.host.state);
    if (o) for (const l of this.listeners) l.end?.(o.entry);
  }

  /** Records what answered (a rule, a topic, a listener, a script step: the puzzle graph's ids). */
  ran(id: string) {
    const o = this.cur;
    if (o) (o.entry.ran ??= []).push(id);
  }

  /** Replays a session: the engine takes the recorded answers instead of asking the presenter. */
  feedSession(s: Session) {
    this.feed = [...s.log];
  }

  /** A choice, recorded (and fed back when replaying). */
  async choose(options: { text: string; seen?: boolean; global?: boolean; img?: Id }[], who?: Id): Promise<number> {
    const o = this.cur;
    const fed = o?.src?.picks?.[o.pi];
    const i = fed !== undefined ? (o!.pi++, fed) : await this.host.ui.choose(options, who);
    if (o) (o.entry.picks ??= []).push(i);
    return i;
  }

  /** The map's answer, recorded. */
  async pickPlace(): Promise<Id | null> {
    const o = this.cur;
    const fed = o?.src?.maps?.[o.mi];
    const p = fed !== undefined ? (o!.mi++, fed) : await this.host.ui.openMap(this.host.state);
    if (o) (o.entry.maps ??= []).push(p);
    return p;
  }

  /**
   * A minigame's result, recorded when it says one (4.1.16) and fed back when replaying: a replay never plays it again.
   * A minigame that says nothing records nothing (the sessions of 4.1.15 replay as they were).
   */
  async minigame(id: Id, params: Record<string, unknown>): Promise<MinigameResult | undefined> {
    const o = this.cur;
    const k = o?.gi ?? 0;
    const fed = o?.src?.mg?.[k];
    let r: MinigameResult | undefined;
    let t: MinigameTranscript | undefined;
    if (fed !== undefined) {
      o!.gi++;
      r = fed;
      // 4.1.17: a recorded transcript is computed again here; a result it does not give stops the replay.
      const fedT = o!.src!.mgt?.[k];
      if (fedT !== undefined && fedT !== null) {
        // Only a replay with a transcript needs the prover (and the wheel): out of the player's first visit.
        const { proveMinigame, TRANSCRIPT_REFUSED } = await import('./minigame-proofs');
        const proved = proveMinigame(id, params, fedT);
        if ('error' in proved)
          throw new Error(`${TRANSCRIPT_REFUSED} ${id}: its transcript is not one of this run (${proved.error})`);
        if (proved.result !== r)
          throw new Error(`${TRANSCRIPT_REFUSED} ${id}: its transcript gives ${proved.result}, not ${r}`);
        t = fedT;
      }
    } else {
      const out = (await this.host.ui.minigame(id, params)) ?? undefined;
      r = typeof out === 'object' ? out.result : out;
      t = typeof out === 'object' ? out.transcript : undefined;
    }
    if (o && r !== undefined) {
      const mg = (o.entry.mg ??= []);
      mg.push(r);
      if (t) {
        // Aligned with `mg`: a result without a transcript before this one is a null.
        const mgt = (o.entry.mgt ??= []);
        while (mgt.length < mg.length - 1) mgt.push(null);
        mgt.push(t);
      }
    }
    return r;
  }

  /** A random draw, recorded. */
  rand(): number {
    const o = this.cur;
    const fed = o?.src?.rnd?.[o.ri];
    const r = fed !== undefined ? (o!.ri++, fed) : this.host.random();
    if (o) (o.entry.rnd ??= []).push(r);
    return r;
  }
}
