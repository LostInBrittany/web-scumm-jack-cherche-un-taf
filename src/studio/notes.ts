// Notes: the shared log of games/<id>/notes.json (you, teammates, any AI). A store shared by the Notes tab, the
// Storyboard tab (notes per panel) and the Rooms tab (notes per room), and the Notes tab itself: the whole log,
// newest first, grouped by what it is about, with filters, a composer, reply / edit / delete.
import { api, ApiError, type GameInfo, type NewNote, type Note } from './api';
import { hosting } from './api-base';
import { h, select, toast } from './ui';

export class NotesStore {
  entries: Note[] = [];
  loaded = false;
  private subs = new Set<() => void>();
  constructor(private ownWrite: () => void = () => undefined) {}

  async load() {
    try {
      this.entries = (await api.notes()).entries;
      this.loaded = true;
    } catch (e) {
      toast(`Notes: ${(e as Error).message}`, 'error');
    }
    this.emit();
  }

  /** Subscribes to changes; returns the unsubscribe function. */
  on(fn: () => void): () => void {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }
  private emit() {
    for (const f of [...this.subs]) f();
  }

  /** Notes whose `about` is exactly `key`, newest first. */
  about(key: string): Note[] {
    return this.entries.filter((n) => n.about === key).sort(newestFirst);
  }

  async add(n: NewNote): Promise<Note | null> {
    try {
      this.ownWrite();
      const note = await api.addNote(n);
      this.entries.push(note);
      this.emit();
      toast('Note added');
      return note;
    } catch (e) {
      // A refusal a dialog already shows (a hosted Studio's 423, 409) is not said twice.
      if (!(e instanceof ApiError && e.handled)) toast((e as Error).message, 'error');
      return null;
    }
  }

  async edit(id: string, text: string): Promise<boolean> {
    try {
      this.ownWrite();
      const note = await api.editNote(id, { text });
      this.entries = this.entries.map((n) => (n.id === id ? note : n));
      this.emit();
      toast('Note saved');
      return true;
    } catch (e) {
      // A refusal a dialog already shows (a hosted Studio's 423, 409) is not said twice.
      if (!(e instanceof ApiError && e.handled)) toast((e as Error).message, 'error');
      return false;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      this.ownWrite();
      await api.deleteNote(id);
      this.entries = this.entries.filter((n) => n.id !== id);
      this.emit();
      toast('Note deleted');
      return true;
    } catch (e) {
      // A refusal a dialog already shows (a hosted Studio's 423, 409) is not said twice.
      if (!(e instanceof ApiError && e.handled)) toast((e as Error).message, 'error');
      return false;
    }
  }
}

export const newestFirst = (a: Note, b: Note) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

function getAuthor(): string {
  try {
    return localStorage.getItem('studio.author') || 'you';
  } catch {
    return 'you';
  }
}
function setAuthor(v: string) {
  try {
    localStorage.setItem('studio.author', v.trim() || 'you');
  } catch {
    /* private mode */
  }
}

