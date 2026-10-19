import type { MotionSpec } from './motion';
import type { GameState, Id, MinigameOutcome, MinigameResult, Point, RoomDef, VerbId } from './types';

/**
 * What the core asks the display for. The DOM renderer implements it for the browser,
 * FakePresenter implements it for node (tests, solver). All async methods
 * receive `fast`: true when skipping a cutscene, in which case it must finish right away.
 * @extension
 */
export interface Presenter {
  enterRoom(room: RoomDef, state: GameState): Promise<void>;
  say(who: Id, text: string, o: { shout?: boolean; fast?: boolean; voice?: Id }): Promise<void>;
  /** Moves a character. Returns the arrival point, or null if the move was interrupted. */
  walk(who: Id, to: Point, fast: boolean): Promise<Point | null>;
  face(who: Id, dir: 'left' | 'right'): void;
  pose(who: Id, pose: string): void;
  anim(who: Id, pose: string, ms: number, fast: boolean): Promise<void>;
  place(who: Id, at: Point, face?: 'left' | 'right'): void;
  /** A computed motion of a character or a prop (core/motion.ts); `leader` for `follow`. Resolves when it ends. */
  motion(who: Id, m: MotionSpec, fast: boolean, leader?: Id): Promise<void>;
  wait(ms: number, fast: boolean): Promise<void>;
  prop(id: Id, state: string): void;
  /** A frame of a prop animation (null: back to the state image). */
  propFrame(id: Id, img: Id | null): void;
  /** A looping prop animation (an empty list stops it). */
  /** `onFrame`: called when the loop shows frame `i` (the engine plays the frame's sounds there). */
  propLoop(id: Id, frames: Id[], fps: number, onFrame?: (i: number) => void): void;
  /** Camera: follow the hero, or go to left edge `x` over `ms`. */
  camera(x: number | null, follow: boolean, ms: number, fast: boolean): Promise<void>;
  show(id: Id, visible: boolean, fade: number, fast: boolean): Promise<void>;
  /** Inventory contents; `used` = greyed-out items (already used). */
  inventory(items: Id[], used?: Id[]): void;
  /** A sound effect; `caption` is said in writing when the player wants captions. */
  sfx(id: Id, caption?: string): void;
  music(cmd: { play?: Id; push?: Id; pop?: true; stop?: true; once?: Id; stinger?: Id }): void;
  toast(text: string): void;
  shake(ms: number): void;
  /** Opens the map. Returns the chosen room (after the travel animation), or null if closed. */
  openMap(state: GameState): Promise<Id | null>;
  /**
   * Plays a minigame; resolves with its result when it says one (4.1.16: the code wheel), else nothing; with its
   * transcript too when it can prove it (4.1.17: `{ result, transcript }`).
   */
  minigame(id: Id, params: Record<string, unknown>): Promise<void | MinigameResult | MinigameOutcome>;
  /** Choice of responses (dialogue tree or topic menu). Returns the chosen index. */
  choose(options: { text: string; seen?: boolean; global?: boolean }[], who?: Id): Promise<number>;
  /** Call: `who` is a caller or a list (shown side by side). ringing=true: rings then Pick up; false: end of call. */
  phone(who: Id | Id[], ringing: boolean): Promise<void>;
  guide(g: { verb: VerbId; target: Id } | null): void;
  cutscene(on: boolean): void;
  /** Sealed ending. 'open': decryption, scratch ticket, confetti rain. 'card': the final card. */
  ending(phase: 'open' | 'card'): Promise<void>;
  end(): void;
}

/** The autosave store a host provides: load, save, clear, and when the latest write is durable. @extension */
export interface SaveStore {
  load(): GameState | null;
  save(s: GameState): void;
  /** False when the browser refused the deletion (reported through the store's failure callback): the save is still there. */
  clear(): Promise<boolean>;
  /** Resolves after the latest durable write has been verified. Async stores may reject on failure. */
  whenIdle?(): Promise<void>;
}

/**
 * Where signals from the world outside come from (4.1.1, Reality Bridge): the Bridge's transport (Server-Sent Events,
 * a fetch by cursor), or the Studio's simulator; injected like the stores, so the engine never touches the network.
 * Each item is a signed signal (a compact JWS) the player verifies before anything reads it.
 * @extension
 */
export interface WorldSignalPort {
  connect(input: { gameId: string; playerId: string; after: number; signal?: AbortSignal }): AsyncIterable<string>;
  /** Everything up to `through` (a sequence) is applied and saved: the Bridge may stop delivering it. */
  acknowledge(input: { playerId: string; through: number }): Promise<void>;
  close(): Promise<void>;
}

