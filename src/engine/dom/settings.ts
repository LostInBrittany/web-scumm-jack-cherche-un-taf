// Player preferences: what they are, their defaults, the settings menu and how they apply.
// Part of the player (4.1.0 "Clarity"): App's methods of the same name forward here.
import { must } from '../core/must';
import { FONT_UI, fontStack } from './fonts';
import { el, esc, someCaption } from './app-shared';
import type { App } from './app';

/** Player preferences (see `GameDef.settings`). */
export interface Settings {
  textSpeed: number;
  textSize: number;
  reduceMotion: boolean;
  readableFont: boolean;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  captions: boolean;
  /** The verbs' keyboard shortcuts (4.3.0, #203): on by default, offered in the settings when a verb has a `key`. */
  verbKeys: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  textSpeed: 1,
  textSize: 1,
  reduceMotion: false,
  readableFont: false,
  musicVolume: 1,
  sfxVolume: 1,
  voiceVolume: 1,
  captions: true,
  verbKeys: true,
};

/** Applies the preferences: fonts, text size, volumes, motion. */
export function applySettings(app: App) {
  const S = app.settings;
  const F = app.game.skin?.fonts;
  document.documentElement.style.setProperty(
    '--font-ui',
    fontStack(S.readableFont && F?.readable ? F.readable : (F?.ui ?? FONT_UI)),
  );
  app.scene.style.setProperty('--text-scale', String(S.textSize));
  app.audio.setVolumes(S.musicVolume, S.sfxVolume, S.voiceVolume);
  // The setting, or the system's `prefers-reduced-motion`: no camera glide, no parallax, no particles, no room transition.
  app.view.reduceMotion = S.reduceMotion || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (app.view.room && app.engine.state) app.view.refreshVisibility();
  try {
    localStorage.setItem(`${app.game.id}.settings`, JSON.stringify(S));
  } catch {
    /* no storage */
  }
}

/** The settings menu: each row cycles its value. */
export function settingsMenu(app: App, d: HTMLElement, m: HTMLElement) {
  const ui = app.game.ui;
  const S = app.settings;
  m.innerHTML = `<h3>${esc(app.t('settings').toUpperCase())}</h3>`;
  const row = (t: string, v: () => string, onclick: () => void) => {
    const b = el('button', '', `<span>${esc(t)}</span><span>${esc(v())}</span>`);
    b.onclick = () => {
      onclick();
      app.applySettings();
      b.lastElementChild!.textContent = v();
    };
    m.append(b);
    return b;
  };
  const speeds: [number, string][] = [
    [0.7, app.t('slow')],
    [1, app.t('normal')],
    [1.6, app.t('fast')],
  ];
  row(
    app.t('textSpeed'),
    () => speeds.find(([k]) => k === S.textSpeed)?.[1] ?? String(S.textSpeed),
    () => {
      const i = speeds.findIndex(([k]) => k === S.textSpeed);
      S.textSpeed = must(speeds[(i + 1) % speeds.length], 'text speed')[0];
    },
  );
  row(
    app.t('textSize'),
    () => (S.textSize > 1 ? app.t('large') : app.t('normal')),
    () => {
      S.textSize = S.textSize > 1 ? 1 : 1.3;
    },
  );
  row(
    app.t('reduceMotion'),
    () => (S.reduceMotion ? ui.on : ui.off),
    () => {
      S.reduceMotion = !S.reduceMotion;
    },
  );
  if (app.game.skin?.fonts?.readable)
    row(
      app.t('readableFont'),
      () => (S.readableFont ? ui.on : ui.off),
      () => {
        S.readableFont = !S.readableFont;
      },
    );
  // Only in a game that captions some sound (`{ sfx, caption }`): elsewhere the row would do nothing.
  if (someCaption(app.game))
    row(
      app.t('captions'),
      () => (S.captions ? ui.on : ui.off),
      () => {
        S.captions = !S.captions;
      },
    );
  // Only in a game whose verbs have keys (4.3.0): a single-letter shortcut the player can turn off (WCAG 2.1.4), for
  // whoever types by voice or hits keys by accident.
  if (app.game.verbs.some((v) => v.key !== undefined))
    row(
      app.t('verbKeys'),
      () => (S.verbKeys ? ui.on : ui.off),
      () => {
        S.verbKeys = !S.verbKeys;
      },
    );
  const langs = app.o.languages;
  if (langs && langs.available.length > 1) {
    const b = el('button', '', `<span>${esc(app.t('language'))}</span><span>${esc(langs.current)}</span>`);
    b.onclick = () => {
      const next = must(
        langs.available[(langs.available.indexOf(langs.current) + 1) % langs.available.length],
        'next language',
      );
      try {
        localStorage.setItem(`${app.game.id}.lang`, next);
      } catch {
        /* no storage */
      }
      const u = new URL(location.href);
      u.searchParams.delete('lang');
      location.href = u.toString();
    };
    m.append(b);
  }
  const vol = (t: string, k: 'musicVolume' | 'sfxVolume' | 'voiceVolume') =>
    row(
      t,
      () => `${Math.round(S[k] * 100)} %`,
      () => {
        S[k] = Math.round((S[k] * 4 + 1) % 5) / 4;
      },
    );
  vol(app.t('volumeMusic'), 'musicVolume');
  vol(app.t('volumeSfx'), 'sfxVolume');
  if (app.game.audio?.voices && Object.keys(app.game.audio.voices).length) vol(app.t('volumeVoice'), 'voiceVolume');
  const back = el('button', '', `<span>${esc(ui.resume)}</span><span>▶</span>`);
  back.onclick = () => d.remove();
  m.append(back);
}
