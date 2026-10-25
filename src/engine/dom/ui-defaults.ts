// Every interface text the engine shows when the game's `ui` does not provide it. One table, so a release in another
// language can prove no English leaks: `App.uiFallbacks()` lists the keys a game left to these defaults, and the e2e
// (`npm run e2e -- --lang fr`) fails when one of them is visible. CONTENT_GUIDE lists them; `npm run i18n -- status`
// reports the keys a game leaves to the defaults.
import type { GameDef } from '../core/types';

export const DEFAULT_UI = {
  verbs: 'Verbs',
  saveFailed: 'Save failed',
  saveAdjusted: 'Save adjusted for this version',
  updateAvailable: 'A new version is ready.',
  updateNow: 'Save and update',
  advance: 'Continue',
  jump: '▲',
  duck: '▼',
  offlineStatus: 'Offline',
  offlineComplete: 'complete',
  offlineRetry: 'retry',
  save: 'Save',
  load: 'Load',
  slot: 'Slot {n}',
  emptySlot: 'empty',
  confirmOverwrite: 'Overwrite this save?',
  exportSave: 'Export file',
  importSave: 'Import file',
  exportSession: 'Export session',
  shareSession: 'Share session',
  settings: 'Settings',
  textSpeed: 'Text speed',
  textSize: 'Text size',
  slow: 'slow',
  normal: 'normal',
  fast: 'fast',
  large: 'large',
  reduceMotion: 'Reduce motion',
  readableFont: 'Readable font',
  language: 'Language',
  captions: 'Sound captions',
  verbKeys: 'Verb keys',
  volumeMusic: 'Music volume',
  volumeSfx: 'Sound volume',
  volumeVoice: 'Voice volume',
  fingerprint: 'Build',
  objectives: 'Objectives',
  // Remix (4.1.15): the title's Remix button and its menu, the pause menu's world row.
  remix: 'Remix',
  remixTitle: 'Which world?',
  remixStory: 'Story',
  remixRandom: 'A new world',
  remixSeed: 'Type a seed',
  remixDaily: 'Daily challenge',
  remixMystery: 'Mystery world',
  remixPlay: 'Play',
  remixInvalid: 'Not a seed code',
  remixWorld: 'World',
  remixHidden: 'hidden until the end',
  remixCopied: 'Copied',
  remixNoBridge: 'needs the Bridge',
  remixConflict: 'Your saved game lives in another world',
  remixKeepSaved: 'Continue the saved game',
  remixStartLinked: "Start the link's world (replaces it)",
  speedrun: 'Speedrun',
  exportRun: 'Export run',
  abandonRun: 'Abandon run',
} as const;

export type UiKey = keyof typeof DEFAULT_UI;

/** The game's text for a key, else the English default. */
export const uiText = (ui: GameDef['ui'], key: UiKey): string =>
  (ui as unknown as Record<string, string | undefined>)[key] ?? DEFAULT_UI[key];

/** The keys this game leaves to the English defaults, with the text a player would see. */
export const uiFallbacks = (ui: GameDef['ui']): Record<string, string> =>
  Object.fromEntries(
    (Object.keys(DEFAULT_UI) as UiKey[])
      .filter((k) => (ui as unknown as Record<string, unknown>)[k] === undefined)
      .map((k) => [k, DEFAULT_UI[k]]),
  );
