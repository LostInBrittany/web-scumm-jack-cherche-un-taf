// Rooms tab, the IO with the view (4.1.8, programme §4.7: the Studio's biggest owners split into model / IO / view):
// the room is rendered by the real engine in an iframe (the placement editor, `?edit=<room>`), and the tab talks to
// it through postMessage (StudioToEditor / EditorToStudio, tools/studio/types.ts). This file owns the frame, its
// status line, the "dirty" state of the placement, the waiters of a save and the retries of a scroll to a content
// path; the tab (rooms.ts) answers through a small host interface: the room shown, the selection, the writes.
// On a hosted Studio (4.2.1, plan §6.1) the view is on the game's origin: messages go to that exact origin and are
// taken from it only; the view never writes, and a layout it sends is stored only as the answer to the Studio's own
// save request (its nonce), for the room shown. A save starts only from the member: the Studio's "Save layout", or
// their yes before a change that would reload the view. The write is the Studio's, as the member, under their lease.
import type { Id, Layout } from '@engine/core/types';
import { api, type EditorToStudio, type StudioToEditor } from './api';
import { gameElsewhere, gameOrigin, gameUrl, localGameUrl } from './game-origin';
import type { Sel } from './rooms-text';
import { h, toast } from './ui';

/** What the bridge asks of the tab. */
export interface BridgeHost {
  /** The room shown and the checkpoint the view starts from ('' for auto): the frame's URL. */
  room(): Id;
  checkpoint(): string;
  /** The current selection, announced to the view when it is ready. */
  selection(): Sel;
  /** The view picked another entity: the list and the sheet follow. */
  select(s: NonNullable<Sel>): void;
  /** The layout of `room` was stored through the Studio's backend (demo mode): the tab keeps it. */
  layoutStored(room: Id, layout: Layout): void;
  /** Marks a write as ours, so the file watcher's echo is not announced as an outside change. */
  ownWrite(): void;
  /** Called after every successful write (runs Check in the background). */
  saved(): void;
}

/** How long a save of the placement may take before a text edit goes ahead without it. */
const FLUSH_TIMEOUT = 4000;

export class EditorBridge {
  /** The engine's placement editor; the tab places it in its stage. */
  readonly frame: HTMLIFrameElement;
  /** What the view says: loading, entities without a place, placement not saved, a save error. */
  readonly status = h('span', { class: 'muted small' });
  private editorDirty = false;
  private savedWaiters: ((ok: boolean) => void)[] = [];
  private lastReadyAt = 0;
  private pendingSelect: Sel = null;
  /** The save the Studio asked for last: a hosted view's layout is taken as its answer only. */
  private saveNonce = '';
  /** The last navigation asked for: a ticket that arrives after a later one is dropped. */
  private navSeq = 0;

  constructor(private host: BridgeHost) {
    window.addEventListener('message', (e) => this.onMessage(e));
    this.frame = h('iframe', { class: 'engine', title: 'Room editor', src: 'about:blank' });
    void this.navigate();
  }

  /** When the view last said it was ready (Date.now()); 0 before the first time. */
  get lastReady() {
    return this.lastReadyAt;
  }

  /** The entity to select (or create, if it has no place) when the view is next ready: a just-added one. */
  selectWhenReady(s: Sel) {
    this.pendingSelect = s;
  }

  /** The view's page: `?edit=<room>` (and `&at=<checkpoint>`). */
  private query() {
    const q = new URLSearchParams({ edit: this.host.room() });
    const at = this.host.checkpoint();
    if (at) q.set('at', at);
    return `?${q}`;
  }

  /** Points the frame at the view (hosted: with a fresh ticket). */
  private async navigate() {
    const n = ++this.navSeq;
    const here = localGameUrl(this.query());
    if (here !== null) {
      this.frame.src = here;
      return;
    }
    try {
      const url = await gameUrl(this.query());
      if (n === this.navSeq) this.frame.src = url;
    } catch (e) {
      if (n === this.navSeq) this.status.textContent = `the room view does not open: ${(e as Error).message}`;
    }
  }

  /** A newer preview is ready (hosted): the view loads it, unless its placement is not saved. */
  reloadIfClean() {
    if (!this.editorDirty) this.reload();
  }

  reload() {
    this.editorDirty = false;
    this.status.textContent = 'loading…';
    void this.navigate();
  }

