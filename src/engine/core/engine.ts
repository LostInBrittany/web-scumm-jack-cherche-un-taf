import { check, condAtoms } from './cond';
import { compileGame, EMPTY_LAYOUT } from './define';
import { migrate } from './migrate';
import type { Presenter, SaveStore } from './ports';
import type {
  Action,
  CharacterDef,
  ListLine,
  Cmd,
  ExternalEntry,
  Cond,
  GameDef,
  GameState,
  Id,
  Layout,
  Point,
  RoomDef,
  Rule,
  ScriptDef,
  Session,
  SessionEntry,
  VerbId,
} from './types';
import type { CustomCommands } from './custom';

export type { Action } from './types';

export interface EngineOptions {
  /** The game's custom commands (`{ custom }`), from games/<id>/index.ts. */
  commands?: CustomCommands;
  /** Run their `run` part (the browser app); off in node (tests, solver): only `effects` apply. */
  runCustom?: boolean;
  /** The scene element handed to custom commands (DOM renderer). */
  scene?: () => HTMLElement | undefined;
}

import {
  guests as guestsImpl,
  nameOf as nameOfImpl,
  character as characterImpl,
  kindsOf as kindsOfImpl,
  isUsed as isUsedImpl,
  usedLocked as usedLockedImpl,
  visible as visibleImpl,
  instanceOf as instanceOfImpl,
  propState as propStateImpl,
  targets as targetsImpl,
  inScene as inSceneImpl,
  approach as approachImpl,
  centerX as centerXImpl,
} from './world-queries';
import {
  otherPlayers as otherPlayersImpl,
  homes as homesImpl,
  switchTo as switchToImpl,
  swap as swapImpl,
  transfer as transferImpl,
} from './players';
import {
  enter as enterImpl,
  walkTo as walkToImpl,
  travel as travelImpl,
  openMap as openMapImpl,
  teleport as teleportImpl,
  faceEachOther as faceEachOtherImpl,
} from './movement';
import type { ReceiveResult } from './reality-runtime';
import { SessionLog } from './session-runtime';
import { Journal } from './journal';
import { ObjectiveTracker } from './objectives';
import { Busy } from './busy';
import { emit as emitImpl } from './event-runtime';
import {
  scriptDef as scriptDefImpl,
  scriptsHere as scriptsHereImpl,
  scriptState as scriptStateImpl,
  advance as advanceImpl,
  runScript as runScriptImpl,
  script as scriptImpl,
} from './script-runtime';
import {
  resolve as resolveImpl,
  findRule as findRuleImpl,
  findKind as findKindImpl,
  fill as fillImpl,
  text as textImpl,
  voiceOf as voiceOfImpl,
  sayFallback as sayFallbackImpl,
  fallback as fallbackImpl,
  pickLine as pickLineImpl,
  hint as hintImpl,
  talkLoop as talkLoopImpl,
} from './interactions';
import {
  say as sayImpl,
  point as pointImpl,
  actorKey as actorKeyImpl,
  spot as spotImpl,
  exec as execImpl,
  step as stepImpl,
} from './command-runtime';
import { atomKey, HERO, SESSION_MAX, type Ctx, type Source, type TraceEntry } from './engine-shared';
import { ScriptScheduler } from './scheduler';
import { roomKey } from './keys';
export { describeCmd } from './engine-shared';
export type { Source, TraceEntry } from './engine-shared';

/**
 * The engine without a page: it runs a game against a Presenter and a SaveStore, in the browser, in node tests and in
 * the solver.
 * @public
 */
