// The Studio: tabs Rooms / Storyboard / Check / Notes over the game on disk (/__studio/ on the dev server), or over a
// build-time snapshot with the edits kept in this browser (demo mode: studio.html in a STUDIO=1 build, e.g. on GitHub
// Pages; see wiki/en/studio.demo-mode.md#demo-mode).
import { VoicesTab } from './voices';
import { MusicTab } from './music';
import { undoButtons } from './structured';
import './style.css';
import { BASE, serverApi, useApi, type GameInfo, type StudioEvent, type StudioSnapshot } from './api';
import type { BrowserApi } from './api-browser';
import { AssetsTab } from './assets';
import { AssistantPanel } from './assistant';
import { CheckTab } from './check';
import { NotesStore, NotesTab, roomNotesBlock } from './notes';
import { PlayTab } from './play';
import { IrTab } from './ir-tab';
import { MapTab } from './map-tab';
import { RemixTab } from './remix-tab';
import { RoomsTab } from './rooms';
import { StoryboardTab } from './storyboard';
import { download, h, toast } from './ui';
import { must } from '../engine/core/must';
import { apiUrl, goLogin, hosting, loginHeld, studioFetch } from './api-base';
import { assetsPanel, buildsPanel } from './builds-panel';
import { commentsPanel } from './comments-panel';
import { gitPanel } from './git-panel';
import { diffPanel } from './diff-panel';
import { gameLink } from './game-origin';
import { gateScreen, hostedStudio, type Me, whoAmI } from './hosted';

type TabId =
  | 'rooms'
  | 'storyboard'
  | 'map'
  | 'assets'
  | 'voices'
  | 'music'
  | 'check'
  | 'play'
  | 'language'
  | 'remix'
  | 'notes';
const TABS: [TabId, string][] = [
  ['rooms', 'Rooms'],
  ['storyboard', 'Storyboard'],
  ['map', 'Map'],
  ['assets', 'Assets'],
  ['voices', 'Voices'],
  ['music', 'Music'],
  ['check', 'Check'],
  ['play', 'Play'],
  ['language', 'Language'],
  ['remix', 'Remix'],
  ['notes', 'Notes'],
];

// Vite tells every page to reload when a game file changes (the engine view needs it). The Studio page doesn't:
// it follows changes through its own event feed, and keeps what is being typed.
import.meta.hot?.on('vite:beforeFullReload', (p: { path?: string; triggeredBy?: string }) => {
  if (p.triggeredBy && /[\\/]games[\\/]/.test(p.triggeredBy)) p.path = '/__studio-no-reload.html';
});

/** The demo backend: the snapshot served next to studio.html, the edits in localStorage, the game module for checks. */
async function demoApi(): Promise<BrowserApi> {
  const [{ BrowserApi }, snapshot] = await Promise.all([
    import('./api-browser'),
    fetch(`${BASE}studio-demo/snapshot.json`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`no demo snapshot (${r.status}): build with STUDIO=1`);
      return r.json() as Promise<StudioSnapshot>;
    }),
  ]);
  let storage: Storage | undefined;
  try {
    storage = localStorage;
  } catch {
    /* blocked: edits last until the page is closed */
  }
  return new BrowserApi({
    snapshot,
    storage,
    download,
    loadGame: async () => {
      // The hosted Studio's page holds no game (`npm run studio-client`): this branch is left out of its build.
      if (import.meta.env.VITE_STUDIO_HOSTED === '1') throw new Error('no demo on a hosted Studio');
      const [g, eng] = await Promise.all([import('@game'), import('@engine/minigames')]);
      const m = g.manifest as unknown as { images?: Record<string, [number, number]>; audio?: Record<string, unknown> };
      return {
        game: g.game,
        minigames: { ...eng.minigames, ...g.minigames },
        commands: g.commands,
        locales: g.locales,
        assets: m.images ? { images: m.images, audio: m.audio } : undefined,
      };
    },
  });
}

/**
 * The backend: the dev server's API, or the demo one when the build says so (VITE_STUDIO_DEMO=1) or when there is no
 * API to talk to (a static host answers 404, or a page instead of JSON).
 */