  post(m: StudioToEditor) {
    this.frame.contentWindow?.postMessage(m, gameOrigin());
  }

  /** Asks the view to save its placement. */
  save() {
    this.saveNonce = crypto.randomUUID();
    this.post({ source: 'web-scumm-studio', type: 'save', nonce: this.saveNonce });
  }

  private onMessage(e: MessageEvent) {
    const m = e.data as EditorToStudio;
    if (e.origin !== gameOrigin() || m?.source !== 'web-scumm-editor' || e.source !== this.frame.contentWindow) return;
    if (m.type === 'ready') {
      this.lastReadyAt = Date.now();
      this.editorDirty = false;
      this.status.textContent = m.missing.length
        ? `${m.missing.length} without a place: ${m.missing.map((x) => x.id).join(', ')}`
        : '';
      const s = this.pendingSelect ?? this.host.selection();
      this.pendingSelect = null;
      if (s)
        this.post({
          source: 'web-scumm-studio',
          type: m.missing.some((x) => x.id === s.id) ? 'create' : 'select',
          kind: s.kind,
          id: s.id,
        });
    } else if (m.type === 'select' && m.kind && m.id) {
      const sel = this.host.selection();
      if (sel?.kind !== m.kind || sel?.id !== m.id) this.host.select({ kind: m.kind, id: m.id });
    } else if (m.type === 'dirty') {
      this.editorDirty = m.dirty;
      this.status.textContent = m.dirty ? 'placement not saved' : '';
    } else if (m.type === 'saved') {
      void this.onSaved(m);
    }
  }

  private async onSaved(m: Extract<EditorToStudio, { type: 'saved' }>) {
    // Hosted: the answer to this Studio's last request, for the room shown, with a layout, and nothing else.
    if (gameElsewhere()) {
      if (!m.nonce || m.nonce !== this.saveNonce || m.room !== this.host.room() || !layoutShaped(m.layout)) return;
      this.saveNonce = '';
    }
    let { ok, error } = m;
    // The editor could not write the file (demo mode): the layout is stored through the Studio's backend.
    if (ok && m.layout) {
      try {
        await api.setLayout(m.room, m.layout);
      } catch (e) {
        ok = false;
        error = (e as Error).message;
      }
    }
    this.editorDirty = !ok;
    this.status.textContent = ok ? '' : (error ?? 'save failed');
    if (ok) {
      this.host.ownWrite();
      toast(api.mode === 'demo' ? 'Layout saved in this browser' : 'Layout saved');
      this.host.saved();
    } else toast(error ?? 'Layout not saved', 'error');
    if (ok && m.layout) this.host.layoutStored(m.room, m.layout);
    this.savedWaiters.splice(0).forEach((f) => f(ok));
  }

  /** Before touching the room file (the view reloads when it changes): save the placement in progress. */
  async flush() {
    if (!this.editorDirty) return;
    // Hosted, a save is the member's to start (the view's own word is the game's): asked, never assumed.
    if (gameElsewhere() && !confirm('The placement in the view is not saved. Save it before this change?')) return;
    const done = new Promise<boolean>((res) => {
      this.savedWaiters.push(res);
      setTimeout(() => res(false), FLUSH_TIMEOUT);
    });
    this.save();
    await done;
  }
}

/** A layout as a view may send one: a plain object of a reasonable size (the Studio's guard checks the rest). */
function layoutShaped(v: unknown): v is Layout {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  try {
    return JSON.stringify(v).length < 512 * 1024;
  } catch {
    return false;
  }
}

/** Scrolls to an editor, flashes it and focuses its field. */
export function focusEditor(el: HTMLElement) {
  el.scrollIntoView({ block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
  el.querySelector<HTMLElement>('textarea, input')?.focus();
}

/**
 * Scrolls to and flashes the editor of a content path (`on[3]`, `talk.lou[1].do[0]`…) under `root`, once the room
 * is shown: the sheet may still be loading, so it looks again every 150 ms, `tries` times, then gives up.
 */
export function focusPath(root: HTMLElement, path: string, tries = 20) {
  const el =
    root.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`) ??
    [...root.querySelectorAll<HTMLElement>('[data-path]')].find((x) => x.dataset.path?.startsWith(path));
  if (!el) {
    if (tries > 0) setTimeout(() => focusPath(root, path, tries - 1), 150);
    return;
  }
  focusEditor(el);
}
