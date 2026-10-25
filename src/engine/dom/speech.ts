// Speech: lines on screen with their voice, the transcript, phone calls, the choice of responses.
// Part of the player (4.1.0 "Clarity"): App's methods of the same name forward here.
import { sayMs } from '../core/timing';
import { must } from '../core/must';
import type { Id } from '../core/types';
import { roving } from './a11y';
import { el, esc } from './app-shared';
import type { App } from './app';

export function say(
  app: App,
  who: Id,
  text: string,
  o: { shout?: boolean; fast?: boolean; voice?: Id },
): Promise<void> {
  app.endSpeech();
  if (o.fast) return Promise.resolve();
  // Through the engine: the variant that applies gives the name, the colour stays the character's.
  const char = app.engine.character(who);
  app.live.textContent = `${char?.name ?? who}: ${text}`;
  const color = char?.color ?? '#fff';
  const inCall = !!app.call?.ids.includes(who);
  const head = char?.offscreen || inCall ? null : app.view.head(who);
  if (inCall) app.call!.talking = who;
  let box: HTMLElement;
  if (!head) {
    box = el('div', 'narr', `<span class="who">${esc((char?.name ?? who).toUpperCase())}</span>${esc(text)}`);
    box.style.color = color;
  } else {
    box = el('div', 'speech' + (o.shout ? ' shout' : ''), esc(text));
    box.style.color = color;
    const maxW = Math.min(0.62 * app.sw, 390 * app.u);
    box.style.maxWidth = `${maxW}px`;
    const half = maxW / 2 / app.u + 6;
    const [hx, hy] = app.view.camera.toScreen(head);
    box.style.left = `${Math.max(half, Math.min(640 - half, hx / app.u)) * app.u}px`;
    box.style.top = `${Math.max(hy / app.u, 70) * app.u}px`;
    app.view.setTalking(who, text.length > 70);
  }
  const next = el('button', 'tapnext', '▼');
  next.setAttribute('aria-label', app.t('advance'));
  next.tabIndex = -1;
  next.onclick = (e) => {
    e.stopPropagation();
    app.endSpeech();
    app.eatClick = performance.now();
  };
  app.scene.append(box, next);
  app.speechEl = box;
  app.transcribe(who, text, color);
  return new Promise((res) => {
    app.speechDone = res;
    const mine = box;
    // With a voice clip, the line lasts as long as the clip (a tap still skips it); otherwise a reading time.
    if (o.voice && app.audio.hasVoice(o.voice))
      void app.audio.voice(o.voice).then(() => {
        if (app.speechEl === mine) app.endSpeech();
      });
    else app.speechTimer = window.setTimeout(() => app.endSpeech(), sayMs(text, app.settings.textSpeed));
  });
}

export function transcribe(app: App, who: Id, text: string, color: string) {
  const t = app.transcript;
  if (!t) return;
  const char = app.engine.character(who);
  const line = el('div', 'line', `<b style="color:${color}">${esc(char?.name ?? who)} :</b>${esc(text)}`);
  t.querySelector('.hint')?.before(line);
  t.scrollTop = t.scrollHeight;
}

export function openTranscript(app: App, who: Id | undefined, question: string) {
  app.closeTranscript();
  const t = el('div', 'transcript');
  if (who) {
    const c = app.engine.character(who);
    t.append(
      el('div', 'who', `${c?.portrait ? `<img src="${app.bank.img(c.portrait)}" alt="">` : ''}${esc(c?.name ?? who)}`),
    );
    t.classList.add('choices');
  }
  void question; // the engine has the hero say the question: it arrives through transcribe()
  t.append(el('div', 'hint', esc(app.game.ui.tapToContinue)));
  t.onclick = () => app.closeTranscript();
  app.side.insertBefore(t, app.toolsEl);
  app.transcript = t;
  app.verbsEl.hidden = true;
  app.invEl.hidden = true;
  app.invNav.hidden = true;
}

export function closeTranscript(app: App) {
  if (!app.transcript) return;
  app.transcript.remove();
  app.transcript = null;
  if (!app.choosing) {
    app.verbsEl.hidden = false;
    app.invEl.hidden = false;
    app.renderInv();
  }
}

export function endSpeech(app: App) {
  clearTimeout(app.speechTimer);
  // End of the conversation (nothing speaking any more, no more choice): the panel gives the verbs back.
  if (app.transcript)
    setTimeout(() => {
      if (app.transcript && !app.choosing && !app.engine.busy && !app.speechEl) app.closeTranscript();
    }, 120);
  app.speechEl?.remove();
  app.speechEl = null;
  app.scene.querySelector('.tapnext')?.remove();
  app.view.setTalking(null);
  if (app.call) app.call.talking = null;
  const d = app.speechDone;
  app.speechDone = null;
  d?.();
}