export class Engine {
  readonly game: GameDef;
  readonly layouts: Record<Id, Layout>;
  state!: GameState;
  private rooms: Map<Id, RoomDef>;
  /** @internal Read by the modules of core/ (4.1.0). */
  lastFallback: Record<string, number> = {};
  /**
   * @internal The `{ talk }` command that ends the rule being resolved (4.3.0, #218): the one conversation that is the
   * whole rest of its action, so its topics may be saved. Null outside a rule.
   */
  tailTalk: Cmd | null = null;
  /** @internal The busy owner (4.1.11, core/busy.ts): runs in progress, the tutorial step waited for, a skip. */
  readonly busyState = new Busy();
  /** Called on every state change relevant to the UI (inventory, room, busy state). */
  onChange: () => void = () => {};
  /**
   * A failure the engine survives (4.1.4): a script that threw (stopped, `scripts[id].off`, and said here), a custom
   * command that changed more than it declared. The browser logs; a host or a test hears it. Never a payload.
   */
  onError: (error: unknown, where: string) => void = (error, where) => console.error(where, error);
  /** What `beforeSave` returns is what the store writes (4.1.4): the player adds the music's phase this way. */
  beforeSave: ((state: GameState) => GameState) | null = null;
  /** Around `load` (4.1.4): `before` sees the migrated state, `after` runs once the room is entered or failed. */
  onLoad: { before?: (state: GameState) => void; after?: () => void } = {};
  /** @internal Woken by the next state change: `waitUntil` and anyone waiting on the engine (4.1.4). */
  waiters = new Set<() => void>();
  /** Ended by `destroy()`: no loop runs, no waiter waits, nothing is called back (4.1.4). */
  destroyed = false;
  /** The journal (dev tools, Studio Play tab): what answered, which events fired, how scripts moved. Kept only when `traceOn`. */
  trace: TraceEntry[] = [];
  traceOn = false;
  /** @internal Read by the modules of core/ (4.1.0). */
  log(kind: TraceEntry['kind'], text: string) {
    if (!this.traceOn) return;
    this.trace.push({ t: this.clock?.() ?? Date.now(), kind, text, room: this.state.room });
    if (this.trace.length > 200) this.trace.splice(0, this.trace.length - 200);
  }
  /** Injectable randomness (the solver makes it deterministic); by default the run's seeded `logic` stream (4.1.14). */
  random: () => number = () => this.sessions.draw();
  /** A clock (ms) for the session's `t` timestamps; none in the solver and the tests, so their sessions stay byte-identical. */
  clock: (() => number) | null = null;
  /** The session's owner (4.1.5, core/session-runtime.ts): the entries, their feed on replay, the clock's origin. */
  readonly sessions = new SessionLog(this);
  /** The run clock (4.1.14, ADR 0016, core/run-clock.ts): it observes the core and never writes the state (D24). */
  get runClock() {
    return this.sessions.runClock;
  }
  /** What happened, in ids (4.1.11, core/journal.ts): emitted by the core alone, the same on a replay. */
  readonly journal = new Journal();
  /** The objectives completed in this session (4.1.12, core/objectives.ts), checked at every save. */
  readonly objectives = new ObjectiveTracker(this);
  /** The journal's sequence when the current session began: its events are `journal.since(sessionSeq)`. */
  sessionSeq = 0;
  /**
   * The session: the player's inputs since the game started or a save was loaded, with the answers given on the way
   * (`SessionEntry`). Always recorded: exported with a save, it is the bug report `replay()` reproduces.
   */
  get session(): Session | null {
    return this.sessions.session;
  }
  set session(s: Session | null) {
    this.sessions.session = s;
  }
  /** Store a digest of the state after every input (the browser app does; the solver has no use for it). */
  get digestOn() {
    return this.sessions.digestOn;
  }
  set digestOn(on: boolean) {
    this.sessions.digestOn = on;
  }
  /** Condition atoms read since the last `reads = new Set()` (the solver's independence analysis); null: not collected. */
  reads: Set<string> | null = null;
  /**
   * State writes since the solver last set it (`kind:id`, `*` for a write the solver cannot name): a command of
   * `CHANGES`, a counter (`once`, `nth`, `random`), a seen mark (topic, `once` choice or listener), a room entry, a
   * script step, a switch or a transfer. Recorded even when the value written is the one already there: a run that
   * writes nothing the solver hashes is a no-op wherever it reads the same. Null: not collected.
   */
  writes: Set<string> | null = null;
  static readonly SESSION_MAX = SESSION_MAX;

  /** Opens an entry of the session (and takes its recorded twin when replaying). */
  begin(entry: SessionEntry) {
    this.sessions.begin(entry);
  }
  /** A fresh session from the current state; the clock, when set, dates it and its entries. */
  newSession(start: Session['start']): Session {
    return this.sessions.newSession(start);
  }

