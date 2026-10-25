// The browser's Presenter (4.1.11 "Viewport", ADR 0011): what the engine asks the screen to do (a room entered, a
// line, a walk, a prop, a sound, a choice, a call, the map, a minigame, the ending) and the one door the player's
// input goes through to reach the engine (`intent`). It was App's own surface until 4.1.10; App now composes it with
// the room view and its painter (dom/room.ts, dom/frame-renderer.ts). The overlays it draws (lines, toasts, the
// spark, the cutscene's skip) are DOM; the scene itself is the room view's.
import { derive } from '../core/prng';
import type { MotionSpec } from '../core/motion';
import type { Presenter } from '../core/ports';
import type {
  GameState,
  Id,
  MinigameOutcome,
  MinigameResult,
  MinigameTranscript,
  Point,
  RoomDef,
  VerbId,
} from '../core/types';
import { FONT_PIXEL, FONT_UI } from './fonts';
import { el, esc, sleep } from './app-shared';
import { choose as chooseImpl, phone as phoneImpl, say as sayImpl } from './speech';
import { openMap as openMapImpl } from './map-view';
import { applyIntent } from '../scene/intent';
import type { Intent } from '../scene/frame';
import type { App } from './app';

/** The results a minigame may report (4.1.16, `MinigameResult`). */
const MINIGAME_RESULTS = new Set(['won', 'passed', 'skipped', 'failed', 'disabled']);

export class DomPresenter implements Presenter {
  private sparkEl: HTMLImageElement | null = null;
  /** The choice on screen: its answer, until a `pick` intention gives it (dom/speech.ts sets it). */
  picking: ((i: number) => void) | null = null;

  constructor(private app: App) {}

  // ---------------------------------------------------------------- the player's intentions

  /**
   * The player's input, as an intention (the input layer, dom/input.ts, makes them; a renderer with an input of its own
   * sends them through `Renderer.onIntent`). The engine's are applied (scene/intent.ts); a pick answers the choice on
   * screen; `open` opens the map, the pause menu or focuses the bag.
   */
  async intent(i: Intent): Promise<void> {
    const app = this.app;
    // The presenter's own, at once (a choice row's tap closes the choice in the same event, as before 4.1.11).
    if (i.kind === 'pick') return this.picking?.(i.choice);
    if (i.kind === 'open') {
      if (i.what === 'menu') app.pauseMenu();
      else if (i.what === 'inventory') app.invEl.querySelector<HTMLElement>('button')?.focus();
      else if (!app.engine.busy && !app.speechEl) await app.engine.openMap();
      return;
    }
    const applied = applyIntent(app.engine, i); // its synchronous part runs now: a skip is set before the line ends
    if (i.kind === 'skip') app.endSpeech();
    await applied;
  }

  // ---------------------------------------------------------------- the scene

  async enterRoom(room: RoomDef) {
    const app = this.app;
    app.resetVerb();
    app.showLabel(null);
    this.guide(null);
    app.scene.style.visibility = 'hidden';
    await app.view.build(room);
    app.view.resize(app.u);
    app.scene.style.visibility = '';
    app.renderA11yTargets();
    app.live.textContent = room.name;
    void app.warmAround(room.id);
  }
  walk(who: Id, to: Point, fast: boolean) {
    return this.app.view.walker.walkTo(who, to, fast);
  }
  face(who: Id, dir: 'left' | 'right') {
    this.app.view.face(who, dir);
  }
  pose(who: Id, pose: string) {
    this.app.view.pose(who, pose);
    this.app.callPose(who, pose);
  }
  anim(who: Id, pose: string, ms: number, fast: boolean) {
    return this.app.view.anim(who, pose, ms, fast);
  }
  place(who: Id, at: Point, face?: 'left' | 'right') {
    this.app.view.place(who, at, face);
  }
  wait(ms: number, fast: boolean) {
    return fast ? Promise.resolve() : sleep(ms);
  }
  prop(id: Id, state: string) {
    this.app.view.setProp(id, state);
    this.app.view.refreshVisibility();
  }
  propFrame(id: Id, img: Id | null) {
    this.app.view.propFrame(id, img);
  }
  propLoop(id: Id, frames: Id[], fps: number, onFrame?: (i: number) => void) {
    this.app.view.propLoop(id, frames, fps, onFrame);
  }
  camera(x: number | null, follow: boolean, ms: number, fast: boolean) {
    if (follow || x === null) {
      this.app.view.camera.followHero();
      return Promise.resolve();
    }
    return this.app.view.camera.setCamera(x, fast ? 0 : ms);
  }
  show(id: Id, visible: boolean, fade: number, fast: boolean) {
    return this.app.view.show(id, visible, fade, fast || this.app.settings.reduceMotion);
  }
  motion(who: Id, m: MotionSpec, fast: boolean, leader?: Id) {
    return this.app.view.walker.motion(who, m, fast || this.app.view.reduceMotion, leader);
  }
  inventory(items: Id[], used?: Id[]) {
    const app = this.app;
    app.used = [...(used ?? [])];
    if (!app.view.room) {
      app.items = [...items];
      return;
    }
    const previous = new Set(app.items);
    const added = items.length > app.items.length;
    app.items = [...items];
    if (added) {
      const names = items
        .filter((id) => !previous.has(id))
        .map((id) => app.engine.text(app.game.items[id]?.name ?? id));
      if (names.length) app.live.textContent = names.join(', ');
    }
    if (added) app.invPage = Math.max(0, Math.ceil((items.length - app.invCols * 2) / app.invCols));
    app.renderInv();
    app.view.refreshVisibility();
    app.view.redraw();
  }