/** "just now", "5 min ago", "3 h ago", else the local date and time. */
function when(iso: string): string {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 0 || Number.isNaN(s)) return d.toLocaleString();
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** One note: author, time, text, and Reply / Edit / Delete. */
export function noteItem(
  n: Note,
  store: NotesStore,
  opts: { onReply?: (about: string) => void; showAbout?: boolean } = {},
): HTMLElement {
  const textEl = h('p', { class: 'ntext' }, n.text);
  const li = h('li', { class: 'note', dataset: { id: n.id } });
  const meta = h(
    'div',
    { class: 'nmeta' },
    h('b', { class: n.author === 'you' ? 'you' : '' }, n.author),
    n.task
      ? h('span', { class: 'tasktag', title: 'A request for an AI agent (it reads the notes with get_notes)' }, 'task')
      : null,
    h('time', { datetime: n.at, title: new Date(n.at).toLocaleString() }, when(n.at)),
    n.edited ? h('span', { class: 'muted', title: `edited ${new Date(n.edited).toLocaleString()}` }, '(edited)') : null,
    opts.showAbout && n.about ? h('code', null, n.about) : null,
  );
  const actions = h(
    'div',
    { class: 'nact' },
    opts.onReply ? h('button', { class: 'link', onclick: () => opts.onReply!(n.about) }, 'Reply') : null,
    h('button', { class: 'link', onclick: () => editMode() }, 'Edit'),
    h(
      'button',
      {
        class: 'link danger',
        onclick: async () => {
          if (confirm(`Delete this note by ${n.author}?\n\n${n.text.slice(0, 200)}`)) await store.remove(n.id);
        },
      },
      'Delete',
    ),
  );
  const editMode = () => {
    const t = h('textarea', {
      rows: Math.min(8, n.text.split('\n').length + 1),
      value: n.text,
      'aria-label': 'Edit the note',
    });
    const save = async () => {
      if (t.value.trim() && t.value.trim() !== n.text) await store.edit(n.id, t.value);
      else view();
    };
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') view();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void save();
      }
    });
    li.replaceChildren(
      meta,
      t,
      h(
        'div',
        { class: 'nact' },
        h('button', { class: 'primary', onclick: () => void save() }, 'Save'),
        h('button', { onclick: () => view() }, 'Cancel'),
      ),
    );
    t.focus();
  };
  const view = () => li.replaceChildren(meta, textEl, actions);
  view();
  return li;
}

/** A composer: text (+ author), posting with a fixed or editable `about`. */
export function composer(
  store: NotesStore,
  about: string | HTMLInputElement,
  placeholder = 'Add a note…',
): { el: HTMLElement; text: HTMLTextAreaElement } {
  const text = h('textarea', { rows: 2, placeholder, 'aria-label': 'Note text' });
  const author = h('input', {
    type: 'text',
    value: getAuthor(),
    'aria-label': 'Author',
    class: 'author',
    title: 'Author',
  });
  const send = async () => {
    if (!text.value.trim()) {
      text.focus();
      return;
    }
    setAuthor(author.value);
    const ok = await store.add({
      about: typeof about === 'string' ? about : about.value,
      author: author.value.trim() || 'you',
      text: text.value,
    });
    if (ok) text.value = '';
  };
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  });
  const el = h(
    'div',
    { class: 'composer' },
    text,
    h(
      'div',
      { class: 'crow' },
      // On a hosted Studio the author is the session's (the server sets it).
      hosting.hosted ? null : h('label', { class: 'muted small' }, 'as ', author),
      h('button', { class: 'primary', onclick: () => void send() }, 'Add note'),
    ),
  );
  return { el, text };
}

/** A block that re-renders itself on every store change while it is in the page. */
export function liveBlock(store: NotesStore, cls: string, draw: (el: HTMLElement) => void): HTMLElement {
  const el = h('section', { class: cls });
  draw(el);
  const off = store.on(() => {
    if (!el.isConnected) {
      off();
      return;
    }
    draw(el);
  });
  return el;
}