  end() {
    this.sessions.end();
  }
  /** Records what answered (a rule, a topic, a listener, a script step: the puzzle graph's ids). */
  ran(id: string) {
    this.sessions.ran(id);
  }
  /** Replays a session: the engine takes the recorded answers instead of asking the presenter. */
  feedSession(s: Session) {
    this.sessions.feedSession(s);
  }
  /** A choice, recorded (and fed back when replaying). */
  choose(options: { text: string; seen?: boolean; global?: boolean; img?: Id }[], who?: Id): Promise<number> {
    return this.sessions.choose(
      options.map((o) => ({ ...o, text: this.text(o.text) })),
      who,
    );
  }
  /** A text as shown now (4.3.0, core/text-switch.ts): its switches and `{hero}` filled, after `fill()` and translation. */
  text(s: string): string {
    return textImpl(this, s);
  }
  /** The map's answer, recorded. */
  pickPlace(): Promise<Id | null> {
    return this.sessions.pickPlace();
  }
  /** A random draw, recorded. */
  rand(): number {
    return this.sessions.rand();
  }
  /** @internal Read by the modules of core/ (4.1.0): a condition, with its atoms collected when `reads` is on. */
  cond(c: Cond | undefined, room?: Id): boolean {
    if (this.reads && c !== undefined)
      for (const a of condAtoms(c, room ?? this.state.room)) this.reads.add(atomKey(a));
    return check(c, this.state, room);
  }
  /**
   * The world's scripts run on their own (the browser app sets it). Off in node: tests and the solver step them
   * with `runScript` / `advance`.
   */
  autoScripts = false;
  /** The running loops of the world's scripts and the generations that end them (4.1.5, `core/scheduler.ts`). */
  readonly scheduler = new ScriptScheduler(this);

  constructor(
    game: GameDef,
    layouts: Record<Id, Layout>,
    readonly ui: Presenter,
    readonly store: SaveStore,
    readonly opts: EngineOptions = {},
  ) {
    this.game = compileGame(game) as GameDef;
    this.layouts = layouts;
    this.rooms = new Map(this.game.rooms.map((r) => [r.id, r]));
  }

  // ------------------------------------------------------------------ game session

  fresh(): GameState {
    const s = this.game.start;
    return {
      v: this.game.saveVersion,
      room: s.room,
      inventory: [...(s.inventory ?? [])],
      flags: { ...(s.flags ?? {}) },
      props: {},
      actors: {},
      hero: {},
      unlocked: [...(s.unlocked ?? [])],
      visited: {},
      counters: {},
      seen: {},
      started: this.clock?.() ?? Date.now(),
      where: this.homes(),
      scripts: {},
      camera: { x: 0, follow: true },
      active: this.game.hero,
    };
  }

  /** The other playable characters' starting records (`players.start`). */
  otherPlayers(): NonNullable<GameState['players']> {
    return otherPlayersImpl(this);
  }

  /** Starting room of every moving character (`CharacterDef.room`). */
  homes(): Record<Id, Id> {
    return homesImpl(this);
  }

  /** Fills what a state may lack: props' initial state, moving characters' room, scripts (new game, old save, content added since). */
  private ensureState(s: GameState) {
    for (const r of this.game.rooms)
      for (const [id, p] of Object.entries(r.props ?? {})) {
        const k = roomKey(r.id, id);
        if (s.props[k] === undefined && p.states) {
          const initial = p.initial ?? Object.keys(p.states)[0];
          if (initial !== undefined) s.props[k] = initial;
        }
      }
    s.where = { ...this.homes(), ...(s.where ?? {}) };
    s.scripts ??= {};
    s.camera ??= { x: 0, follow: true };
    s.active ??= this.game.hero;
    if (this.game.players) {
      s.players = { ...this.otherPlayers(), ...(s.players ?? {}) };
      delete s.players[s.active];
    }
    return s;
  }

  hasSave(): boolean {
    return !!migrate(this.game, this.store.load());
  }

