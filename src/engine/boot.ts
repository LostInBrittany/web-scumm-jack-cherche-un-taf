// The game's bootstrap, so a game that embeds the engine does not copy `src/main.ts` by hand: language, fonts, the
// verified save store (errors reported once the App exists), the App, the dev tools, the title screen, the service
// worker. Each step is also exported on its own. `src/main.ts` is the reference caller (docs/en/UPGRADING.md §8).
import { App } from './dom/app';
import type { SaveStore } from './core/ports';
import type { BuildRevision } from './dom/revision';
import type { CustomCommands } from './core/custom';
import type { GameDef, Id, Layout } from './core/types';
import type { AssetManifest } from './dom/assets';
import type { Minigame } from './minigames';
import type { EditorOptions } from './dev/editor';
import { FONT_PIXEL, FONT_UI } from './dom/fonts';
import { applyLocale } from './tools/i18n';
import { uiText } from './dom/ui-defaults';

/** The translations a game ships, by language then by text path (`locales/<lang>.json`). @public */
export type Locales = Record<string, Record<string, string>>;

/**
 * `registerSW` of `virtual:pwa-register` (vite-plugin-pwa), injected so the engine never imports a virtual module.
 * @extension
 */
export interface SwModule {
  registerSW(o: { immediate?: boolean; onNeedRefresh?: () => void }): (reloadPage?: boolean) => Promise<void>;
}

/**
 * What `bootGame` starts the game with: the game, its layouts and manifest, minigames, commands, locales, root, store,
 * service worker, and the revision a preview is of.
 * @public
 */
export interface BootOptions {
  game: GameDef;
  layouts: Record<Id, Layout>;
  manifest: AssetManifest;
  minigames?: Record<Id, Minigame>;
  commands?: CustomCommands;
  /** Translations the game ships (`locales/<lang>.json`); the settings menu offers them. */
  locales?: Locales;
  /** The element the game mounts in, or its id; default `#app`. */
  root?: HTMLElement | string;
  /** Asset version added to URLs (`__ASSETS_VERSION__` in a Vite build). */
  version?: string;
  /** A store to use instead of the verified IndexedDB one (tests, the Studio demo). */
  store?: SaveStore;
  /** Dev tools (`?dev`, `?edit=<room>`, `?at=<checkpoint>`): when they apply, and how to patch the game before it runs. */
  dev?: {
    enabled: (q: URLSearchParams) => boolean;
    patch?: (
      game: GameDef,
      layouts: Record<Id, Layout>,
      q: URLSearchParams,
    ) => Promise<{ game: GameDef; layouts: Record<Id, Layout>; store?: SaveStore }>;
    options?: EditorOptions;
  };
  /** The PWA service worker; `false` for a build without vite-plugin-pwa. */
  sw?: { register: () => Promise<SwModule> } | false;
  /**
   * What the build knows of the game's fingerprint (4.1.12, ADR 0013): the hash of its trusted extensions and the
   * engine's version (`__TRUSTED_EXTENSIONS__`, `__ENGINE_VERSION__` in a Vite build). The pause menu shows the
   * fingerprint; without these, its extensions part is unknown (`????????`).
   */
  build?: { trustedExtensions?: string; engine?: string };
  /**
   * The revision this build is of (4.2.2, ADR 0026: a hosted Studio's preview): saves record where they were made,
   * and one made in other content asks before it is resumed. `url` is another revision's build. Default none.
   */
  revision?: BuildRevision;
  /** `window.__game = app` (console debugging, e2e drivers); default true. */
  expose?: boolean;
  /** The page's URL parameters; default `location.search`. */
  query?: URLSearchParams;
}

/** `?lang=`, then the player's saved choice, then the browser's language when the game ships it. @public */
export function pickLanguage(
  _written: GameDef,
  locales: Locales | undefined,
  o: { query?: string | null; stored?: string | null; navigatorLang?: string } = {},
): string | undefined {
  if (o.query) return o.query;
  if (o.stored) return o.stored;
  const nav = o.navigatorLang?.toLowerCase();
  if (nav && locales) return Object.keys(locales).find((l) => nav.startsWith(l.toLowerCase()));
  return undefined;
}

/** The game's fonts loaded, so the first text measurements are right. Resolves anyway when the API is missing or a font fails. */
export function waitFonts(
  game: GameDef,
  fonts: { load?: (spec: string) => Promise<unknown> } | undefined = (
    globalThis.document as unknown as { fonts?: { load?: (s: string) => Promise<unknown> } } | undefined
  )?.fonts,
): Promise<void> {
  const families = [game.skin.fonts?.ui ?? FONT_UI, game.skin.fonts?.pixel ?? FONT_PIXEL];
  if (!fonts?.load) return Promise.resolve();
  return Promise.all(families.map((f) => fonts.load!(`12px "${f}"`))).then(
    () => undefined,
    () => undefined,
  );
}

/** How a host supplies the save store `openStore` opens, in place of the verified IndexedDB one. @extension */
export type StoreOpener = (game: GameDef, fail: (e: Error) => void, warn: (m: string) => void) => Promise<SaveStore>;
const defaultOpener: StoreOpener = async (game, fail, warn) =>
  (await import('./dom/save-store')).IndexedDbSaveStore.open(game, fail, warn);

/**
 * Opens the verified store and keeps its early errors and warnings until an App can show them. Without IndexedDB the
 * App's verified localStorage adapter is used (`store` undefined).
 * @public
 */
