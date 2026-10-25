// Input: verbs, the inventory bar, taps and double taps on the scene, the keyboard, the action line and its label.
// Part of the player (4.1.0 "Clarity"): App's methods of the same name forward here.
import { must } from '../core/must';
import type { Id, Point, VerbId } from '../core/types';
import { defaultVerb } from '../core/default-verb';
import { isTyping } from './a11y';
import { DOUBLE_TAP_MS, el, esc, NEAR_MISS } from './app-shared';
import type { App } from './app';
import { fitSideColumn } from './shell';

/** Escape closes the topmost thing (a menu, the map, the transcript, a cutscene's skip) or opens the pause menu;
 * Space and Enter advance a line of dialogue (a focused button already acts on Enter and Space on its own); a verb's
 * `key` picks it (#203). */
export function onKey(app: App, e: KeyboardEvent) {
  if (isTyping(e) || !app.engine.state) return;
  const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON';
  if (e.key === 'Escape') {
    const dim = app.scene.querySelector<HTMLElement>('.dim');
    if (dim) {
      dim.remove();
      return;
    }
    const mapBack = app.side.querySelector<HTMLButtonElement>(
      '.mapview ~ * .choice.gl, .choices .choice.gl:last-child',
    );
    if (app.scene.querySelector('.overlay.mapview') && mapBack) {
      mapBack.click();
      return;
    }
    const mgSkip = app.scene.querySelector<HTMLButtonElement>('.overlay .mg-skip');
    if (mgSkip) {
      mgSkip.click();
      return;
    }
    if (app.transcript) {
      app.closeTranscript();
      return;
    }
    const skip = app.scene.querySelector<HTMLButtonElement>('.skip');
    if (skip) {
      skip.click();
      return;
    }
    if (app.choosing) {
      const last = app.side.querySelector<HTMLButtonElement>('.choices .choice.gl:last-child');
      if (last) {
        last.click();
        return;
      }
    }
    if (!app.scene.querySelector('.overlay')) app.pauseMenu();
    return;
  }
  if (
    (e.key === ' ' || e.key === 'Enter') &&
    app.speechEl &&
    !onButton &&
    !app.scene.querySelector('.overlay:not(.mapview) .mg-skip')
  ) {
    e.preventDefault();
    app.endSpeech();
    app.eatClick = performance.now();
    return;
  }
  const v = verbForKey(app, e);
  if (v) {
    e.preventDefault();
    app.pickVerb(v);
  }
}

/**
 * The verb a key picks (#203): the verb whose `key` it is, any case, without Ctrl, Alt or Meta, and only when the
 * verb bar is what the player plays with (shown, nothing over the scene, no line on screen, the engine idle), and while
 * the player has not turned the keys off in the settings (4.3.0).
 */
function verbForKey(app: App, e: KeyboardEvent): VerbId | null {
  if (!app.settings.verbKeys || e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.key.length !== 1) return null;
  const k = e.key.toLocaleLowerCase();
  const v = app.game.verbs.find((x) => x.key?.toLocaleLowerCase() === k);
  if (!v || app.engine.busy || app.verbsEl.hidden || app.speechEl || app.choosing || app.transcript) return null;
  // The credits (from the pause menu) roll over the scene too, without being an overlay (4.3.0).
  if (app.scene.querySelector('.overlay, .dim, .credits')) return null;
  // A dialog outside the scene (a remix or revision prompt) holds the focus: the letter is for it.
  if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"], [aria-modal="true"]')) return null;
  return v.id;
}