  async newGame(): Promise<void> {
    this.dropGuide();
    this.state = this.ensureState(this.fresh());
    this.store.save(this.state);
    this.newSession({ kind: 'new' });
    this.startJournal('new');
    this.begin({ start: 'new' });
    this.ran('rule:game/start');
    try {
      // The prologue runs before the first room's arrival script (otherwise the tutorial would wait for it).
      await this.enter(this.state.room, undefined, false);
      if (this.game.start.intro)
        await this.run(() => this.exec(this.game.start.intro, { room: this.room(), fast: false }));
      const first = this.room();
      if (first.onEnter) {
        this.ran(`rule:${first.id}/enter`);
        await this.run(() => this.exec(first.onEnter, { room: first, fast: false }));
      }
    } finally {
      this.end();
    }
    this.startScripts(true);
  }

  async continueGame(): Promise<void> {
    const s = migrate(this.game, this.store.load());
    if (!s) return this.newGame();
    await this.load(s);
  }

  /** Resumes from a state (the autosave, a manual slot, an imported file), migrated if it is older. */
  async load(saved: GameState): Promise<void> {
    const s = migrate(this.game, saved);
    if (!s) throw new Error(`save version ${saved.v} cannot be migrated to ${this.game.saveVersion}`);
    this.onLoad.before?.(s);
    try {
      this.dropGuide();
      this.state = this.ensureState(s);
      this.save();
      this.newSession({ kind: 'load' });
      this.startJournal('load', true);
      await this.enter(s.room, undefined, false);
      this.startScripts(true);
    } finally {
      this.onLoad.after?.();
    }
  }

  /** The journal's mark of a new session (a load is journalled first). */
  private startJournal(session: string, load = false) {
    this.sessionSeq = this.journal.seq;
    if (load) this.journal.emit({ kind: 'loadMade' });
    this.journal.emit({ kind: 'sessionStarted', session });
  }

  /** Forgets a pending tutorial step (game session change). */
  private dropGuide() {
    this.objectives.reset();
    this.busyState.reset();
    this.ui.guide(null);
    this.scheduler.next(true);
  }

  /** Loads a checkpoint (dev mode, solver). */
  async checkpoint(id: Id): Promise<void> {
    this.dropGuide();
    const c = this.game.checkpoints?.[id];
    if (!c) throw new Error(`unknown checkpoint: ${id}`);
    const s = this.fresh();
    Object.assign(s, {
      room: c.room,
      inventory: [...(c.inventory ?? [])],
      flags: { ...(c.flags ?? {}) },
      unlocked: [...(c.unlocked ?? s.unlocked)],
      props: { ...(c.props ?? {}) },
      where: { ...s.where, ...(c.where ?? {}) },
    });
    if (c.used) s.used = [...c.used];
    if (c.seen) s.seen = { ...c.seen };
    if (c.active) s.active = c.active;
    if (c.players) {
      s.players = {};
      for (const [pid, p] of Object.entries(c.players))
        if (pid !== s.active)
          s.players[pid] = {
            room: p.room,
            inventory: [...(p.inventory ?? [])],
            hero: {},
            ...(p.used ? { used: [...p.used] } : {}),
          };
    }
    this.state = this.ensureState(s);
    this.newSession({ kind: 'checkpoint', id });
    this.startJournal(`checkpoint:${id}`);
    await this.enter(c.room, undefined, false);
    this.startScripts(true);
  }

  save() {
    this.objectives.check();
    this.store.save(this.beforeSave ? this.beforeSave(this.state) : this.state);
  }

  /**
   * Ends this engine (4.1.4): the script loops stop at their next step, whoever waits on it is released, nothing is
   * called back any more. The state stays readable. A host that makes engines (the Studio's preview, a test) calls it.
   */
  destroy(): void {
    this.destroyed = true;
    this.scheduler.stopAll();
    this.wake();
    this.onChange = () => {};
    this.onError = () => {};
  }

  /** @internal Releases whoever waits for a state change (4.1.4). */
  wake(): void {
    for (const f of [...this.waiters]) f(); // each continues on a microtask, after the set is cleared below
    this.waiters.clear();
  }