async function pickBackend(): Promise<{ info: GameInfo; demo: BrowserApi | null }> {
  // The Studio Server (4.2.1): its API only, never the demo; a visitor without a session logs in first.
  if (hosting.hosted || import.meta.env.VITE_STUDIO_HOSTED === '1') {
    const r = await studioFetch('game', { cache: 'no-store' });
    if (r.status === 401) {
      goLogin();
      return new Promise(() => undefined);
    }
    const data = await r.json().catch(() => ({ error: `${r.status} ${r.statusText}` }));
    if (!r.ok) throw new Error(data.error ?? `${r.status}`);
    useApi(serverApi);
    loginHeld();
    return { info: data as GameInfo, demo: null };
  }
  if (import.meta.env.VITE_STUDIO_DEMO !== '1') {
    const r = await fetch(apiUrl('game'), { cache: 'no-store' }).catch(() => null);
    const json = r?.headers.get('content-type')?.includes('json');
    if (r && json) {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `${r.status}`);
      useApi(serverApi);
      return { info: data as GameInfo, demo: null };
    }
    if (r && r.status !== 404 && r.ok === false) throw new Error(`${r.status} ${r.statusText}`);
  }
  const demo = await demoApi();
  useApi(demo);
  return { info: await demo.game(), demo };
}

/** "Demo: your edits stay in this browser", with Download patch and Reset demo. */
function demoBanner(demo: BrowserApi): HTMLElement {
  const count = h('span', { class: 'muted small' });
  const dl = h(
    'button',
    {
      class: 'primary',
      onclick: () => {
        if (!demo.edits) {
          toast('No edits yet: change a text, a placement, the storyboard or a note first.', 'info');
          return;
        }
        download(
          `studio-patch-${demo.gameId}.json`,
          JSON.stringify(demo.patchFile(), null, 2) + '\n',
          'application/json',
        );
      },
    },
    'Download patch',
  );
  const reset = h(
    'button',
    {
      onclick: () => {
        if (!confirm('Drop all your edits and go back to the original game?')) return;
        demo.reset();
        location.reload();
      },
    },
    'Reset demo',
  );
  const refresh = () => {
    count.textContent = demo.edits ? `${demo.edits} edit${demo.edits > 1 ? 's' : ''} kept` : 'no edits yet';
  };
  demo.onChange = refresh;
  refresh();
  return h(
    'div',
    { class: 'demo-banner', role: 'note' },
    h(
      'span',
      null,
      h('b', null, 'Demo:'),
      ' your edits stay in this browser. Download them as a patch and apply them to your copy with ',
      h('code', null, 'npm run studio-apply patch.json'),
      '.',
    ),
    count,
    dl,
    reset,
  );
}