  // ---------------------------------------------------------------- sounds, lines, overlays

  say(who: Id, text: string, o: { shout?: boolean; fast?: boolean; voice?: Id }): Promise<void> {
    return sayImpl(this.app, who, text, o);
  }
  sfx(id: Id, caption?: string) {
    const app = this.app;
    app.audio.sfx(id);
    // A sound that matters, in writing (`{ sfx, caption }`), for whoever plays without sound or cannot hear it.
    if (caption && app.settings.captions && app.scene) {
      app.live.textContent = caption;
      const c = el('div', 'caption', esc(caption));
      app.scene.append(c);
      setTimeout(() => c.remove(), Math.max(1800, caption.length * 70));
    }
  }
  music(c: { play?: Id; push?: Id; pop?: true; stop?: true; once?: Id; stinger?: Id }) {
    const a = this.app.audio;
    if (c.play) a.play(c.play);
    else if (c.push) a.push(c.push);
    else if (c.pop) a.pop();
    else if (c.stop) a.stop();
    else if (c.once) a.once(c.once);
    else if (c.stinger) a.stinger(c.stinger);
  }
  toast(text: string) {
    const app = this.app;
    app.live.textContent = text;
    const t = el('div', 'toast', esc(text));
    app.scene.append(t);
    setTimeout(() => t.remove(), 2400);
  }
  shake(ms: number) {
    const app = this.app;
    if (app.settings.reduceMotion) return;
    app.scene.classList.add('shake');
    setTimeout(() => app.scene.classList.remove('shake'), ms);
  }
  guide(g: { verb: VerbId; target: Id } | null) {
    const app = this.app;
    app.guideState = g;
    this.sparkEl?.remove();
    this.sparkEl = null;
    app.renderVerbs();
    app.renderInv();
    const spark = app.game.skin.icons.spark;
    if (!g || !spark || app.items.includes(g.target)) return;
    const b = app.view.box(g.target);
    if (!b) return;
    const s = el('img', 'spark') as HTMLImageElement;
    s.src = app.bank.img(spark);
    s.alt = '';
    const [sx, sy] = app.view.camera.toScreen([b[0] + b[2] / 2, b[1] + b[3] / 2]);
    s.style.width = `${22 * app.u}px`;
    s.style.left = `${sx}px`;
    s.style.top = `${sy}px`;
    app.scene.append(s);
    this.sparkEl = s;
  }
  cutscene(on: boolean) {
    const app = this.app;
    app.inCutscene = on;
    app.scene.classList.toggle('cine', on);
    app.scene.querySelector('.skip')?.remove();
    if (on) {
      const b = el('button', 'skip', esc(app.game.ui.skip));
      b.onclick = (e) => {
        e.stopPropagation();
        void this.intent({ kind: 'skip' });
      };
      queueMicrotask(() => b.focus({ preventScroll: true }));
      app.scene.append(b);
    }
  }

  // ---------------------------------------------------------------- choices, calls, the map