  get busy() {
    return this.busyState.busy;
  }
  get guiding() {
    return this.busyState.guiding;
  }
  room(id: Id = this.state.room): RoomDef {
    const r = this.rooms.get(id);
    if (!r) throw new Error(`unknown room: ${id}`);
    return r;
  }
  layout(id: Id = this.state.room): Layout {
    return this.layouts[id] ?? EMPTY_LAYOUT;
  }

  // ------------------------------------------------------------------ queries for the UI

  /** The character the player controls now. */
  heroId() {
    return this.state?.active ?? this.game.hero;
  }
  /** The playable characters (`players.ids`, or just the hero). */
  playerIds(): Id[] {
    return this.game.players?.ids ?? [this.game.hero];
  }
  isPlayer(id: Id) {
    return this.playerIds().includes(id);
  }
  /** Inactive players standing in this room with no actor declared for them: shown by the view, targetable. */
  guests(room: RoomDef = this.room()): Record<Id, { char: Id; at: Point }> {
    return guestsImpl(this, room);
  }
  /** @internal Read by the modules of core/ (4.1.0). */
  who(w: Id) {
    return w === HERO ? this.heroId() : w;
  }

  // ------------------------------------------------------------------ several playable characters

  /** The player takes control of another character: their room, position and inventory come up. */
  async switchTo(id: Id): Promise<void> {
    return switchToImpl(this, id);
  }

  /** @internal Read by the modules of core/ (4.1.0): stores the active player's fields, loads the other's. */
  async swap(id: Id) {
    return swapImpl(this, id);
  }

  /** @internal Read by the modules of core/ (4.1.0): hands an item to another player's inventory. */
  transfer(item: Id, to: Id) {
    return transferImpl(this, item, to);
  }

  /** Display name of any id (item, actor, prop, hotspot), its switches filled (4.3.0). */
  nameOf(id: Id, room: RoomDef = this.room()): string {
    return this.text(nameOfImpl(this, id, room));
  }

  /** A character's sheet with the variant that applies to the current state (sprites, mouths, portrait). */
  character(id: Id): CharacterDef | undefined {
    return characterImpl(this, id);
  }

  kindsOf(id: Id, room: RoomDef = this.room()): string[] {
    return kindsOfImpl(this, id, room);
  }

  /** Has the inventory item already been used (`{ used }`)? */
  isUsed(id: Id): boolean {
    return isUsedImpl(this, id);
  }

  /**
   * Item greyed out and inert for Use / Give: it has been used, and no room or game rule (whose condition is true)
   * still targets it as `a` or `b`.
   */
  usedLocked(id: Id, room: RoomDef = this.room()): boolean {
    return usedLockedImpl(this, id, room);
  }

  /** Is the entity visible in the current room? A moving character only shows in the room it is in. */
  visible(id: Id, room: RoomDef = this.room()): boolean {
    return visibleImpl(this, id, room);
  }

  /** The actor of a character in a room (its id in `room.actors`), if declared there. */
  instanceOf(char: Id, room: RoomDef): Id | undefined {
    return instanceOfImpl(this, char, room);
  }

  propState(id: Id, room: RoomDef = this.room()): string | undefined {
    return propStateImpl(this, id, room);
  }

  /** Everything that can be targeted in the room (ids), in the content's display order. */
  targets(room: RoomDef = this.room()): Id[] {
    return targetsImpl(this, room);
  }

  /** Is this id something the room offers to target (declared and visible)? Reads only what concerns it. */
  inScene(id: Id, room: RoomDef): boolean {
    return inSceneImpl(this, id, room);
  }

  /** Point where the hero stands to act on a target. */
  approach(id: Id, room: RoomDef = this.room()): Point | null {
    return approachImpl(this, id, room);
  }

  /** Horizontal center of a target (for turning to face it). */
  centerX(id: Id, room: RoomDef = this.room()): number | null {
    return centerXImpl(this, id, room);
  }

  // ------------------------------------------------------------------ player actions