async function start() {
  const root = document.getElementById('studio')!;
  // A hosted Studio shows nothing of the game before the session is a member's (hosted.ts).
  let me: Me | undefined;
  if (hosting.hosted) {
    const who = await whoAmI();
    if (who.state !== 'member') return void root.replaceChildren(await gateScreen(who));
    me = who.me;
  }
  let info: GameInfo, demo: BrowserApi | null;
  try {
    ({ info, demo } = await pickBackend());
  } catch (e) {
    root.replaceChildren(h('p', { class: 'error pad' }, `The game does not load: ${(e as Error).message}`));
    return;
  }
  document.title = `Studio · ${info.title}`;

  // Own writes come back from the file watcher: don't announce them as outside changes.
  let ownUntil = 0;
  const ownWrite = () => {
    ownUntil = Date.now() + 2000;
  };

  const badge = h('span', { class: 'badge' });
  const check = new CheckTab(
    info,
    (state, text) => {
      badge.className = `badge ${state}`;
      badge.textContent = text;
    },
    (room, path) => {
      rooms.openRoom(room);
      show('rooms');
      rooms.focusPath(path);
    },
  );
  const [hashTab, hashRoom] = location.hash.slice(1).split('/');
  const store = new NotesStore(ownWrite);
  let show: (t: TabId) => void = () => undefined;
  const openRoom = (id: string) => {
    rooms.openRoom(id);
    show('rooms');
    shared?.roomShown();
  };
  const rooms = new RoomsTab(
    {
      info,
      saved: () => check.schedule(),
      ownWrite,
      notesBlock: (room) =>
        roomNotesBlock(store, room, (about) => {
          notes.focusAbout(about);
          show('notes');
        }),
    },
    hashRoom,
  );
  const storyboard = new StoryboardTab({ info, notes: store, ownWrite, openRoom });
  const notes = new NotesTab({
    info,
    store,
    panels: () => storyboard.panels(),
    open: (about) => {
      if (storyboard.panels().some(([id]) => id === about)) {
        show('storyboard');
        storyboard.showPanel(about);
        return;
      }
      openRoom(must(about.split('.')[0], 'room of a note'));
    },
  });
  const assets = new AssetsTab({ info, ownWrite, openRoom, prepared: () => rooms.reloadFrame() });
  const play = new PlayTab(info);
  const voices = new VoicesTab();
  const music = new MusicTab(info);
  const language = new IrTab(info);
  const scenario = new MapTab(me?.role === 'reviewer');
  const remix = new RemixTab({
    selection: () => ({
      room: rooms.room,
      entity: rooms.selection ? { kind: rooms.selection.kind, id: rooms.selection.id } : undefined,
    }),
  });
  // What changed between two revisions (4.2.3): the dev server and a hosted Studio have the route, not the demo.
  if (!demo) check.el.append(diffPanel());
  const panes: Record<TabId, HTMLElement> = {
    rooms: rooms.el,
    storyboard: storyboard.el,
    map: scenario.el,
    assets: assets.el,
    voices: voices.el,
    music: music.el,
    check: check.el,
    play: play.el,
    language: language.el,
    remix: remix.el,
    notes: notes.el,
  };

  const nav = h('nav', { class: 'tabs', role: 'tablist' });
  // The Assets tab is served by the Studio Server too since 4.2.3 (its uploads, its cutting and Prepare on the worker).
  let current: TabId = (TABS.some(([t]) => t === hashTab) ? hashTab : 'rooms') as TabId;
  show = (t: TabId) => {
    current = t;
    for (const [id, el] of Object.entries(panes)) el.hidden = id !== t;
    nav.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.tab === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    history.replaceState(null, '', t === 'rooms' ? `#rooms/${rooms.room}` : `#${t}`);
    shared?.moved();
    if (t === 'storyboard') void storyboard.load();
    if (t === 'notes') void notes.load();
    if (t === 'assets') void assets.load();
    if (t === 'voices') void voices.load();
    if (t === 'music') music.load();
    if (t === 'language') void language.load();
    if (t === 'map') void scenario.load();
    if (t === 'remix') void remix.load();
  };
  for (const [id, label] of TABS) {
    nav.append(
      h('button', { role: 'tab', dataset: { tab: id }, onclick: () => show(id) }, label, id === 'check' ? badge : null),
    );
  }
  const live = demo ? null : h('span', { class: 'live', title: 'Watching the game folder' }, '●');
  // A file changed on disk (dev server) or in a committed revision (Studio Server): reload what it touches.
  function changed(file: string, by?: string) {
    const outside = Date.now() > ownUntil;
    if (outside && /\.(ts|json)$/.test(file))
      toast(by ? `${file} changed by ${by}` : `${file} changed on disk`, 'info');
    rooms.onFileChanged(file);
    assets.onFileChanged(file);
    scenario.onFileChanged(file);
    voices.onFileChanged(file);
    if (file === 'storyboard.json' && outside) storyboard.onDiskChange();
    if (file === 'notes.json' && outside) void store.load();
    // Another member's voice row (H10): read again, so the next edit is made from it.
    if (file === 'voices.json' && outside) void voices.load();
    if (
      outside &&
      /\.(ts|json)$/.test(file) &&
      file !== 'notes.json' &&
      file !== 'storyboard.json' &&
      file !== 'groupings.json'
    )
      check.schedule(1000);
  }
  // A shared Studio: the revision, who is here, the leases, the refusals (hosted.ts).
  const shared = me
    ? hostedStudio({
        me,
        rooms: info.rooms,
        room: () => rooms.room,
        where: () =>
          current === 'rooms' ? `Rooms · ${rooms.room}` : (TABS.find(([t]) => t === current)?.[1] ?? current),
        changed,
        previewReady: () => rooms.previewReady(),
      })
    : null;
  const assistant = new AssistantPanel({
    info,
    demo,
    selection: () => {
      const sel = rooms.selection;
      return {
        tab: current,
        room: rooms.room,
        entity: sel ? { kind: sel.kind, id: sel.id } : undefined,
        panel: current === 'storyboard' ? storyboard.currentPanel() : undefined,
      };
    },
    refresh: (wrote) => {
      // On the dev server the file watcher reloads too; the demo has only this.
      if (wrote.some((t) => t !== 'add_note' && t !== 'set_storyboard')) {
        void rooms.load();
        if (demo) rooms.reloadFrame();
        check.schedule(300);
      }
      if (wrote.includes('set_storyboard')) {
        if (demo) void storyboard.reload();
        else storyboard.onDiskChange();
        check.schedule(300);
      }
      if (wrote.includes('add_note')) void store.load();
    },
  });
  const assistantBtn = h(
    'button',
    {
      class: 'abtn',
      title: 'Ask an AI to help complete the game (a)',
      'aria-label': 'Assistant',
      onclick: () => assistant.toggle(),
    },
    'Assistant',
  );
  root.replaceChildren(
    ...(demo ? [demoBanner(demo)] : []),
    h(
      'header',
      { class: 'top' },
      h('h1', null, 'Studio'),
      h('span', { class: 'game' }, info.title, h('span', { class: 'muted' }, ` · games/${info.id}`)),
      nav,
      // On a shared Studio, the member's own last change (4.2.2): the room view follows its preview.
      undoButtons(() => {
        void rooms.load();
        if (!hosting.hosted) rooms.reloadFrame();
        check.schedule(300);
      }),
      gameLink('?dev', 'Play ↗', { class: 'play', title: demo ? 'Play with your edits (dev tools on)' : undefined }),
      // The Assistant on a hosted Studio comes with its own route on the server (not in this version).
      hosting.hosted ? null : assistantBtn,
      shared ? shared.bar : live,
    ),
    ...(shared ? [shared.banner] : []),
    h('main', null, ...Object.values(panes)),
    assistant.el,
  );
  if (shared && me) {
    check.follow(shared.head, shared.onHead);
    // The published builds (4.2.2): beside the game in the Play tab.
    play.el
      .querySelector('.playside')
      ?.append(
        buildsPanel({ owner: me.role === 'owner', dev: me.role !== 'reviewer' }),
        gitPanel({ owner: me.role === 'owner' }),
        ...(me.role !== 'reviewer' ? [assetsPanel()] : []),
      );
    // Comments (4.2.3): in the Notes tab, a reviewer's too.
    notes.el.prepend(commentsPanel({ owner: me.role === 'owner' }));
    const frame = rooms.el.querySelector<HTMLIFrameElement>('iframe.engine');
    rooms.el.querySelector('.stage .bar')?.append(shared.roomChip, ...(frame ? [shared.previewLabel(frame)] : []));
    rooms.el.querySelector('select[aria-label="Room"]')?.addEventListener('change', () => shared.roomShown());
  }
  show(current);
  void check.run();
  // The storyboard (panel ids for the notes) and the notes (shown in every tab) are read at start.
  void storyboard.load();
  void store.load();

  // Ctrl/Cmd+S saves the storyboard while its tab is shown.
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's' && current === 'storyboard') {
      e.preventDefault();
      void storyboard.save();
    }
    // `a` toggles the Assistant when nothing is being typed.
    const t = e.target as HTMLElement | null;
    if (
      !hosting.hosted &&
      e.key === 'a' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))
    ) {
      e.preventDefault();
      assistant.toggle();
    }
  });

  // Changes on disk (an AI, an editor, git): reload what they touch. The demo has no disk to watch; a hosted Studio
  // follows its revisions (hostedStudio).
  if (demo || !live || shared) return;
  const es = new EventSource(apiUrl('events'));
  es.onopen = () => live.classList.add('on');
  es.onerror = () => live.classList.remove('on');
  // The dev server says which file changed on disk; the Studio Server, which operation committed (live.ts).
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data) as StudioEvent;
    if (ev.type === 'changed') changed(ev.file);
  };
}

void start();