/** What the save menu shows for a manual slot. */
export interface SlotMeta {
  at: number;
  room: GameState['room'];
  roomName: string;
  v: number;
  /** Where it was made, in a build that declares its revision (4.2.2, ADR 0026: dom/revision.ts). */
  revision?: { rev: number; fingerprint: string };
}

/** Manual save slots (`GameDef.saves.slots`), durable and verified like the autosave. Numbered from 1. @extension */
export interface SlotStore {
  listSlots(count: number): Promise<(SlotMeta | null)[]>;
  getSlot(n: number): Promise<GameState | null>;
  /** False when the browser refused or lost the write (the failure was reported). */
  putSlot(n: number, state: GameState, meta: SlotMeta): Promise<boolean>;
  /** False when the browser refused the deletion (reported). */
  clearSlot(n: number): Promise<boolean>;
}

/** A save store in memory, for the tests and the solver: nothing survives the process. @public */
export class MemoryStore implements SaveStore {
  data: GameState | null = null;
  load() {
    return this.data ? structuredClone(this.data) : null;
  }
  save(s: GameState) {
    this.data = structuredClone(s);
  }
  async clear() {
    this.data = null;
    return true;
  }
}

/** Silent presenter for node: everything finishes immediately, and everything is logged to `log`. @public */
export class FakePresenter implements Presenter {
  log: string[] = [];
  /** Answers to give to choices, in order (otherwise 0, then "Bye"). */
  picks: number[] = [];
  mapPicks: (Id | null)[] = [];
  heroAt: Point = [320, 360];
  async enterRoom(room: RoomDef) {
    this.log.push(`enter ${room.id}`);
  }
  /** The voice clips the engine asked for, in order (`voice` of each line). */
  voices: Id[] = [];
  async say(who: Id, text: string, o?: { voice?: Id }) {
    this.log.push(`${who}: ${text}`);
    if (o?.voice) this.voices.push(o.voice);
  }
  async walk(who: Id, to: Point) {
    this.log.push(`walk ${who} ${to.join(',')}`);
    return to;
  }
  face() {}
  pose(who: Id, pose: string) {
    this.log.push(`pose ${who} ${pose}`);
  }
  async anim() {}
  async motion(who: Id, m: MotionSpec) {
    this.log.push(`motion ${who} ${m.kind}`);
  }
  place() {}
  async wait() {}
  prop(id: Id, state: string) {
    this.log.push(`prop ${id} ${state}`);
  }
  propFrame(id: Id, img: Id | null) {
    this.log.push(`frame ${id} ${img ?? '-'}`);
  }
  propLoop(id: Id, frames: Id[], _fps: number, onFrame?: (i: number) => void) {
    this.log.push(`loop ${id} ${frames.length}${onFrame ? ' +at' : ''}`);
  }
  async camera(x: number | null, follow: boolean) {
    this.log.push(`camera ${follow ? 'follow' : x}`);
  }
  async show(id: Id, v: boolean) {
    this.log.push(`${v ? 'show' : 'hide'} ${id}`);
  }
  inventory(items: Id[]) {
    this.log.push(`inv ${items.join(',')}`);
  }
  sfx(id: Id, caption?: string) {
    this.log.push(`sfx ${id}${caption ? ` [${caption}]` : ''}`);
  }
  music() {}
  toast(t: string) {
    this.log.push(`toast ${t}`);
  }
  shake() {}
  async openMap() {
    return this.mapPicks.length ? this.mapPicks.shift()! : null;
  }
  async minigame(id: Id): Promise<void | MinigameResult | MinigameOutcome> {
    this.log.push(`minigame ${id}`);
  }
  /** Every choice asked so far: how many options, and whether it was a topic list (the solver enumerates the others). */
  asked: { n: number; topic: boolean; texts: string[] }[] = [];
  async choose(options: { text: string }[], who?: Id) {
    this.asked.push({ n: options.length, topic: who !== undefined, texts: options.map((o) => o.text) });
    const i = this.picks.length ? this.picks.shift()! : options.length - 1;
    this.log.push(`choose ${options[i]?.text}`);
    return i;
  }
  async phone(who: Id | Id[]) {
    this.log.push(`phone ${Array.isArray(who) ? who.join('+') : who}`);
  }
  guide() {}
  cutscene() {}
  async ending(phase: 'open' | 'card') {
    if (phase === 'open') this.log.push('ENDING');
  }
  end() {
    this.log.push('END');
  }
}