  /** Executes a player action: walk to the target, then react. */
  async act(act: Action): Promise<Source | null> {
    if (this.busy) return null;
    // Guided tutorial: only one action is accepted, others repeat the instruction.
    const g = this.busyState.guide;
    if (g) {
      if (!this.busyState.accepts(act)) {
        await this.run(async () => {
          await this.ui.say(this.heroId(), this.text(g.say), {});
        });
        return 'guide';
      }
    }
    let src: Source | null = null;
    const entry: SessionEntry = { act: { ...act } };
    this.begin(entry);
    if (this.reads) {
      this.reads.add(`item:${act.a}`);
      if (act.b) this.reads.add(`item:${act.b}`);
    }
    try {
      // Replaying a walk the player interrupted: nothing happened then, nothing happens now.
      if (this.sessions.cur?.src && 'act' in this.sessions.cur.src && this.sessions.cur.src.aborted) {
        entry.aborted = true;
        return null;
      }
      await this.run(async () => {
        const room = this.room();
        const target = act.b ?? act.a;
        const inScene = !this.state.inventory.includes(target) && this.inScene(target, room);
        if (inScene) {
          const ap = this.approach(target, room);
          if (ap) {
            const end = await this.ui.walk(this.heroId(), ap, false);
            if (!end) {
              entry.aborted = true;
              return;
            }
            this.state.hero[room.id] = end;
            this.runClock.walk(room.id, this.heroId(), ap);
          }
        }
        if (inScene) faceEachOtherImpl(this, target, room);
        src = await this.resolve(act, { room, fast: false });
        this.log('action', `${act.verb} ${act.a}${act.b ? ` → ${act.b}` : ''}: ${src ?? 'nothing'}`);
      });
    } finally {
      this.end();
    }
    const step = this.busyState.guide;
    if (step && src !== null && this.busyState.accepts(act)) {
      this.busyState.guide = null;
      this.ui.guide(null);
      step.resolve();
    }
    return src;
  }

  /** Walk to a point on the floor. */
  async walkTo(p: Point): Promise<void> {
    return walkToImpl(this, p);
  }

  /** Travel to a place on the map. */
  async travel(place: Id): Promise<void> {
    return travelImpl(this, place);
  }

  /** Opens the map from the UI. */
  async openMap(): Promise<void> {
    return openMapImpl(this);
  }

  /** Goes to a room without playing its arrival script (dev panel). */
  async teleport(id: Id): Promise<void> {
    return teleportImpl(this, id);
  }

  /** Skip the current cutscene. */
  skip() {
    this.busyState.skipping = true;
    const o = this.sessions.cur;
    if (o) o.entry.skipAt = o.steps;
  }

  /** @internal Read by the modules of core/ (4.1.0). */
  async run(fn: () => Promise<void>) {
    this.busyState.enter();
    this.onChange();
    try {
      await fn();
    } finally {
      if (this.busyState.leave()) {
        this.save();
        this.journal.saved();
      }
      this.onChange();
      this.wake();
    }
  }

  // ------------------------------------------------------------------ resolution

  /** Finds the reaction to an action and executes it. */
  async resolve(act: Action, ctx: Ctx): Promise<Source> {
    return resolveImpl(this, act, ctx);
  }

  /** Matching written rule (room, then game). Exposed for the solver. */
  findRule(verb: VerbId, a: Id, b: Id | undefined, room: RoomDef): (Rule & { id: string }) | null {
    return findRuleImpl(this, verb, a, b, room);
  }

  findKind(verb: VerbId, a: Id, b: Id | undefined, room: RoomDef): { id?: Id; say: string } | null {
    return findKindImpl(this, verb, a, b, room);
  }

  fill(text: string, a: Id, b?: Id): string {
    return fillImpl(this, text, a, b);
  }

  /** A line's voice clip: its keyed id for its switches' values, else its id, when `audio.voices` has the clip. */
  voiceOf(l: ListLine | { id?: Id }, text?: string): Id | undefined {
    return voiceOfImpl(this, l, text);
  }

  async sayFallback(who: Id, key: string, ctx: Ctx, a: Id, b?: Id) {
    return sayFallbackImpl(this, who, key, ctx, a, b);
  }

