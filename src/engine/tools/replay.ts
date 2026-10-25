// Replay: runs a recorded session (`Engine.session`: the inputs since a new game, a save or a checkpoint, with the
// answers given on the way) on a silent engine, and says where it stops matching the recording. A tester's bug report
// is a save plus this log; the solver's solution is one too (`SolveResult.steps`), so the same function proves it.
import { Engine, type TraceEntry } from '../core/engine';
import type { CustomCommands } from '../core/custom';
import { FakePresenter, MemoryStore } from '../core/ports';
import type { GameDef, GameState, Id, Layout, Session, SessionEntry } from '../core/types';
import { must } from '../core/must';
import { applyVariant } from '../core/remix/apply';
import { isSemanticEvent, type SemanticEvent } from '../core/journal';

/** A session to replay: `base` is only needed when it starts from a save. */
export type Replayable = Pick<Session, 'start' | 'log'> & Partial<Pick<Session, 'v' | 'base' | 'variant'>>;

export interface ReplayResult {
  state: GameState;
  trace: TraceEntry[];
  /** The semantic journal of the replay (4.1.11): the same as the recording's when nothing diverged. */
  journal: SemanticEvent[];
  /** The session the replay recorded (digests, what ran). */
  session: Session;
  /** How many entries were played. */
  played: number;
  /** The index of the first entry replayed: 1 when the log opens with a `start` entry, else 0. The entries played are `log[first .. first + played - 1]`. */
  first: number;
  /** The ending was reached. */
  ended: boolean;
  /** What the engine threw while replaying (4.1.14: a verifier says `inconclusive`, not `invalid`). */
  errors: string[];
  /** The first entry whose outcome differed from the recording, and why. */
  divergedAt?: number;
  divergence?: string;
}

export interface ReplayOptions {
  /** Play only the first `upTo` entries. */
  upTo?: number;
  commands?: CustomCommands;
  /** Called after each entry (a Studio scrubber shows the state as it goes). */
  onEntry?: (i: number, e: Engine) => void;
  /**
   * 4.1.14 (ADR 0016): replay with the run's seeded generator instead of the recorded draws. The `rnd[]` of the log are
   * not fed: the engine draws from the seed's `logic` stream, and the replay's own entries say what it drew (the
   * speedrun verifier compares them with the recording).
   */
  seed?: string;
  /** Called once on the new engine, before it starts (a listener on its session, the run clock's source). */
  attach?: (e: Engine) => void;
  /** Called before entry `i` is played (a speedrun's load restores a state here). */
  beforeEntry?: (i: number, e: Engine) => Promise<void> | void;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
/** `p` or the next turn of the event loop, the timer cleared when `p` wins (a replay of many steps runs in microtasks). */
const raceTick = async (p: Promise<unknown>) => {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      p,
      new Promise<void>((r) => {
        t = setTimeout(r, 0);
      }),
    ]);
  } finally {
    clearTimeout(t);
  }
};

/** Waits for an engine call, unless it pauses on a tutorial step: the next input of the log is that step. */
async function settle(e: Engine, p: Promise<unknown>, pending: Promise<unknown>[], errors: string[]): Promise<void> {
  let done = false;
  const q = p.then(
    () => {
      done = true;
    },
    (err) => {
      errors.push(err instanceof Error ? err.message : String(err));
      done = true;
    },
  );
  for (let guard = 0; guard < 500; guard++) {
    await raceTick(q);
    if (done) return;
    if (e.guiding) {
      pending.push(q);
      return;
    }
  }
  throw new Error('the engine never yields control back (stuck choice?)');
}