export function choose(
  app: App,
  options: { text: string; seen?: boolean; global?: boolean; img?: Id }[],
  who?: Id,
): Promise<number> {
  app.closeTranscript();
  app.choosing = true;
  app.verbsEl.hidden = true;
  app.invEl.hidden = true;
  app.invNav.hidden = true;
  app.side.classList.remove('off');
  const box = el('div', 'choices');
  if (who) {
    const c = app.engine.character(who);
    box.append(
      el('div', 'who', `${c?.portrait ? `<img src="${app.bank.img(c.portrait)}" alt="">` : ''}${esc(c?.name ?? who)}`),
    );
  }
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', who ? (app.engine.character(who)?.name ?? who) : app.game.ui.mapTitle);
  roving(box, '.choice');
  app.side.insertBefore(box, app.toolsEl);
  queueMicrotask(() => box.querySelector<HTMLElement>('.choice')?.focus({ preventScroll: true }));
  return new Promise((res) => {
    // The answer is a `pick` intention (4.1.11): a tap on a row, or any input layer that says which.
    app.presenter.picking = (i) => {
      const o = options[i];
      if (!o) return;
      app.presenter.picking = null;
      box.remove();
      app.choosing = false;
      if (who) app.openTranscript(who, o.text);
      else {
        app.verbsEl.hidden = false;
        app.invEl.hidden = false;
        app.renderInv();
      }
      res(i);
    };
    // Options with an image are cards (4.3.0): a grid before the text lines, in their own order; the index picked is
    // still the option's. The card's name is its label (the image is decoration: `alt=""`).
    const cards = options.some((o) => o.img) ? el('div', 'cards') : null;
    if (cards) box.append(cards);
    options.forEach((o, i) => {
      const cls = 'choice' + (o.seen ? ' read' : '') + (o.global ? ' gl' : '');
      const b = o.img
        ? el('button', `${cls} card`, `<img src="${app.bank.img(o.img)}" alt=""><span>${esc(o.text)}</span>`)
        : el('button', cls, '• ' + esc(o.text));
      b.onclick = () => void app.presenter.intent({ kind: 'pick', choice: i });
      (o.img && cards ? cards : box).append(b);
    });
  });
}

export async function phone(app: App, whoIn: Id | Id[], ringing: boolean) {
  const ids = Array.isArray(whoIn) ? whoIn : [whoIn];
  if (!ringing) {
    app.hangUp();
    return;
  }
  app.hangUp();
  const chars = ids.map((id) => app.engine.character(id));
  const color = chars[0]?.color ?? '#fff';
  const card = el('div', 'overlay');
  Object.assign(card.style, {
    inset: 'auto',
    left: '50%',
    top: '6%',
    transform: 'translateX(-50%)',
    background: '#120d1c',
    border: `3px solid ${color}`,
    borderRadius: '12px',
    padding: '.5em .8em',
    display: 'flex',
    alignItems: 'center',
    gap: '.7em',
    color,
    animation: 'drop .5s ease-out both',
  });
  const faces = chars
    .map((c) =>
      c?.portrait
        ? `<img src="${app.bank.img(c.portrait)}" alt="" style="width:3em;height:3em;object-fit:cover;border-radius:50%;border:2px solid ${c.color ?? 'currentColor'}">`
        : '',
    )
    .join('');
  const names = ids
    .map((id, i) => `<span style="color:${chars[i]?.color ?? color}">${esc(chars[i]?.name ?? id)}</span>`)
    .join(' &amp; ');
  card.innerHTML = `${faces}<div>${names} ${esc(app.game.ui.calling)}</div>`;
  const pick = el('button', 'bigbtn', esc(app.game.ui.pickUp));
  Object.assign(pick.style, { color: '#8fe36a', fontSize: '.55em' });
  card.append(pick);
  app.scene.append(card);
  const ring = app.game.skin.sounds?.phone;
  if (ring) app.audio.sfx(ring);
  const shown = app.callFrames(ids);
  void app.bank.preload(shown.flatMap((f) => f.all));
  await new Promise<void>((res) => {
    pick.onclick = (e) => {
      e.stopPropagation();
      res();
    };
  });
  card.remove();
  app.openCall(ids, shown);
}