  fallback(key: string): ListLine {
    return fallbackImpl(this, key);
  }

  pickLine(key: string, lines: string | ListLine[]): ListLine {
    return pickLineImpl(this, key, lines);
  }

  async hint(ctx: Ctx) {
    return hintImpl(this, ctx);
  }

  /** Conversation topic menu, until "Bye"; `saveTopics` when nothing of the action follows it (4.3.0, #218). */
  async talkLoop(actor: Id, ctx: Ctx, saveTopics = false) {
    return talkLoopImpl(this, actor, ctx, saveTopics);
  }

  // ------------------------------------------------------------------ rooms

  /** Enters a room: state, display, music, then arrival script. */
  async enter(id: Id, at: Id | Point | undefined, runEnter: boolean) {
    return enterImpl(this, id, at, runEnter);
  }

  // ------------------------------------------------------------------ the world's scripts and events

  /** A script by id, wherever it is declared (ids are unique in the game). */
  scriptDef(id: Id): ScriptDef | undefined {
    return scriptDefImpl(this, id);
  }

  /** The scripts in scope right now: the current room's, then the game's. */
  scriptsHere(): ScriptDef[] {
    return scriptsHereImpl(this);
  }

  /** State of a script: next command (`pc`), finished, stopped. */
  scriptState(id: Id) {
    return scriptStateImpl(this, id);
  }

  /**
   * One step of a script. 'ran': a command ran, or a wait was satisfied. 'blocked': the engine is busy (player action,
   * cutscene, conversation, minigame), the `while` condition is false, a `waitUntil` is false or a `waitEvent` pending.
   * 'wrapped': a loop starts again. 'done', 'off': finished, stopped.
   */
  async advance(id: Id): Promise<'ran' | 'blocked' | 'wrapped' | 'done' | 'off'> {
    return advanceImpl(this, id);
  }

  /**
   * Runs a script until it blocks, finishes or completes one iteration of its loop (tests, solver). True if anything ran.
   * `turn`: stop before the next `wait` instead, once something ran: for the solver, letting time pass is one choice at a
   * time (a patrol that walks in, then out, must be seen in between).
   */
  async runScript(id: Id, turn = false): Promise<boolean> {
    return runScriptImpl(this, id, turn);
  }

  /** Starts the loops of the scripts in scope (auto mode): the room's on each room entry, the game's too on a new session. */
  startScripts(session: boolean) {
    this.scheduler.start(session);
  }

  /** Fires an event: moves the scripts waiting for it, then runs the listeners of the room, then of the game. */
  /**
   * A verified signal from the world outside (4.1.1): applied at most once, recorded in the session, saved with the
   * state. `busy`: the engine is running something (a dialogue, a cutscene, a minigame), deliver it again when idle.
   */
  async receive(x: ExternalEntry): Promise<ReceiveResult> {
    // Loaded on the first signal: a game without `reality` never downloads it (4.1.1).
    return (await import('./reality-runtime')).receive(this, x);
  }

  async emit(id: Id, ctx: Ctx) {
    return emitImpl(this, id, ctx);
  }

  // ------------------------------------------------------------------ scripts

  /** Runs a script in the current room (usable by the UI or tests). */
  async script(cmds: Cmd[]) {
    return scriptImpl(this, cmds);
  }

  async say(who: Id, text: string, ctx: Ctx, shout = false, voice?: Id) {
    return sayImpl(this, who, text, ctx, shout, voice);
  }

  point(t: Id | Point, room: RoomDef): Point {
    return pointImpl(this, t, room);
  }

  actorKey(who: Id, room: RoomDef) {
    return actorKeyImpl(this, who, room);
  }

  /** Where a thing stands, for a motion's ends: a prop's or an actor's feet, a hotspot's centre, else its approach point. */
  spot(t: Id | Point, room: RoomDef): Point {
    return spotImpl(this, t, room);
  }

  async exec(cmds: Cmd[] | undefined, ctx: Ctx): Promise<void> {
    return execImpl(this, cmds, ctx);
  }

  async step(c: Cmd, ctx: Ctx): Promise<void> {
    return stepImpl(this, c, ctx);
  }
}