export function toScene(app: App, e: PointerEvent): Point {
  const r = app.scene.getBoundingClientRect();
  return app.view.camera.toLogical((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
}

// ================================================================== interaction
export function pickVerb(app: App, v: VerbId) {
  if (app.engine.busy) return;
  app.verb = app.verb === v ? null : v;
  app.a = null;
  app.implicit = false;
  app.renderVerbs();
  app.renderInv();
  app.sentence();
}

export function resetVerb(app: App) {
  app.verb = null;
  app.a = null;
  app.implicit = false;
  app.renderVerbs();
  app.renderInv();
  app.sentence();
}

export async function onItem(app: App, id: Id) {
  if (app.engine.busy) return;
  const v = app.verb;
  // Item that has already been used: can still be looked at, not used or given (unless a rule targets it).
  if ((!v || v === 'use' || v === 'give') && app.engine.usedLocked(id)) return;
  if ((v === 'use' || v === 'give') && !app.a) {
    app.a = id;
    app.renderInv();
    app.sentence();
    return;
  }
  if ((v === 'use' || v === 'give') && app.a && app.a !== id) {
    const a = app.a;
    app.resetVerb();
    await app.presenter.intent({ kind: 'act', verb: v, target: id, item: a });
    return;
  }
  if (!v) {
    app.verb = 'use';
    app.a = id;
    app.implicit = true;
    app.renderVerbs();
    app.renderInv();
    app.sentence();
    return;
  }
  app.resetVerb();
  await app.presenter.intent({ kind: 'act', verb: v, target: id });
}

/** The verb a tap on this target means now: the chosen one, or (an item picked without a verb) give or use (4.0). */
export function verbFor(app: App, target: Id): VerbId | null {
  const room = app.view.room;
  if (app.implicit && app.a && room) return defaultVerb(app.game, room, target, app.a) ?? app.verb;
  return app.verb;
}

/**
 * The verb a single tap with no verb picked goes through this exit with (#188), or null when the tap only walks: an
 * exit (declared, or its generated hotspot) whose `onTap` is `go`, or any exit but a `walk` one when the game sets
 * `input.exitOnTap`. A hotspot that says `onTap: 'go'` acts the same way (4.4.0); `exitOnTap` is about exits only.
 * The verb is the double tap's (`defaultVerb`).
 */
function tapVerb(app: App, id: Id): VerbId | null {
  const room = app.view.room;
  if (!room) return null;
  const spot = room.hotspots?.[id];
  if (spot && !spot.exit && !room.exits?.[id]) return spot.onTap === 'go' ? defaultVerb(app.game, room, id) : null;
  if (!room.exits?.[id] && !spot?.exit) return null;
  const onTap = room.exits?.[id]?.onTap ?? (app.game.input?.exitOnTap ? 'go' : 'walk');
  return onTap === 'go' ? defaultVerb(app.game, room, id) : null;
}

export async function actOnTarget(app: App, id: Id) {
  const now = performance.now();
  const tap = ++app.taps;
  const double = !!app.lastTap && app.lastTap.id === id && now - app.lastTap.t < DOUBLE_TAP_MS;
  app.lastTap = double ? null : { id, t: now };
  const v = app.verbFor(id);
  if (!v) {
    // A double tap acts with the verb the player means (4.0): through the door, talk to someone, look at the rest.
    const room = app.view.room;
    const dv = double && room ? defaultVerb(app.game, room, id) : null;
    if (dv) {
      app.resetVerb();
      await app.presenter.intent({ kind: 'act', verb: dv, target: id });
      return;
    }
    const ap = app.engine.approach(id);
    const go = tapVerb(app, id);
    // The game the tap was made in: a load (or a new game, a checkpoint) replaces the state, a room change moves it.
    const state = app.engine.state;
    const at = state.room;
    app.sentence(id);
    if (ap) await app.presenter.intent({ kind: 'walk', to: ap });
    // An exit that goes on a single tap (#188): through it on arrival, as a double tap would. The walk stays a walk, so
    // a tap elsewhere meanwhile redirects the hero and cancels this; so do a verb or an item picked, a save loaded or
    // another room.
    if (go && tap === app.taps && !app.verb && !app.a && app.engine.state === state && state.room === at) {
      app.resetVerb();
      await app.presenter.intent({ kind: 'act', verb: go, target: id });
    }
    return;
  }
  if ((v === 'use' || v === 'give') && app.a) {
    const a = app.a;
    app.resetVerb();
    await app.presenter.intent({ kind: 'act', verb: v, target: id, item: a });
    return;
  }
  if (v === 'give') {
    void app.presenter.say(app.game.hero, app.game.ui.giveWhat, {});
    return;
  }
  app.resetVerb();
  await app.presenter.intent({ kind: 'act', verb: v, target: id });
}

/**
 * A tap on nothing, close to something (3.8): a hotspot players aim at and miss. Counted by room and target, ids
 * only, for the playtest a tester shares (`misses` in the session file, `npm run playtests`).
 */
export function nearMiss(app: App, p: Point) {
  const room = app.view.room;
  if (!room || !app.engine.state) return;
  let best: { id: Id; d: number } | null = null;
  for (const id of app.engine.targets(room)) {
    const b = app.view.box(id);
    if (!b) continue;
    const dx = Math.max(b[0] - p[0], 0, p[0] - (b[0] + b[2])),
      dy = Math.max(b[1] - p[1], 0, p[1] - (b[1] + b[3]));
    const d = Math.hypot(dx, dy);
    if (d <= NEAR_MISS && (!best || d < best.d)) best = { id, d };
  }
  if (best) {
    const k = `${room.id}/${best.id}`;
    app.misses[k] = (app.misses[k] ?? 0) + 1;
  }
}

export async function onScenePointer(app: App, e: PointerEvent) {
  if (!app.view.room || app.engine.busy || app.speechEl || app.inCutscene) return;
  if ((e.target as HTMLElement).closest('.dim, .overlay, .skip, button')) return;
  const p = app.toScene(e);
  const id = app.view.hit(p);
  if (!id) {
    app.taps++;
    app.nearMiss(p);
    await app.presenter.intent({ kind: 'walk', to: app.view.walker.clamp(p) });
    return;
  }
  if (e.pointerType !== 'mouse') {
    app.showLabel(id);
    setTimeout(() => app.showLabel(null), 900);
  }
  await app.actOnTarget(id);
}

export function onHover(app: App, e: PointerEvent) {
  if (e.pointerType !== 'mouse' || !app.view.room || app.engine.busy || app.speechEl) return;
  const id = app.view.hit(app.toScene(e));
  app.showLabel(id);
  app.sentence(id ?? undefined);
  app.scene.style.cursor = id ? 'pointer' : 'crosshair';
}

export function sentence(app: App, target?: Id) {
  const V = app.game.verbs.find((x) => x.id === (target ? app.verbFor(target) : app.verb));
  const n = (id: Id) => `<b>${esc(app.engine.nameOf(id))}</b>`;
  let s: string;
  if (!V) s = esc(app.game.ui.walkTo) + (target ? ' ' + n(target) : '');
  else if (app.a && V.join) s = `${esc(V.label)} ${n(app.a)} ${esc(V.join)}${target ? ' ' + n(target) : ' …'}`;
  else s = esc(V.label) + (target ? ' ' + n(target) : '');
  app.sbar.innerHTML = s;
}

export function showLabel(app: App, id: Id | null) {
  app.labelEl?.remove();
  app.labelEl = null;
  if (!id) return;
  const b = app.view.box(id);
  if (!b) return;
  const l = el('div', 'label', esc(app.engine.nameOf(id)));
  const [lx, ly] = app.view.camera.toScreen([b[0] + b[2] / 2, b[1] - 2]);
  l.style.left = `${lx}px`;
  l.style.top = `${Math.max(14 * app.u, ly)}px`;
  app.scene.append(l);
  app.labelEl = l;
}

export function renderVerbs(app: App) {
  for (const b of app.verbsEl.children as HTMLCollectionOf<HTMLElement>) {
    b.classList.toggle('on', b.dataset.verb === app.verb);
    b.setAttribute('aria-pressed', String(b.dataset.verb === app.verb));
    b.classList.toggle('blink', b.dataset.verb === app.guideState?.verb);
  }
}

export function renderInv(app: App) {
  const n = app.items.length,
    cols = app.invCols,
    per = cols * 2;
  const maxPage = Math.max(0, Math.ceil((n - per) / cols));
  app.invPage = Math.min(app.invPage, maxPage);
  // The slots are made once per shape (4.1.5): a change of inventory patches what each one shows, where 4.1.0 threw
  // the grid away and made six buttons again on every gain, loss or use.
  if (app.invEl.children.length !== per || app.invEl.dataset.cols !== String(cols)) {
    app.invEl.innerHTML = '';
    app.invEl.dataset.cols = String(cols);
    app.invEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (let j = 0; j < per; j++) app.invEl.append(el('button', 'slot'));
  }
  const off = app.invPage * cols;
  for (let j = 0; j < per; j++) {
    const id = app.items[off + j];
    const b = app.invEl.children[j] as HTMLButtonElement;
    // An empty slot is layout, not a control: out of the tab order and of the accessibility tree.
    if (!id) {
      if (b.dataset.id) {
        b.innerHTML = '';
        delete b.dataset.id;
        b.className = 'slot';
        b.removeAttribute('aria-label');
        b.removeAttribute('aria-disabled');
        b.onclick = null;
        b.onpointerenter = null;
      }
      b.tabIndex = -1;
      b.setAttribute('aria-hidden', 'true');
      continue;
    }
    const it = app.game.items[id];
    if (b.dataset.id !== id) {
      b.dataset.id = id;
      b.innerHTML = `<img src="${app.bank.img(it?.icon ?? id)}" alt="">`;
      b.setAttribute('aria-label', app.engine.text(it?.name ?? id));
      b.onclick = () => void app.onItem(id);
      b.onpointerenter = (e) => {
        if (e.pointerType === 'mouse' && !app.engine.busy) app.sentence(id);
      };
    }
    b.tabIndex = 0;
    b.removeAttribute('aria-hidden');
    b.classList.toggle('sel', id === app.a);
    b.classList.toggle('blink', id === app.guideState?.target);
    const used = app.used.includes(id);
    const locked = used && !!app.engine.state && app.engine.usedLocked(id);
    b.classList.toggle('used', used);
    b.classList.toggle('locked', locked);
    if (locked) b.setAttribute('aria-disabled', 'true');
    else b.removeAttribute('aria-disabled');
  }
  app.invNav.hidden = n <= per && !app.desk;
  // The page buttons take or give back a row of the column, and the verbs come back here after a talk or the map.
  fitSideColumn(app);
  // The three buttons appended when the side panel was built.
  const [up, pg, down] = app.invNav.children as HTMLCollectionOf<HTMLButtonElement>;
  must(up, 'page up button').disabled = app.invPage === 0;
  must(down, 'page down button').disabled = off + per >= n;
  must(pg, 'page label').textContent = n > per ? `${Math.min(n, off + per)} / ${n}` : '';
}
