// Menus: the title screen, pause, save slots, restart, credits and the ending's background.
// Part of the player (4.1.0 "Clarity"): App's methods of the same name forward here.
import { must } from '../core/must';
import type { SlotMeta } from '../core/ports';
import type { Id } from '../core/types';
import { trapFocus } from './a11y';
import { offlineText } from './offline';
import { parseSave, saveEnvelope } from '../core/save';
import { el, esc } from './app-shared';
import type { App } from './app';

/** Silent looping video, framed as "cover"; the backdrop serves as a poster until it plays. */
export function videoBg(app: App, file: string, poster?: Id): HTMLVideoElement {
  const v = el('video') as HTMLVideoElement;
  v.muted = true;
  v.loop = true;
  v.autoplay = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  if (poster) v.poster = app.bank.img(poster);
  v.src = app.bank.video(file);
  Object.assign(v.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
  });
  v.play().catch(() => {
    /* autoplay blocked: the poster stays */
  });
  return v;
}

export function credits(app: App) {
  const box = el('div', 'credits');
  const C = app.game.creditsScreen ?? { video: app.game.titleScreen?.video, decor: app.game.titleScreen?.decor };
  if (C.video) {
    const v = app.videoBg(C.video, C.decor);
    v.style.filter = 'brightness(.35)';
    box.append(v);
  }
  const inner = el('div', '', (app.game.credits ?? []).map((l) => esc(l) || '&nbsp;').join('<br>'));
  box.append(inner);
  box.onclick = () => box.remove();
  app.scene.append(box);
  const h = app.scene.clientHeight;
  inner.animate([{ transform: `translateY(0)` }, { transform: `translateY(-${h + inner.scrollHeight + 40}px)` }], {
    duration: 22000,
    easing: 'linear',
    fill: 'forwards',
  }).onfinish = () => box.remove();
}