/** A caller's pose and images: the requested pose, otherwise the first of `skin.callPoses` (default `phone`, `front`, `face`, `idle`). */
export function callFrame(app: App, id: Id, want?: string) {
  const c = app.engine.character(id);
  const sp = c?.sprites ?? {};
  const pose = [want, ...(app.game.skin.callPoses ?? ['phone', 'front', 'face', 'idle'])].find(
    (p) => p && (sp[p]?.length || c?.mouths?.[p]),
  );
  const m = pose ? c?.mouths?.[pose] : undefined;
  const base = m?.closed ?? (pose ? sp[pose]?.[0] : undefined) ?? c?.portrait;
  const talk = !m && pose ? sp[`${pose}_talk`]?.[0] : undefined;
  const all = [base, talk, ...(m ? [...m.open, m.blink, m.smile] : [])].filter(Boolean) as Id[];
  const ref = sp.idle?.[0] ?? base;
  const [, rh] = ref ? app.bank.size(ref) : [0, 0],
    [, bh] = base ? app.bank.size(base) : [0, 0];
  const h = (c?.height ?? app.game.skin.heights?.actor ?? 110) * (rh ? bh / rh : 1);
  return { id, c, m, base, talk, all, h };
}

export function callFrames(app: App, ids: Id[]) {
  return ids.map((id) => app.callFrame(id));
}

/** Shows the phone frame (side by side, the first one in front) during the dialogue. */
export function openCall(app: App, ids: Id[], frames: ReturnType<App['callFrames']>) {
  const shown = frames.filter((f) => f.base);
  if (!shown.length) {
    app.call = { ids, el: el('div'), timer: 0, talking: null, frames: [], imgs: [] };
    return;
  }
  const box = el('div', 'callframe');
  box.style.borderColor = must(shown[0], 'first caller').c?.color ?? '#fff';
  const imgs = shown.map((f, i) => {
    const im = el('img') as HTMLImageElement;
    im.alt = f.c?.name ?? f.id;
    im.src = app.bank.img(f.base!);
    im.dataset.img = f.base!;
    im.style.zIndex = String(shown.length - i);
    box.append(im);
    return im;
  });
  app.scene.append(box);
  let blinkAt = performance.now() + 2500;
  const tick = () => {
    const call = app.call;
    if (!call) return;
    const now = performance.now();
    const blink = now >= blinkAt && now < blinkAt + 150;
    if (now >= blinkAt + 150) blinkAt = now + 3000 + Math.random() * 4000;
    call.frames.forEach((f, i) => {
      const im = must(call.imgs[i], `caller image ${i}`); // one image per frame
      const talking = call.talking === f.id;
      let img = f.base!;
      let bob = false;
      if (f.m) {
        if (talking) {
          const o = f.m.open.filter((x) => x !== im.dataset.img);
          img = o[Math.floor(Math.random() * o.length)] ?? f.m.closed;
        } else if (blink && f.m.blink) img = f.m.blink;
      } else if (talking) {
        if (f.talk) img = im.dataset.img === f.talk ? f.base! : f.talk;
        else bob = im.style.transform === '';
      }
      if (im.dataset.img !== img) {
        im.src = app.bank.img(img);
        im.dataset.img = img;
      }
      im.style.transform = bob ? 'translateY(-3%)' : '';
    });
  };
  app.call = { ids, el: box, timer: window.setInterval(tick, 180), talking: null, frames: shown, imgs };
  app.sizeCall();
}

/** Relative heights of the callers (each at their own size, pose included). */
export function sizeCall(app: App) {
  const call = app.call;
  if (!call?.frames.length) return;
  const hmax = Math.max(...call.frames.map((f) => f.h));
  call.frames.forEach((f, i) => {
    must(call.imgs[i], `caller image ${i}`).style.height = `${(f.h / hmax) * 100}%`;
  });
}

/** `{ pose }` during a call: the phone frame shows the new pose. */
export function callPose(app: App, who: Id, pose: string) {
  const call = app.call;
  const i = call ? call.frames.findIndex((f) => f.id === who) : -1;
  if (!call || i < 0) return;
  const f = app.callFrame(who, pose);
  if (!f.base) return;
  void app.bank.preload(f.all);
  call.frames[i] = f;
  const im = must(call.imgs[i], `caller image ${i}`);
  im.src = app.bank.img(f.base);
  im.dataset.img = f.base;
  app.sizeCall();
}

export function hangUp(app: App) {
  if (!app.call) return;
  clearInterval(app.call.timer);
  app.call.el.remove();
  app.call = null;
}