  choose(options: { text: string; seen?: boolean; global?: boolean; img?: Id }[], who?: Id): Promise<number> {
    return chooseImpl(this.app, options, who);
  }
  phone(whoIn: Id | Id[], ringing: boolean) {
    return phoneImpl(this.app, whoIn, ringing);
  }
  openMap(state: GameState): Promise<Id | null> {
    return openMapImpl(this.app, state);
  }

  // ---------------------------------------------------------------- minigames and the ending

  async minigame(id: Id, params: Record<string, unknown>): Promise<MinigameResult | MinigameOutcome | undefined> {
    const app = this.app;
    const game = app.mg[id];
    // The validator refuses a minigame the game does not register; a run that gets here is a bug, said as one.
    if (!game) throw new Error(`unknown minigame: ${id}`);
    const host = el('div', 'overlay');
    host.style.background = '#000';
    app.scene.append(host);
    app.side.classList.add('off');
    const voice = app.engine.character(app.game.hintVoice ?? app.game.hero);
    let frame: HTMLElement | null = null;
    const ac = new AbortController();
    const entry: (typeof app.minigameLog)[number] = { id, skipped: false, ms: 0 };
    const t0 = performance.now();
    // Where the focus was: it comes back there (or to the scene) when the minigame closes (4.1.16).
    const before = (globalThis as { document?: Document }).document?.activeElement as HTMLElement | null | undefined;
    host.addEventListener('mg-skip', () => {
      entry.skipped = true;
    });
    // A minigame that says how it ended (4.1.16: the code wheel's record): the engine records it in the session.
    let result: MinigameResult | undefined;
    // 4.1.17: and the transcript that proves it, when the minigame gives one (checked when the run is replayed).
    let transcript: MinigameTranscript | undefined;
    host.addEventListener('mg-record', (e) => {
      const d = (e as CustomEvent<{ result?: unknown; transcript?: MinigameTranscript }>).detail;
      if (typeof d?.result === 'string' && MINIGAME_RESULTS.has(d.result)) {
        result = d.result as MinigameResult;
        transcript = d.transcript && typeof d.transcript === 'object' ? d.transcript : undefined;
      }
    });
    try {
      await game.run({
        root: host,
        u: app.u,
        img: (i) => app.bank.img(i),
        size: (i) => app.bank.size(i),
        sfx: (i) => app.audio.sfx(i),
        instruct: (text) => {
          if (!frame) {
            frame = el('div', 'narr');
            frame.style.color = voice?.color ?? '#fff';
            frame.style.zIndex = '60';
            host.append(frame);
          }
          frame.innerHTML = `<span class="who">${esc((voice?.name ?? '').toUpperCase())}</span>${esc(text)}`;
        },
        params,
        // The run's `minigame:<id>` stream (4.1.15): the same layout for the same seed and the same play-through.
        random: (() => {
          const rng = derive(`${app.engine.sessions.seed ?? 'unseeded'}|${app.minigameLog.length}`, `minigame:${id}`);
          return () => rng.next();
        })(),
        signal: ac.signal,
        fonts: { ui: app.game.skin.fonts?.ui ?? FONT_UI, pixel: app.game.skin.fonts?.pixel ?? FONT_PIXEL },
        labels: { skip: app.game.ui.skip, jump: app.t('jump'), duck: app.t('duck') },
      });
    } finally {
      entry.ms = Math.round(performance.now() - t0);
      if (result) entry.result = result;
      app.minigameLog.push(entry);
      ac.abort();
      host.remove();
      app.side.classList.remove('off');
      // Back where it was, or on the scene (focusable for that, out of the Tab order) when it was nowhere in particular.
      const doc = (globalThis as { document?: Document }).document;
      const back = before && before !== doc?.body && before.isConnected ? before : app.scene;
      if (back === app.scene && !app.scene.hasAttribute?.('tabindex')) app.scene.setAttribute?.('tabindex', '-1');
      back?.focus?.({ preventScroll: true });
    }
    // Every minigame ends somehow: what it said (with its transcript), else skipped or finished (won).
    if (result && transcript) return { result, transcript };
    return result ?? (entry.skipped ? 'skipped' : 'won');
  }
  async ending(phase: 'open' | 'card') {
    if (phase === 'open') await this.app.sealed.open();
    else await this.app.sealed.card();
  }
  end() {
    /* the sealed ending handles the end screen */
  }
}