// ================================================================== out-of-game screens
export function pauseMenu(app: App) {
  if (app.scene.querySelector('.dim')) return;
  const ui = app.game.ui;
  const previousFocus = document.activeElement as HTMLElement | null;
  const d = el('div', 'dim');
  const m = el('div', 'menu', `<h3>${esc(ui.pause.toUpperCase())}</h3>`);
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-label', ui.pause);
  // What closing the menu undoes (4.1.4): the focus trap, the listeners the rows below add, then the focus given back.
  const cleanups: (() => void)[] = [];
  const close = () => {
    for (const c of cleanups.splice(0)) c();
    d.remove();
    previousFocus?.focus();
  };
  cleanups.push(trapFocus(m, { onEscape: close, restore: false }));
  // A speedrun's clock hears the pause (4.1.14): an interval its category's rules read.
  const run = app.speedrun;
  if (run) {
    run.paused(true);
    cleanups.push(() => run.paused(false));
  }
  const row = (t: string, v: string, cls = '') => {
    const b = el('button', cls, `<span>${esc(t)}</span><span>${esc(v)}</span>`);
    m.append(b);
    return b;
  };
  row(ui.resume, '▶').onclick = () => close();
  if (app.game.speedrun) speedrunRows(app, m, row, close);
  const mu = row(ui.music, app.audio.musicOn ? ui.on : ui.off);
  mu.onclick = () => {
    app.audio.setMusic(!app.audio.musicOn);
    mu.lastElementChild!.textContent = app.audio.musicOn ? ui.on : ui.off;
  };
  const sf = row(ui.sfx, app.audio.sfxOn ? ui.on : ui.off);
  sf.onclick = () => {
    app.audio.setSfx(!app.audio.sfxOn);
    sf.lastElementChild!.textContent = app.audio.sfxOn ? ui.on : ui.off;
  };
  row(ui.autosave, app.saveError ? '⚠' : '✓');
  if (app.game.offline !== 'nearby') {
    // What is really in the cache: a tap retries a partial warm-up (files already cached are not fetched again).
    const labels = { complete: app.t('offlineComplete'), retry: app.t('offlineRetry') };
    const off = row(app.t('offlineStatus'), offlineText(app.offlineStatus, labels));
    off.setAttribute('aria-live', 'polite');
    const stop = app.onOffline((s) => {
      off.lastElementChild!.textContent = offlineText(s, labels);
    });
    cleanups.push(stop);
    off.onclick = () => {
      if (app.offlineStatus.state === 'partial' || app.offlineStatus.state === 'skipped') void app.warmAll(true);
    };
  }
  const slots = app.game.saves?.slots ?? 0;
  if (slots > 0 && app.engine.state) {
    row(app.t('save'), '💾').onclick = () => void app.slotMenu(d, m, 'save', slots);
    row(app.t('load'), '📂').onclick = () => void app.slotMenu(d, m, 'load', slots);
  }
  const link = app.reality;
  if (link) row(link.statusText(), '⇄').onclick = () => link.menu(m, () => close());
  if (app.game.settings) row(app.t('settings'), '⚙').onclick = () => app.settingsMenu(d, m);
  if (Object.keys(app.game.objectives ?? {}).length)
    row(app.t('objectives'), '☰').onclick = () => app.objectivesMenu(d, m);
  // The world (4.1.15): its code to copy, or hidden until the end in a masked mode.
  if (app.game.remix && app.game.variant)
    void import('./remix-menu').then(({ copyWorld, worldRowText }) => {
      const text = worldRowText(app, !!app.engine.state?.done);
      if (text) row(app.t('remixWorld'), text).onclick = () => void copyWorld(app);
    });
  // The game's fingerprint (4.1.12, ADR 0013): logic, trusted extensions, presentation, engine, eight digits each.
  const fp = row(app.t('fingerprint'), '…', 'fingerprint');
  fp.setAttribute('aria-live', 'polite');
  void Promise.all([app.fingerprint(), import('../core/fingerprint')]).then(
    ([f, { shortFingerprint }]) => {
      fp.lastElementChild!.textContent = shortFingerprint(f);
      fp.title = `logic ${f.logic}\ntrusted extensions ${f.trustedExtensions || '(unknown)'}\npresentation ${f.presentation}\nengine ${f.engine}`;
    },
    () => {
      fp.lastElementChild!.textContent = '?';
    },
  );
  row(ui.credits, '★').onclick = () => {
    close();
    app.credits();
  };
  row(ui.restart, '!', 'warn').onclick = () => {
    m.innerHTML = `<h3>!</h3><p>${esc(ui.confirmErase)}</p>`;
    const y = el('button', 'warn', `<span>${esc(ui.yes)}</span><span>!</span>`),
      n = el('button', '', `<span>${esc(ui.no)}</span><span>▶</span>`);
    n.onclick = () => close();
    y.onclick = () => {
      close();
      void app.restart();
    };
    m.append(y, n);
  };
  d.append(m);
  app.scene.append(d);
}

/** The speedrun rows (4.1.14): start a category, or export / abandon the attempt in progress. */
function speedrunRows(
  app: App,
  m: HTMLElement,
  row: (t: string, v: string, cls?: string) => HTMLElement,
  close: () => void,
) {
  const run = app.speedrun;
  if (!run) {
    row(app.t('speedrun'), '⏱').onclick = () => {
      m.innerHTML = `<h3>${esc(app.t('speedrun').toUpperCase())}</h3>`;
      for (const c of app.game.speedrun!.categories)
        row(c.name, '▶', 'speedrun-category').onclick = () => {
          close();
          void import('./speedrun-ui').then(async ({ SpeedrunSession }) => {
            app.speedrun?.destroy();
            app.speedrun = await SpeedrunSession.start(app, c.id).catch((e) => {
              app.presenter.toast(String((e as Error).message));
              return null;
            });
          });
        };
    };
    return;
  }
  if (run.envelope) row(app.t('exportRun'), '⤓').onclick = () => void run.exportRun();
  else
    row(app.t('abandonRun'), '✕', 'warn').onclick = () => {
      close();
      void run.abandon().then(() => {
        if (app.speedrun === run) app.speedrun = null;
      });
    };
}