/** A short name for an entry (the journal, the Studio, the e2e harness). */
export function labelOf(game: GameDef, en: SessionEntry): string {
  if ('act' in en) {
    const v = game.verbs.find((x) => x.id === en.act.verb);
    const base = en.act.b
      ? `${v?.label ?? en.act.verb} ${en.act.a} ${v?.join ?? '→'} ${en.act.b}`
      : `${v?.label ?? en.act.verb} ${en.act.a}`;
    return `${base}${en.picks?.length ? ` [${en.picks.join(',')}]` : ''}${en.aborted ? ' (interrupted)' : ''}`;
  }
  if ('travel' in en) return `Map → ${game.map?.places[en.travel]?.name ?? en.travel}`;
  if ('switch' in en) return `Switch to ${en.switch}`;
  if ('map' in en) return `Map${en.maps?.[0] ? ` → ${game.map?.places[en.maps[0]]?.name ?? en.maps[0]}` : ' (closed)'}`;
  if ('step' in en) return `Script ${en.step}`;
  if ('script' in en) return `Run ${en.script.length} command${en.script.length > 1 ? 's' : ''}`;
  if ('enter' in en) return `Go to ${en.enter}`;
  if ('external' in en) return `Signal ${en.external.signal} (#${en.external.sequence})`;
  return `New game${en.picks?.length ? ` [${en.picks.join(',')}]` : ''}`;
}

/**
 * Replays a session on a fresh silent engine. The recorded answers (choices, map, random draws) are fed back; the
 * scripts advance exactly when they did. `divergedAt` points at the first entry whose state digest (when the
 * recording has one) or outcome differs.
 */
export async function replay(
  gameIn: GameDef,
  layouts: Record<Id, Layout>,
  session: Replayable,
  opts: ReplayOptions = {},
): Promise<ReplayResult> {
  // The world the session was played in (4.1.15, ADR 0018): rebuilt from its stored assignment, never regenerated.
  const game =
    session.variant && session.variant.hash !== gameIn.variant?.hash
      ? applyVariant(gameIn, session.variant)
      : structuredClone(gameIn);
  const ui = new FakePresenter();
  const e = new Engine(game, layouts, ui, new MemoryStore(), { commands: opts.commands });
  e.traceOn = true;
  e.digestOn = true;
  if (opts.seed === undefined)
    e.random = () => 0; // every draw was recorded; a missing one is deterministic anyway
  else e.sessions.nextSeed = opts.seed;
  opts.attach?.(e);
  e.feedSession({
    v: session.v ?? game.saveVersion,
    start: session.start,
    base: session.base ?? (null as unknown as GameState),
    log: opts.seed === undefined ? session.log : session.log.map(({ rnd: _, ...en }) => en as SessionEntry),
  });
  const pending: Promise<unknown>[] = [];
  const errors: string[] = [];
  const log = session.log;
  let i = 0;
  if (session.start.kind === 'new') {
    if (log[0] && 'start' in log[0]) i = 1;
    await settle(e, e.newGame(), pending, errors);
  } else if (session.start.kind === 'checkpoint') await e.checkpoint(session.start.id);
  else {
    if (!session.base) throw new Error('a session that starts from a save needs its base state');
    await e.load(structuredClone(session.base));
  }
  const first = i;
  const end = Math.min(log.length, opts.upTo ?? log.length);
  let divergedAt: number | undefined, divergence: string | undefined;
  let played = 0;
  for (; i < end; i++) {
    const en = must(log[i], 'log entry');
    // A pending call (the intro waiting for a tutorial step) gets to continue before the next input, as in the game.
    for (let guard = 0; guard < 100 && (guard === 0 || e.busy); guard++) await tick();
    await opts.beforeEntry?.(i, e);
    // A session exists once the replay started (a new game, a checkpoint or a load opened it).
    const s0 = e.session!;
    const n0 = s0.log.length;
    const run =
      'act' in en
        ? e.act(en.act).then(() => undefined)
        : 'travel' in en
          ? e.travel(en.travel)
          : 'switch' in en
            ? e.switchTo(en.switch)
            : 'map' in en
              ? e.openMap()
              : 'step' in en
                ? e.advance(en.step).then(() => undefined)
                : 'script' in en
                  ? e.script(en.script)
                  : 'enter' in en
                    ? e.teleport(en.enter)
                    : 'external' in en
                      ? e.receive(en.external).then(() => undefined)
                      : Promise.resolve();
    await settle(e, run, pending, errors);
    played++;
    opts.onEntry?.(i, e);
    // A session that reached SESSION_MAX rolled over into a new one: the entry is the new one's first.
    const mine = e.session === s0 ? s0.log[n0] : e.session!.log[0];
    if (!mine) {
      divergedAt = i;
      divergence = `${labelOf(game, en)}: nothing happened`;
      break;
    }
    if (en.digest && mine.digest && en.digest !== mine.digest) {
      divergedAt = i;
      divergence = `${labelOf(game, en)}: the state differs from the recording`;
      break;
    }
    if ('act' in en && 'act' in mine && !!en.aborted !== !!mine.aborted) {
      divergedAt = i;
      divergence = `${labelOf(game, en)}: ${en.aborted ? 'was interrupted' : 'ran'} in the recording`;
      break;
    }
  }
  await Promise.race([Promise.all(pending), tick().then(tick)]);
  return {
    state: e.state,
    trace: e.trace,
    journal: e.journal.since(0),
    session: e.session!,
    played,
    first,
    errors,
    ended: !!e.state.done || ui.log.includes('ENDING'),
    ...(divergedAt !== undefined ? { divergedAt, divergence } : {}),
  };
}

