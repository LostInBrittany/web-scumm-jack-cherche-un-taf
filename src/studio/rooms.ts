// Rooms tab: the room rendered by the real engine (the placement editor in an iframe) and, beside it, the room's
// props / actors / hotspots with the selected one's sheet: name, states, visibility, look lines, reactions, talk
// topics. Every text is edited in place in rooms/<id>.ts through PUT room/:id/text.
// 4.1.8 (programme §4.7: the Studio's biggest owners split into model / IO / view): this file keeps the state, the
// layout, the list and the orchestration; the readable texts are in rooms-text.ts (model), the bridge with the view
// in rooms-bridge.ts (IO), the lines and the sheets in rooms-lines.ts and rooms-sheet.ts (view).
import type { Id, Layout, RoomDef, Rule } from '@engine/core/types';
import { must } from '../engine/core/must';
import { api, type EntityKind, type GameInfo, imgUrl, type RoomData, type TextRef } from './api';
import { type FormCtx, objectEditor } from './forms';
import { gameElsewhere } from './game-origin';
import { type BridgeHost, EditorBridge, focusPath } from './rooms-bridge';
import { entitySheet, roomSheet, type SheetHost } from './rooms-sheet';
import { entityDef, entityName, isInteractive, KIND_LABEL, type Sel } from './rooms-text';
import { StageEditor } from './rooms-stage';
import { RULE_FIELDS, STAGE_FIELDS } from './schema';
import { structuredEdit } from './structured';
import { h, modal, select, toast } from './ui';

export { condText } from './rooms-text';