/** The save / load menu: one row per slot, export and import as a JSON file. */
export async function slotMenu(app: App, d: HTMLElement, m: HTMLElement, mode: 'save' | 'load', count: number) {
  const ui = app.game.ui;
  m.innerHTML = `<h3>${esc((mode === 'save' ? app.t('save') : app.t('load')).toUpperCase())}</h3>`;
  const row = (t: string, v: string, cls = '') => {
    const b = el('button', cls, `<span>${esc(t)}</span><span>${esc(v)}</span>`);
    m.append(b);
    return b;
  };
  const meta = (): SlotMeta => ({
    at: Date.now(),
    room: app.engine.state.room,
    roomName: app.engine.room().name,
    v: app.engine.state.v,
    ...(app.revision ? { revision: app.revision.here() } : {}),
  });
  const slotName = (n: number) => app.t('slot').replace('{n}', String(n));
  const label = (s: SlotMeta | null) =>
    s
      ? `${s.roomName} · ${new Date(s.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`
      : app.t('emptySlot');
  // The rows exist at once (the menu never jumps), disabled until the store has listed the slots.
  const rows = Array.from({ length: count }, (_, i) => {
    const b = row(slotName(i + 1), '…', 'off');
    b.disabled = true;
    return b;
  });
  const metas = await app.slots.listSlots(count);
  if (!d.isConnected) return;
  metas.forEach((s, i) => {
    const n = i + 1,
      b = must(rows[i], `slot row ${n}`); // one row per slot listed
    b.lastElementChild!.textContent = label(s);
    b.disabled = mode === 'load' && !s;
    b.classList.toggle('off', mode === 'load' && !s);
    if (mode === 'save')
      b.onclick = () => {
        const write = async () => {
          if (!(await app.slots.putSlot(n, app.withMusic(structuredClone(app.engine.state)), meta()))) return;
          d.remove();
          app.presenter.toast(`${slotName(n)} ✓`);
        };
        if (!s) return void write();
        m.innerHTML = `<h3>?</h3><p>${esc(app.t('confirmOverwrite'))}</p>`;
        const y = el('button', 'warn', `<span>${esc(ui.yes)}</span><span>!</span>`),
          no = el('button', '', `<span>${esc(ui.no)}</span><span>▶</span>`);
        y.onclick = () => void write();
        no.onclick = () => d.remove();
        m.append(y, no);
      };
    else if (s)
      b.onclick = async () => {
        const state = await app.slots.getSlot(n);
        if (!state) {
          app.presenter.toast(app.t('saveFailed'));
          return;
        }
        // Made in other content (ADR 0026, dom/revision.ts): asked first; false when the answer was not Resume.
        if (app.revision && !(await app.revision.beforeSlot(app, s.revision, d, m))) return;
        d.remove();
        void app.engine.load(state).catch((e) => app.presenter.toast(String((e as Error).message)));
      };
  });
  if (mode === 'save')
    row(app.t('exportSave'), '⤓').onclick = () => {
      const blob = new Blob([JSON.stringify(saveEnvelope(app.game, app.withMusic(app.engine.state)), null, 1)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${app.game.id}-save.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      d.remove();
    };
  if (mode === 'save')
    row(app.t('shareSession'), '⇪').onclick = () => {
      // A playtest: the inputs since the game started, ids only, for games/<id>/playtests/ (npm run playtests).
      void import('../tools/replay').then(async ({ sessionFile, deviceFamily }) => {
        const json = JSON.stringify(
          sessionFile(app.game.id, app.engine, {
            playtest: true,
            device: deviceFamily(navigator.userAgent, navigator.maxTouchPoints),
            misses: app.misses,
          }),
        );
        const name = `${app.game.id}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.session.json`;
        const file = new File([json], name, { type: 'application/json' });
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
        if (nav.canShare?.({ files: [file] })) {
          try {
            await nav.share({ files: [file], title: app.game.title });
            return;
          } catch {
            /* cancelled: fall back to the download */
          }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
      d.remove();
    };
  if (mode === 'save')
    row(app.t('exportSession'), '⤓').onclick = () => {
      // The inputs since the game started or a save was loaded, with the journal: `npm run replay` plays it back.
      void import('../tools/replay').then(({ sessionFile }) => {
        const blob = new Blob([JSON.stringify(sessionFile(app.game.id, app.engine), null, 1)], {
          type: 'application/json',
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${app.game.id}-session.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
      d.remove();
    };
  else
    row(app.t('importSave'), '⤒').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return;
        try {
          const st = parseSave(app.game, JSON.parse(await f.text()), {
            warn: (message) => app.reportSaveWarning(message),
          });
          d.remove();
          // The imported game also lands in the first free slot, so it survives the next autosave.
          const free = metas.findIndex((x) => !x);
          if (free >= 0) {
            const roomName = app.game.rooms.find((r) => r.id === st.room)?.name ?? st.room;
            // The write failed (reported): the current game is kept, the file is not loaded over it.
            if (
              !(await app.slots.putSlot(free + 1, structuredClone(st), {
                at: Date.now(),
                room: st.room,
                roomName,
                v: st.v,
              }))
            )
              return;
            app.presenter.toast(`${slotName(free + 1)} ✓`);
          }
          await app.engine.load(st);
        } catch (e) {
          app.presenter.toast(String((e as Error).message));
        }
      };
      inp.click();
    };
  row(ui.resume, '▶').onclick = () => d.remove();
}

/** "Restart from the beginning": the autosave must go first; when the browser refuses, the player keeps the game. */
export async function restart(app: App) {
  if (!(await app.engine.store.clear())) {
    app.presenter.toast(app.t('saveFailed'));
    return;
  }
  await app.engine.newGame();
}

/** Title screen, then launches the game. */
export async function showTitle(app: App) {
  const T = app.game.titleScreen;
  app.side.style.display = 'none';
  app.layoutTitle(true);
  const ov = el('div', 'overlay');
  app.scene.append(ov);
  await app.bank.preload([T?.decor, T?.logo].filter(Boolean) as Id[]);
  if (T?.decor)
    ov.innerHTML = `<img src="${app.bank.img(T.decor)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`;
  if (T?.video) ov.append(app.videoBg(T.video, T.decor));
  if (T?.logo) {
    const lg = el('img') as HTMLImageElement;
    lg.src = app.bank.img(T.logo);
    lg.alt = app.game.title;
    Object.assign(lg.style, {
      position: 'absolute',
      left: `${(370 - 215) * app.u}px`,
      top: `${8 * app.u}px`,
      width: `${430 * app.u}px`,
      animation: 'drop .9s ease-out both',
    });
    ov.append(lg);
  }
  const row = el('div');
  Object.assign(row.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    top: '73%',
    display: 'flex',
    justifyContent: 'center',
    gap: '4%',
    fontSize: `${Math.max(9, Math.round(app.sw * 0.018))}px`,
  });
  const nb = el('button', 'bigbtn', '▶ ' + esc(app.game.ui.newGame.toUpperCase()));
  nb.style.color = '#ffd640';
  const cb = el('button', 'bigbtn', esc(app.game.ui.continue.toUpperCase()));
  cb.style.color = '#9fe0ff';
  const has = app.engine.hasSave();
  (cb as HTMLButtonElement).disabled = !has;
  row.append(nb, cb);
  // Remix (4.1.15): another world of the same game, after New game and Continue (whose places the e2e rely on).
  const remixable = !!app.game.remix?.modes.some((x) => x.id !== 'story');
  const rb = remixable ? el('button', 'bigbtn', esc(app.t('remix').toUpperCase())) : undefined;
  if (rb) {
    rb.style.color = '#c9a3ff';
    row.append(rb);
  }
  ov.append(row);
  queueMicrotask(() => nb.focus({ preventScroll: true }));
  if (T?.footer) {
    const f = el('div', '', esc(T.footer));
    Object.assign(f.style, {
      position: 'absolute',
      bottom: '2.5%',
      left: '0',
      right: '0',
      textAlign: 'center',
      font: `${Math.max(7, Math.round(app.sw * 0.011))}px var(--font-pixel)`,
      color: '#c8bedc',
      textShadow: '2px 2px 0 #14081e',
    });
    ov.append(f);
  }
  let musicStarted = false;
  const startMusic = () => {
    if (!musicStarted && T?.music) {
      musicStarted = true;
      app.audio.play(T.music);
    }
  };
  ov.addEventListener('pointerdown', startMusic);
  const launch = async (fresh: boolean) => {
    ov.remove();
    app.side.style.display = '';
    app.layoutTitle(false);
    if (fresh) {
      if (!(await app.engine.store.clear())) {
        app.presenter.toast(app.t('saveFailed'));
        if (app.engine.hasSave()) {
          await app.engine.continueGame();
          return;
        }
      }
      await app.engine.newGame();
    } else await app.engine.continueGame();
  };
  /** "Erase the saved game?" before anything replaces it (a New game, another world). */
  const confirmErase = (onYes: () => void) => {
    if (!has) {
      onYes();
      return;
    }
    const d = el('div', 'dim');
    const m = el('div', 'menu', `<h3>!</h3><p>${esc(app.game.ui.confirmErase)}</p>`);
    const y = el('button', 'warn', `<span>${esc(app.game.ui.yes)}</span><span>!</span>`),
      n = el('button', '', `<span>${esc(app.game.ui.no)}</span><span>▶</span>`);
    y.onclick = () => {
      d.remove();
      onYes();
    };
    n.onclick = () => d.remove();
    m.append(y, n);
    d.append(m);
    ov.append(d);
  };
  nb.onclick = () => {
    startMusic();
    confirmErase(() => void launch(true));
  };
  cb.onclick = async () => {
    startMusic();
    // Made in other content (ADR 0026): asked first. Restart replaces the save, so it is confirmed as New game is.
    // Made in other content (ADR 0026): asked above the title screen; Restart replaces the save, so it is confirmed.
    const choice = await app.revision?.resume(app.revision.autosave(), ov);
    if (choice === 'restart') return confirmErase(() => void launch(true));
    if (choice && choice !== 'resume') return;
    void launch(false);
  };
  if (rb)
    rb.onclick = async () => {
      startMusic();
      const { chooseWorld, dailyFetcher, keepWorld, mysteryFetcher } = await import('./remix-menu');
      const v = await chooseWorld(app, ov, dailyFetcher(app.game), mysteryFetcher(app.game));
      if (!v) return;
      // The world is built when the page starts: keep it, start again, and begin a new game in it at once; a saved game
      // is replaced only once the player says so.
      confirmErase(() => {
        keepWorld(app.game.id, v, true);
        globalThis.location?.reload();
      });
    };
  // The page was started again for a world just chosen: its new game begins at once. A link to another world than the
  // saved game's asks first (dom/remix-boot.ts); a link that named no world is said.
  if (remixable)
    void Promise.all([import('./remix-menu'), import('./remix-boot')]).then(async ([menu, boot]) => {
      if (menu.takePendingStart(app.game.id)) {
        void launch(true);
        return;
      }
      const { conflict, notice } = boot.takePending();
      if (notice) app.presenter.toast(notice);
      if (!conflict) return;
      const savedName =
        app.game.variant && app.game.variant.mode !== 'story' ? app.game.variant.seed : app.t('remixStory');
      const replace = await boot.askWorldConflict(
        ov,
        savedName,
        conflict.mode === 'story' ? app.t('remixStory') : conflict.seed,
        {
          title: app.t('remixConflict'),
          keep: app.t('remixKeepSaved'),
          replace: app.t('remixStartLinked'),
        },
      );
      if (!replace) return;
      menu.keepWorld(app.game.id, conflict, true);
      globalThis.location?.reload();
    });
  void app.warmAround(app.engine.store.load()?.room ?? app.game.start.room, true).then(() => app.warmAll());
}

/** The title screen takes up the full width (no side column). */
export function layoutTitle(app: App, full: boolean) {
  if (!full) {
    app.layout();
    return;
  }
  const r = app.root.getBoundingClientRect();
  let sw = r.width,
    sh = Math.min(r.height, sw / 1.6);
  sw = Math.round(sh * 1.6);
  Object.assign(app.g.style, { width: `${sw}px`, height: `${r.height}px` });
  Object.assign(app.scol.style, { width: `${sw}px`, height: `${r.height}px` });
  Object.assign(app.scene.style, { width: `${sw}px`, height: `${Math.round(sh)}px` });
  app.u = sw / 640;
  app.sw = sw;
}