/** A device family, nothing finer (3.7.1): how many kinds of devices the playtests covered, never which device. */
export type DeviceFamily = 'ios' | 'android' | 'desktop';

/** The family of a user agent string (an iPad that says it is a Mac is told by its touch points). */
export function deviceFamily(ua: string, touchPoints = 0): DeviceFamily {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** The file a tester sends: the session, the journal, the game and its save version, its device family (3.7.1). */
export interface SessionFile {
  // A format identifier from web-scumm, kept so existing sessions still load (D47).
  kind: 'web-scumm-session';
  game: Id;
  v: number;
  at: number;
  session: Session;
  trace: TraceEntry[];
  device?: DeviceFamily;
  /** Taps on nothing next to a target, by `room/target` (3.8): the hotspots players aim at and miss. */
  misses?: Record<string, number>;
  /** The session's semantic journal (4.1.11), in ids: `npm run replay` checks the replay yields the same. */
  journal?: SemanticEvent[];
  /** The session outgrew the journal's window (its first events were dropped): no journal, nothing to compare. */
  journalTruncated?: true;
}

export function sessionFile(
  gameId: Id,
  e: Engine,
  o: { playtest?: boolean; device?: DeviceFamily; misses?: Record<string, number> } = {},
): SessionFile {
  if (!e.session) throw new Error('no session yet: start or load a game first');
  const session = structuredClone(e.session);
  // A playtest leaves the device with ids and indices only: no journal (its lines carry text), no dev-panel scripts.
  if (o.playtest) for (const en of session.log) if ('script' in en) en.script = [];
  // The journal only when the window still holds the whole session (a very long one has dropped its first events).
  const journal = e.journal.first <= e.sessionSeq + 1 ? e.journal.since(e.sessionSeq) : undefined;
  return {
    kind: 'web-scumm-session',
    game: gameId,
    v: e.game.saveVersion,
    at: session.at ?? Date.now(),
    session,
    trace: o.playtest ? [] : [...e.trace],
    ...(o.device ? { device: o.device } : {}),
    ...(o.misses && Object.keys(o.misses).length ? { misses: { ...o.misses } } : {}),
    ...(journal ? { journal } : { journalTruncated: true as const }),
  };
}

/** Reads a session file (or a bare session) and checks its shape. */
export function parseSessionFile(text: string): SessionFile {
  const j = JSON.parse(text) as Partial<SessionFile> & Partial<Session>;
  const session = (j.session ?? (j.log ? j : undefined)) as Session | undefined;
  if (!session || !Array.isArray(session.log) || !session.start?.kind) throw new Error('not a session file');
  const device = j.device === 'ios' || j.device === 'android' || j.device === 'desktop' ? j.device : undefined;
  const misses =
    j.misses && typeof j.misses === 'object'
      ? Object.fromEntries(
          Object.entries(j.misses).filter(([k, n]) => /^[\w-]+\/[\w-]+$/.test(k) && Number.isInteger(n) && n > 0),
        )
      : {};
  return {
    kind: 'web-scumm-session',
    game: j.game ?? '',
    v: j.v ?? session.v,
    at: j.at ?? 0,
    session,
    trace: j.trace ?? [],
    ...(device ? { device } : {}),
    ...(Object.keys(misses).length ? { misses } : {}),
    ...(Array.isArray(j.journal) ? { journal: j.journal.filter(isSemanticEvent) } : {}),
    ...(j.journalTruncated === true ? { journalTruncated: true as const } : {}),
  };
}