/** "Notes (n)" at the bottom of a room in the Rooms tab: notes about the room or one of its entities (`room.x`). */
export function roomNotesBlock(store: NotesStore, room: string, openNotes?: (about: string) => void): HTMLElement {
  let open = false;
  return liveBlock(store, 'roomnotes', (el) => {
    const list = store.entries.filter((n) => n.about === room || n.about.startsWith(`${room}.`)).sort(newestFirst);
    const c = composer(store, room, `A note about ${room}…`);
    const det = h(
      'details',
      {
        open,
        ontoggle: () => {
          open = det.open;
        },
      },
      h('summary', null, h('h3', null, 'Notes ', h('span', { class: 'muted' }, `(${list.length})`))),
      list.length
        ? h(
            'ul',
            { class: 'notes' },
            list.map((n) => noteItem(n, store, { showAbout: n.about !== room, onReply: () => c.text.focus() })),
          )
        : h('p', { class: 'muted small' }, 'No notes about this room.'),
      c.el,
      openNotes ? h('button', { class: 'link', onclick: () => openNotes(room) }, 'All notes ›') : null,
    );
    el.replaceChildren(det);
  });
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export interface NotesCtx {
  info: GameInfo;
  store: NotesStore;
  /** Panels of the storyboard: [id, title, board title]. */
  panels(): [string, string, string][];
  /** Opens what a note is about (a room in Rooms, a panel in Storyboard). */
  open(about: string): void;
}

export class NotesTab {
  readonly el = h('section', { class: 'tab notestab' });
  private q = '';
  private aboutFilter = '';
  private authorFilter = '';
  private listEl = h('div', { class: 'nlist' });
  private countEl = h('span', { class: 'muted small' });
  private filterBar = h('div', { class: 'bar' });
  private aboutInput = h('input', {
    type: 'text',
    placeholder: 'room, panel id, room.entity… (empty: general)',
    'aria-label': 'About',
    list: 'notes-about',
  });
  private datalist = h('datalist', { id: 'notes-about' });
  private comp: { el: HTMLElement; text: HTMLTextAreaElement };

  constructor(private ctx: NotesCtx) {
    this.comp = composer(ctx.store, this.aboutInput, 'Your note…');
    this.el.append(
      this.filterBar,
      h(
        'div',
        { class: 'ngrid' },
        h(
          'div',
          { class: 'panel ncompose' },
          h('h3', null, 'New note'),
          h('label', { class: 'field' }, h('span', null, 'About'), this.aboutInput),
          this.datalist,
          h('label', { class: 'field' }, h('span', null, 'Note'), this.comp.el),
          h(
            'p',
            { class: 'muted small' },
            'notes.json is shared: an AI reads it back (MCP get_notes, or the file). Ctrl/Cmd+Enter adds.',
          ),
        ),
        this.listEl,
      ),
    );
    ctx.store.on(() => this.render());
    this.render();
  }

  async load() {
    if (!this.ctx.store.loaded) await this.ctx.store.load();
    else this.render();
  }

  /** Shows the notes about `about` and prepares the composer for it. */
  focusAbout(about: string) {
    this.aboutFilter = about;
    this.aboutInput.value = about;
    this.render();
  }

  private kindOf(about: string): { kind: string; label: string } {
    if (!about) return { kind: 'general', label: 'General' };
    const room = this.ctx.info.rooms.find((r) => r.id === about);
    if (room) return { kind: 'room', label: room.name };
    const p = this.ctx.panels().find(([id]) => id === about);
    if (p) return { kind: 'panel', label: `${p[2]} › ${p[1]}` };
    const [r, e] = about.split('.');
    if (e && this.ctx.info.rooms.some((x) => x.id === r)) return { kind: 'entity', label: `${e} in ${r}` };
    return { kind: 'other', label: '' };
  }

  private renderFilters() {
    const { info } = this.ctx;
    const entries = this.ctx.store.entries;
    const authors = [...new Set(entries.map((n) => n.author))].sort();
    const abouts = [...new Set(entries.map((n) => n.about))];
    const panels = this.ctx.panels();
    const aboutSel = h(
      'select',
      { 'aria-label': 'About filter' },
      h('option', { value: '', selected: !this.aboutFilter }, 'About: everything'),
      h(
        'optgroup',
        { label: 'Rooms (and their entities)' },
        info.rooms.map((r) => h('option', { value: r.id, selected: this.aboutFilter === r.id }, `${r.name} (${r.id})`)),
      ),
      panels.length
        ? h(
            'optgroup',
            { label: 'Storyboard panels' },
            panels.map(([id, t]) => h('option', { value: id, selected: this.aboutFilter === id }, `${id} · ${t}`)),
          )
        : null,
      h(
        'optgroup',
        { label: 'Other' },
        abouts
          .filter((a) => !info.rooms.some((r) => r.id === a) && !panels.some(([id]) => id === a))
          .map((a) => h('option', { value: a, selected: this.aboutFilter === a }, a || 'General (no about)')),
      ),
    );
    if (this.aboutFilter && !aboutSel.querySelector('option:checked')?.getAttribute('value'))
      aboutSel.append(h('option', { value: this.aboutFilter, selected: true }, this.aboutFilter));
    aboutSel.addEventListener('change', () => {
      this.aboutFilter = aboutSel.value;
      this.renderList();
    });
    const search = h('input', {
      type: 'search',
      placeholder: 'Search text, author, about…',
      value: this.q,
      'aria-label': 'Search notes',
    });
    search.addEventListener('input', () => {
      this.q = search.value.trim().toLowerCase();
      this.renderList();
    });
    const authorSel = select(
      [['', 'All authors'], ...authors.map((a) => [a, a] as [string, string])],
      this.authorFilter,
      (v) => {
        this.authorFilter = v;
        this.renderList();
      },
      { 'aria-label': 'Author filter' },
    );
    this.filterBar.replaceChildren(
      search,
      aboutSel,
      authorSel,
      this.countEl,
      h('button', { onclick: () => void this.ctx.store.load(), title: 'Read notes.json again' }, 'Reload'),
    );
    this.datalist.replaceChildren(
      ...[...new Set([...info.rooms.map((r) => r.id), ...panels.map(([id]) => id), ...abouts.filter(Boolean)])].map(
        (v) => h('option', { value: v }),
      ),
    );
  }

  private render() {
    const a = document.activeElement;
    if (!(a instanceof HTMLInputElement && this.filterBar.contains(a))) this.renderFilters();
    this.renderList();
  }

  private renderList() {
    const all = this.ctx.store.entries;
    const f = this.aboutFilter;
    const shown = all.filter(
      (n) =>
        (!f || n.about === f || (this.ctx.info.rooms.some((r) => r.id === f) && n.about.startsWith(`${f}.`))) &&
        (!this.authorFilter || n.author === this.authorFilter) &&
        (!this.q || `${n.text}\n${n.author}\n${n.about}`.toLowerCase().includes(this.q)),
    );
    this.countEl.textContent =
      shown.length === all.length ? `${all.length} note(s)` : `${shown.length} of ${all.length}`;
    if (!shown.length) {
      this.listEl.replaceChildren(
        h(
          'p',
          { class: 'muted pad' },
          all.length
            ? 'No note matches.'
            : 'No notes yet. Write the first one: what to change, what works, a question for the AI.',
        ),
      );
      return;
    }
    const groups = new Map<string, Note[]>();
    for (const n of [...shown].sort(newestFirst)) {
      const g = groups.get(n.about) ?? [];
      g.push(n);
      groups.set(n.about, g);
    }
    this.listEl.replaceChildren(
      ...[...groups].map(([about, notes]) => {
        const k = this.kindOf(about);
        const canOpen = k.kind === 'room' || k.kind === 'panel' || k.kind === 'entity';
        return h(
          'div',
          { class: 'panel ngroup' },
          h(
            'header',
            null,
            h('span', { class: `tag t-${k.kind}` }, k.kind),
            about ? h('code', null, about) : null,
            k.label ? h('span', { class: 'muted' }, k.label) : null,
            h('span', { class: 'muted small' }, `${notes.length}`),
            canOpen
              ? h(
                  'button',
                  { class: 'link', onclick: () => this.ctx.open(about) },
                  k.kind === 'panel' ? 'Open in Storyboard ›' : 'Open in Rooms ›',
                )
              : null,
          ),
          h(
            'ul',
            { class: 'notes' },
            notes.map((n) =>
              noteItem(n, this.ctx.store, {
                onReply: (ab) => {
                  this.aboutInput.value = ab;
                  this.comp.text.focus();
                  this.comp.text.scrollIntoView({ block: 'nearest' });
                },
              }),
            ),
          ),
        );
      }),
    );
  }
}