export interface RoomsCtx {
  info: GameInfo;
  /** Called after every successful write (runs Check in the background). */
  saved(): void;
  /** Marks a write as ours, so the file watcher's echo is not announced as an outside change. */
  ownWrite(): void;
  /** Optional: the "Notes (n)" block of a room, appended at the bottom of the room section (src/studio/notes.ts). */
  notesBlock?(room: Id): HTMLElement;
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export class RoomsTab {
  readonly el = h('section', { class: 'tab rooms' });
  private roomId: Id;
  private checkpoint = '';
  private data: RoomData | null = null;
  private byPath = new Map<string, TextRef>();
  private sel: Sel = null;
  private search = '';
  private readonly bridge: EditorBridge;
  private readonly host: SheetHost;
  private listEl = h('div', { class: 'entities' });
  private sheetEl = h('div', { class: 'sheet' });
  private roomSheetEl = h('div', { class: 'roomsheet' });
  private pendingRender = false;
  /** The room's layers, masks, zones and links, drawn on its backdrop (4.1.11, rooms-stage.ts). */
  private readonly stageEditor: StageEditor;

  constructor(
    private ctx: RoomsCtx,
    initialRoom?: string,
  ) {
    const rooms = ctx.info.rooms;
    this.roomId = rooms.some((r) => r.id === initialRoom) ? must(initialRoom, 'initial room') : (rooms[0]?.id ?? '');
    this.bridge = new EditorBridge(this.bridgeHost());
    this.host = this.sheetHost();
    this.stageEditor = new StageEditor({
      room: () => this.roomId,
      data: () => this.data,
      flushEditor: () => this.bridge.flush(),
      written: () => this.afterWrite(),
    });
    this.build();
  }

  get room() {
    return this.roomId;
  }
  /** The selected entity, if any (the Assistant's context). */
  get selection(): Sel {
    return this.sel;
  }

  // -------------------------------------------------------------- the hosts of the bridge and the sheets

  private bridgeHost(): BridgeHost {
    return {
      room: () => this.roomId,
      checkpoint: () => this.checkpoint,
      selection: () => this.sel,
      select: (s) => {
        this.sel = s;
        this.renderList();
        this.renderSheet();
      },
      layoutStored: (room: Id, layout: Layout) => {
        if (this.data && room === this.roomId) this.data.layout = layout;
      },
      ownWrite: () => this.ctx.ownWrite(),
      saved: () => this.ctx.saved(),
    };
  }

  private sheetHost(): SheetHost {
    const tab = this; // the getters below read the tab's current room and data (an arrow function cannot be a getter)
    return {
      info: this.ctx.info,
      get room() {
        return tab.roomId;
      },
      get data() {
        return tab.data;
      },
      textAt: (path) => this.byPath.get(path),
      flushEditor: () => this.bridge.flush(),
      ownWrite: () => this.ctx.ownWrite(),
      saved: () => this.ctx.saved(),
      reload: () => this.load(),
      renderIfPending: () => {
        if (this.pendingRender) this.render();
      },
      writeValue: (path, value) => void this.writeValue(path, value),
      editRule: (i, blank) => this.editRule(i, blank),
      editStage: () => this.editStage(),
    };
  }

  // -------------------------------------------------------------- layout

  private build() {
    const info = this.ctx.info;
    const cps = Object.entries(info.checkpoints);
    const bar = h(
      'div',
      { class: 'bar' },
      h(
        'label',
        null,
        'Room ',
        select(
          info.rooms.map((r) => [r.id, `${r.name} (${r.id})`]),
          this.roomId,
          (v) => this.openRoom(v),
          { 'aria-label': 'Room' },
        ),
      ),
      h(
        'label',
        null,
        'State ',
        select(
          [['', 'auto'], ...cps.map(([k, c]) => [k, `${k} (${c.room})`] as [string, string])],
          this.checkpoint,
          (v) => {
            this.checkpoint = v;
            this.reloadFrame();
          },
          { 'aria-label': 'Checkpoint' },
        ),
      ),
      h(
        'button',
        {
          onclick: () => this.bridge.save(),
          title: 'Save the layout edited in the view',
        },
        'Save layout',
      ),
      h(
        'button',
        { onclick: () => this.reloadFrame(), title: 'Reload the view (drops unsaved placement)' },
        'Reload view',
      ),
      this.bridge.status,
    );
    const search = h('input', {
      type: 'search',
      placeholder: 'Search props, actors, hotspots…',
      value: this.search,
      'aria-label': 'Search',
    });
    search.addEventListener('input', () => {
      this.search = search.value.trim().toLowerCase();
      this.renderList();
    });
    this.el.replaceChildren(
      h(
        'div',
        { class: 'stage' },
        bar,
        h('div', { class: 'frame' }, this.bridge.frame),
        this.roomSheetEl,
        this.stageEditor.el,
      ),
      h(
        'aside',
        { class: 'side' },
        h(
          'div',
          { class: 'listhead' },
          search,
          h('button', { class: 'primary', onclick: () => this.addDialog() }, '+ Add'),
        ),
        this.listEl,
        this.sheetEl,
      ),
    );
    void this.load();
  }

  reloadFrame() {
    this.bridge.reload();
  }

  /** A newer preview of the game is ready (hosted Studio): the view loads it unless a placement is not saved. */
  previewReady() {
    this.bridge.reloadIfClean();
  }

  /** Scrolls to and flashes the editor of a content path (`on[3]`, `talk.lou[1].do[0]`…), once the room is shown. */
  focusPath(path: string, tries = 20) {
    focusPath(this.el, path, tries);
  }

  openRoom(id: Id) {
    if (id === this.roomId) return;
    this.roomId = id;
    this.sel = null;
    const pick = this.el.querySelector<HTMLSelectElement>('select[aria-label="Room"]');
    if (pick) pick.value = id; // when opened from elsewhere (Storyboard, Notes)
    history.replaceState(null, '', `#rooms/${id}`);
    this.reloadFrame();
    void this.load();
  }

  async load() {
    try {
      this.data = await api.room(this.roomId);
      this.byPath = new Map(this.data.texts.map((t) => [t.path, t]));
      if (this.sel && !entityDef(this.data.def, this.sel)) this.sel = null;
      this.stageEditor.load();
      this.render();
    } catch (e) {
      this.sheetEl.replaceChildren(h('p', { class: 'error' }, (e as Error).message));
    }
  }

  /** Re-render now, or after the text being typed is saved. */
  private render() {
    const a = document.activeElement;
    if (a instanceof HTMLTextAreaElement && this.el.contains(a) && a.value !== a.defaultValue) {
      this.pendingRender = true;
      return;
    }
    this.pendingRender = false;
    this.renderList();
    this.renderSheet();
    this.renderRoomSheet();
  }

  /** Called on a file change on disk (SSE). */
  onFileChanged(file: string) {
    if (!this.data) return;
    if (file === `layout/${this.roomId}.json`) {
      // Vite reloads the view by itself when the layout module changes; make sure it does. A hosted Studio's view
      // loads the revision's preview once it is built (previewReady).
      const since = Date.now();
      if (!gameElsewhere())
        setTimeout(() => {
          if (this.bridge.lastReady < since) this.reloadFrame();
        }, 1200);
      void this.load();
    } else if (file.endsWith('.ts') || file === 'assets.gen.json') {
      void this.load();
    }
  }

  // -------------------------------------------------------------- list

  private renderList() {
    if (!this.data) return;
    const d = this.data.def;
    const chars = this.ctx.info.characters;
    const groups: [EntityKind, Id[]][] = [
      ['prop', Object.keys(d.props ?? {})],
      ['actor', Object.keys(d.actors ?? {})],
      ['hotspot', Object.keys(d.hotspots ?? {})],
    ];
    const q = this.search;
    this.listEl.replaceChildren(
      ...groups.map(([kind, ids]) => {
        const shown = ids.filter(
          (id) => !q || id.toLowerCase().includes(q) || entityName(d, chars, kind, id).toLowerCase().includes(q),
        );
        return h(
          'div',
          { class: 'group' },
          h(
            'h3',
            null,
            `${KIND_LABEL[kind]}s `,
            h(
              'span',
              { class: 'muted' },
              shown.length === ids.length ? String(ids.length) : `${shown.length}/${ids.length}`,
            ),
          ),
          h(
            'ul',
            null,
            shown.map((id) => {
              const name = entityName(d, chars, kind, id);
              const interactive = isInteractive(d, kind, id);
              const noLook = interactive && !d.look?.[id];
              const on = this.sel?.kind === kind && this.sel.id === id;
              return h(
                'li',
                null,
                h(
                  'button',
                  {
                    class: `ent${on ? ' on' : ''}`,
                    'aria-pressed': on ? 'true' : 'false',
                    onclick: () => this.selectEntity({ kind, id }),
                  },
                  h('span', { class: `kind k-${kind}` }, kind.charAt(0).toUpperCase()),
                  h('span', { class: 'id' }, id),
                  name && name !== id ? h('span', { class: 'name' }, name) : null,
                  noLook ? h('span', { class: 'warn', title: 'No look line' }, 'no look') : null,
                  !interactive ? h('span', { class: 'muted small' }, 'decor') : null,
                ),
              );
            }),
          ),
        );
      }),
    );
    this.listEl.querySelector('.ent.on')?.scrollIntoView({ block: 'nearest' });
  }

  selectEntity(s: NonNullable<Sel>) {
    this.sel = s;
    this.renderList();
    this.renderSheet();
    this.bridge.post({ source: 'web-scumm-studio', type: 'select', kind: s.kind, id: s.id });
  }

  // -------------------------------------------------------------- the sheets

  private renderSheet() {
    this.sheetEl.replaceChildren(...entitySheet(this.host, this.sel));
  }

  private renderRoomSheet() {
    const parts = roomSheet(this.host);
    if (!parts) return;
    this.roomSheetEl.replaceChildren(...parts);
    const notes = this.ctx.notesBlock?.(this.roomId);
    if (notes) this.roomSheetEl.append(notes);
  }

  // -------------------------------------------------------------- structured edits (3.4)

  private formCtx(): FormCtx {
    return { info: this.ctx.info, room: this.data?.def };
  }

  /** A reaction as a form (`on[i]`); a new one when `blank` is given. */
  private editRule(i: number, blank?: Rule) {
    const d = this.data?.def;
    if (!d) return;
    const rule = blank ?? d.on?.[i];
    if (!rule) return;
    structuredEdit({
      title: blank ? 'New reaction' : `Reaction on[${i}]`,
      room: this.roomId,
      path: `on[${i}]`,
      editor: objectEditor(RULE_FIELDS, rule as unknown as Record<string, unknown>, this.formCtx()),
      remove: !blank,
      after: () => this.afterWrite(),
    });
  }

  private editStage() {
    const d = this.data?.def;
    if (!d) return;
    structuredEdit({
      title: `Stage of ${d.name}`,
      room: this.roomId,
      path: 'stage',
      editor: objectEditor(STAGE_FIELDS, (d.stage ?? {}) as Record<string, unknown>, this.formCtx()),
      remove: !!d.stage,
      after: () => this.afterWrite(),
    });
  }

  /** A value written directly (no form: a select), through the same validated, undoable write. */
  private async writeValue(path: string, value: unknown) {
    if (!api.setValue) {
      toast('Needs the dev server (npm run studio)', 'error');
      return;
    }
    try {
      const r = await api.setValue(this.roomId, path, value);
      toast(r.changed ? `${path} written` : 'Nothing changed', r.changed ? 'ok' : 'info');
      this.afterWrite();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  /** After a structured write: our own write (the watcher will tell too), reload the room and check. */
  afterWrite() {
    this.ctx.ownWrite();
    void this.load();
    this.reloadFrame();
    this.ctx.saved();
  }

  // -------------------------------------------------------------- add a prop / hotspot / actor

  private addDialog() {
    const info = this.ctx.info;
    const d = this.data?.def as RoomDef | undefined;
    let kind: EntityKind = 'prop';
    let img = '';
    const id = h('input', {
      type: 'text',
      required: true,
      pattern: '[A-Za-z_][A-Za-z0-9_]*',
      placeholder: 'e.g. vase',
      'aria-label': 'Id',
    });
    const name = h('input', { type: 'text', placeholder: 'e.g. blue vase', 'aria-label': 'Name' });
    const look = h('input', {
      type: 'text',
      placeholder: 'What the hero says when looking at it',
      'aria-label': 'Look line',
    });
    const chars = Object.entries(info.characters);
    const char = select(
      chars.map(([k, c]) => [k, `${c.name} (${k})`]),
      chars[0]?.[0] ?? '',
      () => undefined,
      { 'aria-label': 'Character' },
    );
    const imgSearch = h('input', { type: 'search', placeholder: 'Filter images…', 'aria-label': 'Filter images' });
    const grid = h('div', { class: 'imggrid' });
    const picked = h('span', { class: 'muted small' }, 'no image');
    const drawGrid = () => {
      const q = imgSearch.value.trim().toLowerCase();
      const ids = Object.keys(info.images)
        .filter((k) => !q || k.toLowerCase().includes(q))
        .slice(0, 240);
      grid.replaceChildren(
        ...ids.map((k) =>
          h(
            'button',
            {
              class: `imgpick${k === img ? ' on' : ''}`,
              title: k,
              type: 'button',
              onclick: () => {
                img = img === k ? '' : k;
                picked.textContent = img || 'no image';
                drawGrid();
              },
            },
            h('img', { src: imgUrl(k), loading: 'lazy', alt: k }),
            h('span', null, k),
          ),
        ),
      );
    };
    imgSearch.addEventListener('input', drawGrid);
    const imgRow = h('div', { class: 'field' }, h('span', null, 'Image ', picked), imgSearch, grid);
    const charRow = h('label', { class: 'field' }, h('span', null, 'Character'), char);
    const nameLabel = h('span', null, 'Name');
    const sync = () => {
      imgRow.hidden = kind !== 'prop';
      charRow.hidden = kind !== 'actor';
      nameLabel.textContent = kind === 'actor' ? 'Name (optional)' : 'Name';
    };
    const kinds = h(
      'div',
      { class: 'seg', role: 'radiogroup', 'aria-label': 'Kind' },
      (['prop', 'hotspot', 'actor'] as EntityKind[]).map((k) => {
        const b = h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': k === kind ? 'true' : 'false',
            class: k === kind ? 'on' : '',
            onclick: () => {
              kind = k;
              kinds.querySelectorAll('button').forEach((x) => {
                x.classList.toggle('on', x === b);
                x.setAttribute('aria-checked', x === b ? 'true' : 'false');
              });
              sync();
            },
          },
          KIND_LABEL[k],
        );
        return b;
      }),
    );
    const err = h('p', { class: 'error' });
    const form = h(
      'form',
      { class: 'addform' },
      kinds,
      h('label', { class: 'field' }, h('span', null, 'Id'), id),
      h('label', { class: 'field' }, nameLabel, name),
      imgRow,
      charRow,
      h('label', { class: 'field' }, h('span', null, 'Look line'), look),
      h(
        'p',
        { class: 'muted small' },
        'It is placed in the middle of the room: drag it into place in the view, then Save layout.',
      ),
      err,
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary' }, 'Add to the room')),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const nid = id.value.trim();
      if (d && [d.props, d.actors, d.hotspots].some((o) => o && nid in o)) {
        err.textContent = `"${nid}" already exists in this room.`;
        return;
      }
      const at: [number, number] = kind === 'hotspot' ? [320, 200] : [320, 320];
      try {
        await this.bridge.flush();
        this.ctx.ownWrite();
        const r = await api.add(this.roomId, {
          kind,
          id: nid,
          name: name.value.trim() || undefined,
          img: kind === 'prop' ? img || undefined : undefined,
          char: kind === 'actor' ? char.value : undefined,
          at,
          look: look.value.trim() || undefined,
        });
        close();
        toast(`Added ${kind} ${nid} · line ${r.line}`);
        this.ctx.saved();
        this.sel = { kind, id: nid };
        this.bridge.selectWhenReady(this.sel);
        await this.load();
        this.bridge.post({ source: 'web-scumm-studio', type: 'select', kind, id: nid });
        // The view reloads by itself (the room module changed); force it if it doesn't. Hosted: once the revision's
        // preview is built (previewReady).
        const since = Date.now();
        if (!gameElsewhere())
          setTimeout(() => {
            if (this.bridge.lastReady < since) this.reloadFrame();
          }, 1500);
      } catch (x) {
        err.textContent = (x as Error).message;
      }
    });
    sync();
    drawGrid();
    const close = modal('Add to the room', form);
    id.focus();
  }
}