export async function openStore(
  game: GameDef,
  open: StoreOpener = defaultOpener,
): Promise<{ store?: SaveStore; attach: (app: App) => void }> {
  let app: App | undefined;
  const errors: Error[] = [],
    warnings: string[] = [];
  let store: SaveStore | undefined;
  try {
    store = await open(
      game,
      (e) => {
        if (app) app.reportStorageError(e);
        else errors.push(e);
      },
      (m) => {
        if (app) app.reportSaveWarning(m);
        else warnings.push(m);
      },
    );
  } catch (e) {
    console.warn('IndexedDB autosave unavailable; using localStorage fallback', e);
  }
  return {
    store,
    attach: (a) => {
      app = a;
      for (const e of errors.splice(0)) a.reportStorageError(e);
      for (const m of warnings.splice(0)) a.reportSaveWarning(m);
    },
  };
}

/**
 * Boots the game in the page and returns the App (after the title screen is shown, or the dev tools started).
 * @public
 */
export async function bootGame(o: BootOptions): Promise<App> {
  const q = o.query ?? new URLSearchParams(globalThis.location?.search ?? '');
  const written = o.game;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(`${written.id}.lang`);
  } catch {
    /* no storage */
  }
  const lang = pickLanguage(written, o.locales, {
    query: q.get('lang'),
    stored,
    navigatorLang: globalThis.navigator?.language,
  });
  const texts = lang && o.locales?.[lang] ? applyLocale(written, o.locales[lang], o.minigames) : written;
  // Remix (4.1.15): the world this page plays, applied after the translation so that every language says the same
  // code. The autosave's world first (Continue never disappears), else a link's (`?seed=`, `?daily=`, `?world=`), else
  // the one chosen before, else the story; a link to another world than the saved game's is asked on the title screen
  // (dom/remix-boot.ts), never adopted silently.
  let translated = texts;
  if (written.remix) {
    const remix = await import('./dom/remix-menu');
    const rb = await import('./dom/remix-boot');
    const { applyVariant, applyStory } = await import('./core/remix/apply');
    let linked: Awaited<ReturnType<typeof remix.worldFromQuery>>;
    try {
      linked = await remix.worldFromQuery(written, q);
    } catch (e) {
      rb.setPendingNotice(`${uiText(written.ui, 'remixInvalid')}: ${(e as Error).message}`);
    }
    const choice = rb.decideWorld({
      linked,
      stored: remix.storedWorld(written.id),
      saved: await rb.peekSavedWorld(written.id),
      start: remix.hasPendingStart(written.id),
    });
    if (choice.keep) remix.keepWorld(written.id, choice.world);
    rb.setPendingConflict(choice.conflict);
    try {
      translated = choice.world
        ? applyVariant(texts, choice.world, { lang: lang ?? written.lang })
        : applyStory(texts, { lang: lang ?? written.lang });
    } catch (e) {
      // A world this version of the game no longer has (or a forged one): the story, said to the player.
      rb.setPendingNotice(`${uiText(written.ui, 'remixInvalid')}: ${(e as Error).message}`);
      remix.keepWorld(written.id, undefined);
      translated = applyStory(texts, { lang: lang ?? written.lang });
    }
  }
  // The voices of the chosen language (`audio.voicesByLang`), else the game's own: a translated line keeps its id.
  const byLang = lang && lang !== (written.lang ?? 'en') ? written.audio?.voicesByLang?.[lang] : undefined;
  const localized = byLang ? { ...translated, audio: { ...translated.audio, voices: byLang } } : translated;
  document.documentElement.lang = lang ?? written.lang ?? 'en';
  await waitFonts(localized);

  const dev = !!o.dev?.enabled(q);
  let game = localized,
    layouts = o.layouts,
    store = o.store;
  if (dev && o.dev?.patch) ({ game, layouts, store = store } = await o.dev.patch(game, layouts, q));
  const opened = store ? undefined : await openStore(game);
  store ??= opened?.store;

  const root =
    typeof o.root === 'string'
      ? document.querySelector<HTMLElement>(o.root)
      : (o.root ?? document.getElementById('app'));
  if (!root) throw new Error(`bootGame: no element for root ${String(o.root ?? '#app')}`);
  const base = written.lang ?? 'en';
  const others = Object.keys(o.locales ?? {}).filter((l) => l !== base);
  const app = new App({
    root,
    game,
    layouts,
    manifest: o.manifest,
    minigames: o.minigames,
    commands: o.commands,
    store,
    version: o.version,
    source: written,
    build: o.build,
    languages: others.length ? { current: lang ?? base, available: [base, ...others] } : undefined,
  });
  opened?.attach(app);
  // Saves across revisions (ADR 0026): its module only for a build that declares one.
  if (o.revision) await (await import('./dom/revision')).installRevision(app, o.revision);
  if (o.expose !== false) (globalThis as unknown as { __game?: App }).__game = app;
  // The world link (4.1.1): its module only for a game that declares `reality`; simulated in the dev tools.
  if (game.reality)
    void import('./dom/reality-ui').then(async ({ startReality }) => {
      app.reality = await startReality(app, { simulated: dev || q.get('reality') === 'sim' });
    });

  if (dev) {
    app.engine.traceOn = true;
    const { startDev } = await import('./dev');
    await startDev(app, { edit: q.get('edit'), checkpoint: q.get('at'), ...(o.dev?.options ?? {}) });
    return app;
  }
  // Said before the title (whose warm-up starts at once): the warm-up waits for the worker's control (dom/update.ts).
  if (o.sw && 'serviceWorker' in navigator) app.swExpected = true;
  await app.showTitle();
  if (o.sw && 'serviceWorker' in navigator) {
    const { registerSW } = await o.sw.register();
    const updateSW = registerSW({ immediate: true, onNeedRefresh: () => app.offerUpdate(() => updateSW(true)) });
  }
  return app;
}
