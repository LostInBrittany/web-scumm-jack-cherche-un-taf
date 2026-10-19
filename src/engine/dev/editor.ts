import { Pane } from 'tweakpane';
import type { App } from '../dom/app';
import type { Id, Layout, Point } from '../core/types';
import { FLOOR } from '../core/define';
import { Overlay, type Handle } from './overlay';
import { putLayout, studioOrigin } from './save-layout';
import { must } from '../core/must';

type Drag = { h: Handle; start: Point; orig: unknown };

const clampPt = (p: Point): Point => [Math.max(0, Math.min(640, p[0])), Math.max(0, Math.min(400, p[1]))];

/** Rounds coordinates to the unit (scale factors keep two decimals). */
function roundLayout(L: Layout): Layout {
  const r = (v: unknown): unknown => {
    if (typeof v === 'number') return Math.round(v);
    if (Array.isArray(v)) return v.map(r);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r(x)]));
    return v;
  };
  const out = r({ ...L, scale: undefined }) as Layout;
  if (L.scale) out.scale = L.scale.map(([y, s]) => [Math.round(y), Math.round(s * 100) / 100]) as Layout['scale'];
  else delete out.scale;
  return out;
}

/**
 * Placement editor (?edit=<room>): drag clickable zones, props, characters, approach and entry points,
 * the walkable zone and the scale with the mouse, then save the JSON layout (dev server only).
 */
export interface EditorOptions {
  /** Where a layout goes when there is no dev server (a Studio demo build): e.g. the demo's edits in this browser. */
  saveOffline?: (room: Id, layout: Layout) => void | Promise<void>;
}

export class Editor {
  readonly overlay: Overlay;
  private drag: Drag | null = null;
  private pane!: Pane;
  private selected = { item: '(none)', values: '' };
  private rebuilding = false;
  private rebuildAgain = false;
  private dirty = false;
  private status = { state: 'up to date' };

  constructor(
    private app: App,
    private opts: EditorOptions = {},
  ) {
    this.overlay = new Overlay(app, { edit: true, all: true });
    const svg = this.overlay.svg;
    svg.addEventListener('pointerdown', (e) => this.down(e));
    svg.addEventListener('pointermove', (e) => {
      e.stopPropagation();
      this.move(e);
    });
    svg.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      this.up();
    });
    svg.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.dbl(e);
    });
    svg.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) e.preventDefault();
    });
    this.buildPane();
    this.overlay.draw();
    this.bridge();
  }

  // -------------------------------------------------------------- Studio bridge
  // Inside the Studio (an iframe of /__studio/), the editor tells the parent page what is selected, whether the
  // layout has unsaved changes and when it was saved; the Studio can ask it to select, place or save something.
  // Hosted (4.2.1), the Studio is another origin (save-layout.ts): messages go there only, and the Studio writes.
  private studioOrigin = studioOrigin();
  private hosted = this.studioOrigin !== location.origin && window.parent !== window;

  private post(msg: Record<string, unknown>) {
    if (window.parent === window) return;
    window.parent.postMessage({ source: 'web-scumm-editor', room: this.room.id, ...msg }, this.studioOrigin);
  }

  private bridge() {
    if (window.parent === window) return;
    window.addEventListener('message', (e: MessageEvent) => {
      const m = e.data as {
        source?: string;
        type?: string;
        kind?: 'prop' | 'hotspot' | 'actor';
        id?: string;
        at?: Point;
        nonce?: string;
      };
      if (e.origin !== this.studioOrigin || m?.source !== 'web-scumm-studio') return;
      if (m.type === 'save') void this.save(typeof m.nonce === 'string' ? m.nonce : undefined);
      else if ((m.type === 'select' || m.type === 'create') && m.kind && m.id) {
        if (m.type === 'create' && this.missing().some((x) => x.kind === m.kind && x.id === m.id))
          this.addMissing({ kind: m.kind, id: m.id }, m.at);
        const key = `${m.kind === 'hotspot' ? 'hs' : m.kind}:${m.id}`;
        this.overlay.o.selected = key;
        this.selected.item = key;
        this.overlay.draw();
        this.pane?.refresh();
      }
    });
    this.post({ type: 'ready', missing: this.missing() });
  }

  private get L(): Layout {
    return this.overlay.layout();
  }
  private get room() {
    return this.app.view.room;
  }

  // -------------------------------------------------------------- mouse

  private handleOf(
    e: Event,
  ):
    | Handle
    | { t: 'bg' }
    | { t: 'edge'; hole: number; i: number }
    | { t: 'zedge'; zone: Id; hole: number; i: number }
    | null {
    const t = (e.target as Element).closest?.('[data-h]');
    return t ? JSON.parse(t.getAttribute('data-h')!) : null;
  }

  private down(e: PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const h = this.handleOf(e);
    if (!h || h.t === 'bg' || h.t === 'edge' || h.t === 'zedge') return;
    const p = this.overlay.toLogical(e);
    // alt-click: remove a vertex (walkable zone, walk zone, occluder or hotspot polygon)
    if (e.altKey && (h.t === 'walk' || h.t === 'hs-vert' || h.t === 'zone' || h.t === 'occ')) {
      this.removeVertex(h);
      return;
    }
    this.drag = { h, start: p, orig: structuredClone(this.snapshot(h)) };
    this.select(h);
    this.overlay.svg.setPointerCapture(e.pointerId);
  }

  private move(e: PointerEvent) {
    if (!this.drag) return;
    const p = clampPt(this.overlay.toLogical(e));
    const d: Point = [p[0] - this.drag.start[0], p[1] - this.drag.start[1]];
    this.apply(this.drag.h, p, d, this.drag.orig);
    this.changed(this.drag.h);
  }

  private up() {
    if (!this.drag) return;
    const h = this.drag.h;
    this.drag = null;
    this.changed(h, true);
  }

  private dbl(e: MouseEvent) {
    const h = this.handleOf(e);
    if (h?.t === 'zedge') {
      const z = must(this.L.walkZones![h.zone], 'zone of a handle');
      const ring = must(h.hole < 0 ? z.area : z.holes![h.hole], 'zone ring of a handle');
      ring.splice(h.i + 1, 0, clampPt(this.overlay.toLogical(e)));
      this.changed({ t: 'zone', zone: h.zone, hole: h.hole, i: h.i + 1 }, true);
      return;
    }
    if (!h || h.t !== 'edge') return;
    const ring = must(h.hole < 0 ? this.L.walk!.area : this.L.walk!.holes![h.hole], 'walk ring of a handle');
    ring.splice(h.i + 1, 0, clampPt(this.overlay.toLogical(e)));
    this.changed({ t: 'walk', hole: h.hole, i: h.i + 1 }, true);
  }

  private wheel(e: WheelEvent) {
    const h = this.handleOf(e);
    if (!h || (h.t !== 'prop-pos' && h.t !== 'prop-h' && h.t !== 'actor-pos' && h.t !== 'actor-h')) return;
    e.preventDefault();
    e.stopPropagation();
    const k = e.deltaY < 0 ? 1.04 : 1 / 1.04;
    if (h.t.startsWith('prop')) {
      const t = this.propTarget(h.id, 'h');
      t.h = Math.max(4, (t.h ?? must(this.L.props![h.id], 'prop of a handle').h) * k);
    } else {
      const a = must(this.L.actors![h.id], 'actor of a handle');
      a.h = Math.max(8, (a.h ?? this.charHeight(h.id)) * k);
    }
    this.changed(h, true);
  }

  private removeVertex(h: Handle) {
    if (h.t === 'walk') {
      const ring = must(h.hole < 0 ? this.L.walk!.area : this.L.walk!.holes![h.hole], 'walk ring of a handle');
      if (ring.length > 3) ring.splice(h.i, 1);
      else if (h.hole >= 0) this.L.walk!.holes!.splice(h.hole, 1);
    } else if (h.t === 'hs-vert') {
      const poly = must(this.L.hotspots![h.id], 'hotspot of a handle').poly!;
      if (poly.length > 3) poly.splice(h.i, 1);
    } else if (h.t === 'zone') {
      const z = must(this.L.walkZones![h.zone], 'zone of a handle');
      const ring = must(h.hole < 0 ? z.area : z.holes![h.hole], 'zone ring of a handle');
      if (ring.length > 3) ring.splice(h.i, 1);
      else if (h.hole >= 0) z.holes!.splice(h.hole, 1);
    } else if (h.t === 'occ') {
      const poly = must(this.L.occluders![h.id], 'occluder of a handle').polygon!;
      if (poly.length > 3) poly.splice(h.i, 1);
    }
    this.changed(h, true);
  }

  // -------------------------------------------------------------- model

  private charHeight(id: Id) {
    const a = this.room.actors?.[id];
    return (a && this.app.engine.game.characters[a.char]?.height) ?? this.app.engine.game.skin?.heights?.actor ?? 110;
  }

  /** Object to modify for a prop: the current state's variant if it exists. */
  private propTarget(id: Id, field: 'pos' | 'h' | 'approach'): { x: number; y: number; h?: number; approach?: Point } {
    const p = must(this.L.props![id], 'prop of a handle');
    const st = this.app.engine.propState(id, this.room);
    const ov = st ? p.states?.[st] : undefined;
    if (!ov) return p;
    if (field === 'h' && ov.h === undefined) return p;
    if (field === 'approach' && !ov.approach && p.approach) return p;
    return ov;
  }

  private snapshot(h: Handle): unknown {
    const L = this.L;
    switch (h.t) {
      case 'hs-move':
      case 'hs-corner':
      case 'hs-vert':
        return L.hotspots![h.id];
      case 'approach':
        return h.kind === 'hs'
          ? must(L.hotspots![h.id], 'hotspot of a handle').approach
          : h.kind === 'actor'
            ? must(L.actors![h.id], 'actor of a handle').approach
            : this.propTarget(h.id, 'approach').approach;
      case 'prop-pos':
      case 'prop-h':
        return this.propTarget(h.id, h.t === 'prop-h' ? 'h' : 'pos');
      case 'actor-pos':
      case 'actor-h':
        return L.actors![h.id];
      case 'entry':
        return L.entries![h.name];
      case 'walk':
        return h.hole < 0 ? L.walk!.area[h.i] : must(L.walk!.holes![h.hole], 'walk hole of a handle')[h.i];
      case 'scale':
        return L.scale![h.k];
      case 'zone': {
        const z = must(L.walkZones![h.zone], 'zone of a handle');
        return must(h.hole < 0 ? z.area : z.holes![h.hole], 'zone ring of a handle')[h.i];
      }
      case 'link':
        return must(L.walkLinks![h.id], 'link of a handle')[h.end].at;
      case 'layer':
        return ((L.layers ??= {})[h.id] ??= {});
      case 'occ':
        return must(L.occluders![h.id], 'occluder of a handle').polygon![h.i];
      case 'light':
        return L.lights![h.id];
      case 'emit':
        return must(L.emitters![h.id], 'emitter of a handle').area;
    }
  }

  private apply(h: Handle, p: Point, d: Point, orig: unknown) {
    const L = this.L;
    const eng = this.app.engine;
    switch (h.t) {
      case 'hs-move': {
        const o = orig as NonNullable<Layout['hotspots']>[string];
        const hs = must(L.hotspots![h.id], 'hotspot of a handle');
        if (o.rect) hs.rect = [o.rect[0] + d[0], o.rect[1] + d[1], o.rect[2], o.rect[3]];
        if (o.approach) hs.approach = [o.approach[0] + d[0], o.approach[1] + d[1]];
        break;
      }
      case 'hs-corner': {
        const [x, y, w, hh] = (orig as { rect: [number, number, number, number] }).rect;
        let x0 = x,
          y0 = y,
          x1 = x + w,
          y1 = y + hh;
        if (h.c === 0 || h.c === 3) x0 = p[0];
        else x1 = p[0];
        if (h.c === 0 || h.c === 1) y0 = p[1];
        else y1 = p[1];
        must(L.hotspots![h.id], 'hotspot of a handle').rect = [
          Math.min(x0, x1),
          Math.min(y0, y1),
          Math.max(4, Math.abs(x1 - x0)),
          Math.max(4, Math.abs(y1 - y0)),
        ];
        break;
      }
      case 'hs-vert':
        must(L.hotspots![h.id], 'hotspot of a handle').poly![h.i] = p;
        break;
      case 'approach': {
        if (h.kind === 'hs') must(L.hotspots![h.id], 'hotspot of a handle').approach = p;
        else if (h.kind === 'actor') must(L.actors![h.id], 'actor of a handle').approach = p;
        else this.propTarget(h.id, 'approach').approach = p;
        break;
      }
      case 'prop-pos': {
        const t = this.propTarget(h.id, 'pos');
        const o = orig as { x: number; y: number; approach?: Point };
        t.x = o.x + d[0];
        t.y = o.y + d[1];
        if (o.approach) t.approach = [o.approach[0] + d[0], o.approach[1] + d[1]];
        break;
      }
      case 'prop-h': {
        const t = this.propTarget(h.id, 'h');
        const base = this.propTarget(h.id, 'pos');
        t.h = Math.max(4, base.y - p[1]);
        break;
      }
      case 'actor-pos': {
        const a = must(L.actors![h.id], 'actor of a handle');
        const o = orig as { x: number; y: number; approach?: Point };
        a.x = o.x + d[0];
        a.y = o.y + d[1];
        if (o.approach) a.approach = [o.approach[0] + d[0], o.approach[1] + d[1]];
        // a remembered scripted move would hide the edited position
        delete eng.state.actors[`${this.room.id}.${h.id}`]?.x;
        delete eng.state.actors[`${this.room.id}.${h.id}`]?.y;
        break;
      }
      case 'actor-h': {
        const a = must(L.actors![h.id], 'actor of a handle');
        a.h = Math.max(8, a.y - p[1]);
        break;
      }
      case 'entry':
        L.entries![h.name] = p;
        break;
      case 'walk':
        must(h.hole < 0 ? L.walk!.area : L.walk!.holes![h.hole], 'walk ring of a handle')[h.i] = p;
        break;
      case 'scale':
        L.scale![h.k] = [p[1], must(L.scale![h.k], 'scale point of a handle')[1]];
        break;
      case 'zone': {
        const z = must(L.walkZones![h.zone], 'zone of a handle');
        must(h.hole < 0 ? z.area : z.holes![h.hole], 'zone ring of a handle')[h.i] = p;
        break;
      }
      case 'link':
        must(L.walkLinks![h.id], 'link of a handle')[h.end].at = p;
        break;
      case 'layer': {
        const o = orig as { x?: number; y?: number };
        const g = ((L.layers ??= {})[h.id] ??= {});
        g.x = (o.x ?? 0) + d[0];
        g.y = (o.y ?? 0) + d[1];
        break;
      }
      case 'occ':
        must(L.occluders![h.id], 'occluder of a handle').polygon![h.i] = p;
        break;
      case 'light': {
        const g = must(L.lights![h.id], 'light of a handle');
        if (h.part === 'at') g.at = p;
        else g.radius = Math.max(8, Math.hypot(p[0] - g.at[0], p[1] - g.at[1]));
        break;
      }
      case 'emit': {
        const [x, y, w, hh] = orig as [number, number, number, number];
        if (h.c < 0) {
          must(L.emitters![h.id], 'emitter of a handle').area = [x + d[0], y + d[1], w, hh];
          break;
        }
        let x0 = x,
          y0 = y,
          x1 = x + w,
          y1 = y + hh;
        if (h.c === 0 || h.c === 3) x0 = p[0];
        else x1 = p[0];
        if (h.c === 0 || h.c === 1) y0 = p[1];
        else y1 = p[1];
        must(L.emitters![h.id], 'emitter of a handle').area = [
          Math.min(x0, x1),
          Math.min(y0, y1),
          Math.max(4, Math.abs(x1 - x0)),
          Math.max(4, Math.abs(y1 - y0)),
        ];
        break;
      }
    }
  }

  private select(h: Handle) {
    const key =
      'id' in h
        ? `${h.t.startsWith('hs') || (h.t === 'approach' && h.kind === 'hs') ? 'hs' : h.t.startsWith('prop') || (h.t === 'approach' && h.kind === 'prop') ? 'prop' : 'actor'}:${h.id}`
        : h.t === 'entry'
          ? `entry:${h.name}`
          : h.t;
    this.overlay.o.selected = key;
    this.selected.item = key;
    const [k, id] = key.split(':');
    const kind = k === 'hs' ? 'hotspot' : k === 'prop' || k === 'actor' ? k : undefined;
    this.post({ type: 'select', key, kind, id: kind ? id : undefined });
  }

  /** After an edit: redraw, and rebuild the scene for whatever is shown. */
  private changed(h: Handle, final = false) {
    if (!this.dirty) this.post({ type: 'dirty', dirty: true });
    this.dirty = true;
    this.status.state = 'modified, not saved';
    const v = this.snapshot(h);
    this.selected.values = JSON.stringify(v && typeof v === 'object' ? roundLayout(v as Layout) : v);
    const visual =
      h.t.startsWith('prop') ||
      h.t.startsWith('actor') ||
      h.t === 'scale' ||
      h.t === 'layer' ||
      h.t === 'occ' ||
      h.t === 'light';
    if (visual || final) this.rebuild();
    else this.overlay.draw();
    this.pane?.refresh();
  }

  /** Rebuilds the room view (preload already cached: fast). */
  rebuild() {
    if (this.rebuilding) {
      this.rebuildAgain = true;
      return;
    }
    this.rebuilding = true;
    void (async () => {
      do {
        this.rebuildAgain = false;
        await this.app.view.build(this.room);
        this.app.view.resize(this.app.view.u);
        this.overlay.draw();
      } while (this.rebuildAgain);
      this.rebuilding = false;
    })();
  }

  // -------------------------------------------------------------- saving

  /**
   * Writes layout/<room>.json through the Studio's API (`putLayout`). Without one (a Studio demo build, no dev server),
   * the layout goes to the Studio around this view (postMessage; it keeps it with the demo's edits) or, standalone,
   * straight into the demo's edits in localStorage: the engine applies them on the next load.
   */
  async save(nonce?: string) {
    // Hosted: only the Studio's own Save (a request with a nonce) gets the layout; this pane's Save says so.
    if (this.hosted && nonce === undefined) return void (this.status.state = 'save with "Save layout" in the Studio');
    const L = roundLayout(this.L);
    this.app.engine.layouts[this.room.id] = L;
    let error = '';
    let offline = import.meta.env.VITE_STUDIO_DEMO === '1' || this.hosted;
    if (!offline) {
      const r = await putLayout(this.room.id, L);
      if ('offline' in r) offline = true;
      else error = r.error ?? '';
    }
    const done = () => {
      this.dirty = false;
      this.status.state = `saved (${new Date().toLocaleTimeString()})`;
    };
    if (error) {
      this.status.state = `error: ${error}`;
      this.post({ type: 'saved', ok: false, error: this.status.state });
    } else if (!offline) {
      done();
      this.post({ type: 'saved', ok: true });
    } else if (window.parent !== window) {
      done();
      this.post({ type: 'saved', ok: true, layout: L, nonce });
    } else if (this.opts.saveOffline) {
      await this.opts.saveOffline(this.room.id, L);
      done();
      this.status.state += ' in this browser';
    } else this.status.state = 'error: no dev server, the layout is not saved';
    this.pane.refresh();
  }

  // -------------------------------------------------------------- panel

  /** Ids defined in the room but with no geometry in the layout. */
  missing(): { kind: 'hotspot' | 'prop' | 'actor'; id: Id }[] {
    const L = this.L,
      R = this.room;
    return [
      ...Object.keys(R.hotspots ?? {})
        .filter((id) => !L.hotspots?.[id])
        .map((id) => ({ kind: 'hotspot' as const, id })),
      ...Object.keys(R.props ?? {})
        .filter((id) => !L.props?.[id])
        .map((id) => ({ kind: 'prop' as const, id })),
      ...Object.keys(R.actors ?? {})
        .filter((id) => !L.actors?.[id])
        .map((id) => ({ kind: 'actor' as const, id })),
    ];
  }

  private addMissing(m: { kind: 'hotspot' | 'prop' | 'actor'; id: Id }, at?: Point) {
    const L = this.L;
    if (m.kind === 'hotspot')
      (L.hotspots ??= {})[m.id] = { rect: at ? [at[0] - 30, at[1] - 30, 60, 60] : [290, 170, 60, 60] };
    else if (m.kind === 'prop') (L.props ??= {})[m.id] = { x: at?.[0] ?? 320, y: at?.[1] ?? 300, h: 60 };
    else (L.actors ??= {})[m.id] = { x: at?.[0] ?? 320, y: at?.[1] ?? 340 };
    this.changed(
      m.kind === 'hotspot'
        ? { t: 'hs-move', id: m.id }
        : m.kind === 'prop'
          ? { t: 'prop-pos', id: m.id }
          : { t: 'actor-pos', id: m.id },
      true,
    );
    this.buildPane();
  }

  buildPane() {
    this.pane?.dispose();
    const pane = new Pane({ title: `Editor: ${this.room.id}` });
    // Inside the Studio the panel starts folded: the Studio has its own Save button and the room stays visible.
    if (!this.pane && window.parent !== window) pane.expanded = false;
    (pane.element.parentElement as HTMLElement).style.zIndex = '9000';
    this.pane = pane;
    pane.addBinding(this.status, 'state', { readonly: true });
    pane.addButton({ title: 'Save the layout' }).on('click', () => void this.save());
    pane.addButton({ title: 'Reload (undo)' }).on('click', () => location.reload());
    pane.addBinding(this.overlay.o, 'all', { label: 'hidden zones' }).on('change', () => this.overlay.draw());
    // Wide rooms: the logical width, and a camera slider to look around while placing.
    const wide = { width: this.L.width ?? 640, cam: this.app.view.camera.cam };
    const rf = pane.addFolder({ title: 'Room width', expanded: (this.L.width ?? 640) > 640 });
    rf.addBinding(wide, 'width', { min: 640, max: 3200, step: 10 }).on('change', (ev) => {
      if (ev.value <= 640) delete this.L.width;
      else this.L.width = Math.round(ev.value);
      this.app.engine.layouts[this.room.id] = this.L;
      this.changed({ t: 'width', k: 0 } as never);
    });
    rf.addBinding(wide, 'cam', { min: 0, max: Math.max(0, (this.L.width ?? 640) - 640), step: 1 }).on(
      'change',
      (ev) => {
        void this.app.view.camera.setCamera(ev.value, 0);
        this.overlay.draw();
      },
    );

    const sel = pane.addFolder({ title: 'Selection' });
    sel.addBinding(this.selected, 'item', { readonly: true });
    sel.addBinding(this.selected, 'values', { readonly: true, multiline: true, rows: 3 });

    const miss = this.missing();
    if (miss.length) {
      const f = pane.addFolder({ title: `To place (${miss.length})` });
      for (const m of miss) f.addButton({ title: `+ ${m.kind} ${m.id}` }).on('click', () => this.addMissing(m));
    }

    const w = pane.addFolder({ title: 'Walkable zone', expanded: false });
    if (!this.L.walk)
      w.addButton({ title: 'Create the zone' }).on('click', () => {
        const fl = this.L.floor ?? FLOOR;
        this.L.walk = {
          area: [
            [40, 220],
            [600, 220],
            [630, fl],
            [10, fl],
          ],
          holes: [],
        };
        this.changed({ t: 'walk', hole: -1, i: 0 }, true);
        this.buildPane();
      });
    else
      w.addButton({ title: 'Add a hole (furniture)' }).on('click', () => {
        (this.L.walk!.holes ??= []).push([
          [290, 290],
          [350, 290],
          [350, 330],
          [290, 330],
        ]);
        this.changed({ t: 'walk', hole: 0, i: 0 }, true);
      });

    this.stageFolders(pane);

    const s = pane.addFolder({ title: 'Depth scale', expanded: false });
    if (!this.L.scale)
      s.addButton({ title: 'Add the scale' }).on('click', () => {
        this.L.scale = [
          [214, 0.86],
          [396, 1],
        ];
        this.changed({ t: 'scale', k: 0 }, true);
        this.buildPane();
      });
    else {
      const proxy = { back: this.L.scale[0][1], front: this.L.scale[1][1] };
      s.addBinding(proxy, 'back', { min: 0.2, max: 1.5, step: 0.01 }).on('change', (ev) => {
        this.L.scale![0][1] = ev.value;
        this.changed({ t: 'scale', k: 0 });
      });
      s.addBinding(proxy, 'front', { min: 0.2, max: 1.5, step: 0.01 }).on('change', (ev) => {
        this.L.scale![1][1] = ev.value;
        this.changed({ t: 'scale', k: 1 });
      });
    }

    const en = pane.addFolder({ title: 'Entry points', expanded: false });
    const nu = { name: '' };
    en.addBinding(nu, 'name');
    en.addButton({ title: 'Add the entry point' }).on('click', () => {
      if (!nu.name) return;
      (this.L.entries ??= {})[nu.name] = [320, 360];
      this.changed({ t: 'entry', name: nu.name }, true);
    });

    const help = {
      text: "Drag: move. Corners: resize.\nSquare above a foot: height (or scroll wheel).\nDouble-click a zone edge: add a vertex.\nAlt-click a vertex: remove it.\nStage: layers, occluders, lights, particles,\nwalk zones and links (their logic: the Studio's Stage form).",
    };
    pane.addBinding(help, 'text', { readonly: true, multiline: true, rows: 7 });
  }

  /**
   * The stage's geometry (3.4): walk zones (from the single walk polygon, or new ones), their zoom, links between
   * them; each stage layer's depth, parallax, blend and opacity; occluders drawn as polygons; lights; particle areas.
   * What exists and when (ids, images, conditions) is the room's `stage`, edited in the Studio's Stage form.
   */
  private stageFolders(pane: Pane) {
    const L = this.L,
      R = this.room;
    const fz = pane.addFolder({
      title: `Walk zones${L.walkZones ? ` (${Object.keys(L.walkZones).length})` : ''}`,
      expanded: false,
    });
    if (!L.walkZones)
      fz.addButton({ title: L.walk ? 'Make the walk polygon zone "main"' : 'Add a zone' }).on('click', () => {
        L.walkZones = {
          main: L.walk
            ? { area: L.walk.area, ...(L.walk.holes?.length ? { holes: L.walk.holes } : {}) }
            : {
                area: [
                  [40, 300],
                  [600, 300],
                  [630, 395],
                  [10, 395],
                ],
              },
        };
        delete L.walk;
        this.changed({ t: 'zone', zone: 'main', hole: -1, i: 0 }, true);
        this.buildPane();
      });
    else {
      const nz = { id: '' };
      fz.addBinding(nz, 'id', { label: 'new zone' });
      fz.addButton({ title: 'Add the zone' }).on('click', () => {
        if (!/^[A-Za-z_]\w*$/.test(nz.id) || L.walkZones![nz.id]) return;
        L.walkZones![nz.id] = {
          area: [
            [260, 120],
            [380, 120],
            [380, 170],
            [260, 170],
          ],
        };
        this.changed({ t: 'zone', zone: nz.id, hole: -1, i: 0 }, true);
        this.buildPane();
      });
      for (const [id, z] of Object.entries(L.walkZones)) {
        const f = fz.addFolder({ title: `zone ${id}`, expanded: false });
        const proxy = { zoom: z.zoom ?? 1 };
        f.addBinding(proxy, 'zoom', { min: 1, max: 2, step: 0.05 }).on('change', (ev) => {
          if (ev.value === 1) delete z.zoom;
          else z.zoom = ev.value;
          this.changed({ t: 'zone', zone: id, hole: -1, i: 0 });
        });
        f.addButton({ title: 'Add a hole' }).on('click', () => {
          const top = must(z.area[0], 'first point of a zone')[1];
          (z.holes ??= []).push([
            [300, top + 10],
            [340, top + 10],
            [340, top + 30],
            [300, top + 30],
          ]);
          this.changed({ t: 'zone', zone: id, hole: 0, i: 0 }, true);
        });
        if (Object.keys(L.walkZones).length > 1)
          f.addButton({ title: 'Delete the zone' }).on('click', () => {
            delete L.walkZones![id];
            for (const [k, l] of Object.entries(L.walkLinks ?? {}))
              if (l.from.zone === id || l.to.zone === id) delete L.walkLinks![k];
            this.changed({ t: 'bg' } as never, true);
            this.buildPane();
          });
      }
      const zones = Object.keys(L.walkZones);
      if (zones.length > 1) {
        const nl = { id: '', from: must(zones[0], 'first zone'), to: must(zones[1], 'second zone'), mode: 'stairs' };
        const opts = Object.fromEntries(zones.map((z) => [z, z]));
        fz.addBinding(nl, 'id', { label: 'new link' });
        fz.addBinding(nl, 'from', { options: opts });
        fz.addBinding(nl, 'to', { options: opts });
        fz.addBinding(nl, 'mode', {
          options: { walk: 'walk', stairs: 'stairs', ladder: 'ladder', jump: 'jump', teleport: 'teleport' },
        });
        fz.addButton({ title: 'Add the link' }).on('click', () => {
          if (!/^[A-Za-z_]\w*$/.test(nl.id) || nl.from === nl.to) return;
          const c = (z: string): Point => {
            const a = must(L.walkZones![z], 'zone just listed').area;

            return [
              Math.round(a.reduce((s, p) => s + p[0], 0) / a.length),
              Math.round(a.reduce((s, p) => s + p[1], 0) / a.length),
            ];
          };
          (L.walkLinks ??= {})[nl.id] = {
            from: { zone: nl.from, at: c(nl.from) },
            to: { zone: nl.to, at: c(nl.to) },
            mode: nl.mode as 'stairs',
          };
          this.changed({ t: 'link', id: nl.id, end: 'from' }, true);
          this.buildPane();
        });
      }
      for (const [id, k] of Object.entries(L.walkLinks ?? {})) {
        const f = fz.addFolder({ title: `link ${id} (${k.from.zone} → ${k.to.zone})`, expanded: false });
        const proxy = { mode: k.mode, ms: k.ms ?? 0, oneWay: !!k.oneWay };
        f.addBinding(proxy, 'mode', {
          options: { walk: 'walk', stairs: 'stairs', ladder: 'ladder', jump: 'jump', teleport: 'teleport' },
        }).on('change', (ev) => {
          k.mode = ev.value as 'stairs';
          this.changed({ t: 'link', id, end: 'from' });
        });
        f.addBinding(proxy, 'ms', { min: 0, max: 4000, step: 50 }).on('change', (ev) => {
          if (ev.value) k.ms = ev.value;
          else delete k.ms;
          this.changed({ t: 'link', id, end: 'from' });
        });
        f.addBinding(proxy, 'oneWay').on('change', (ev) => {
          if (ev.value) k.oneWay = true;
          else delete k.oneWay;
          this.changed({ t: 'link', id, end: 'from' });
        });
        f.addButton({ title: 'Delete the link' }).on('click', () => {
          delete L.walkLinks![id];
          this.changed({ t: 'bg' } as never, true);
          this.buildPane();
        });
      }
    }

    const fs = pane.addFolder({ title: 'Stage', expanded: false });
    for (const l of R.stage?.layers ?? []) {
      const g = ((L.layers ??= {})[l.id] ??= {});
      const f = fs.addFolder({ title: `${l.role} ${l.id}`, expanded: false });
      const proxy = {
        z: g.z ?? 0,
        parallaxX: g.parallax?.[0] ?? 1,
        parallaxY: g.parallax?.[1] ?? 1,
        blend: g.blend ?? 'normal',
        opacity: g.opacity ?? 1,
      };
      const set = () => {
        if (l.role === 'scenery' || proxy.z) g.z = proxy.z;
        else delete g.z;
        if (proxy.parallaxX !== 1 || proxy.parallaxY !== 1) g.parallax = [proxy.parallaxX, proxy.parallaxY];
        else delete g.parallax;
        if (proxy.blend !== 'normal') g.blend = proxy.blend as 'multiply';
        else delete g.blend;
        if (proxy.opacity !== 1) g.opacity = proxy.opacity;
        else delete g.opacity;
        this.changed({ t: 'layer', id: l.id });
      };
      f.addBinding(proxy, 'z', { min: 0, max: 600, step: 1 }).on('change', set);
      f.addBinding(proxy, 'parallaxX', { min: 0, max: 2, step: 0.05 }).on('change', set);
      f.addBinding(proxy, 'parallaxY', { min: 0, max: 2, step: 0.05 }).on('change', set);
      f.addBinding(proxy, 'blend', {
        options: { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay' },
      }).on('change', set);
      f.addBinding(proxy, 'opacity', { min: 0, max: 1, step: 0.05 }).on('change', set);
    }
    const no = { id: '' };
    fs.addBinding(no, 'id', { label: 'new occluder' });
    fs.addButton({ title: 'Draw an occluder' }).on('click', () => {
      if (!/^[A-Za-z_]\w*$/.test(no.id)) return;
      (L.occluders ??= {})[no.id] = {
        polygon: [
          [280, 200],
          [360, 200],
          [360, 330],
          [280, 330],
        ],
        z: 330,
      };
      this.changed({ t: 'occ', id: no.id, i: 0 }, true);
      this.buildPane();
    });
    for (const [id, o] of Object.entries(L.occluders ?? {})) {
      const f = fs.addFolder({ title: `occluder ${id}`, expanded: false });
      const proxy = { z: o.z, feather: o.feather ?? 0, invert: !!o.invert };
      f.addBinding(proxy, 'z', { min: 0, max: 600, step: 1 }).on('change', (ev) => {
        o.z = ev.value;
        this.changed({ t: 'occ', id, i: 0 });
      });
      f.addBinding(proxy, 'feather', { min: 0, max: 20, step: 1 }).on('change', (ev) => {
        if (ev.value) o.feather = ev.value;
        else delete o.feather;
        this.changed({ t: 'occ', id, i: 0 });
      });
      f.addBinding(proxy, 'invert').on('change', (ev) => {
        if (ev.value) o.invert = true;
        else delete o.invert;
        this.changed({ t: 'occ', id, i: 0 });
      });
      f.addButton({ title: 'Delete the occluder' }).on('click', () => {
        delete L.occluders![id];
        this.changed({ t: 'bg' } as never, true);
        this.buildPane();
      });
    }
    for (const l of R.stage?.lights ?? [])
      if (l.kind === 'radial' && !L.lights?.[l.id])
        fs.addButton({ title: `+ place light ${l.id}` }).on('click', () => {
          (L.lights ??= {})[l.id] = { at: [320, 200], radius: 90 };
          this.changed({ t: 'light', id: l.id, part: 'at' }, true);
          this.buildPane();
        });
    for (const e of R.stage?.emitters ?? [])
      if (!L.emitters?.[e.id])
        fs.addButton({ title: `+ place particles ${e.id}` }).on('click', () => {
          (L.emitters ??= {})[e.id] = { area: [0, 0, L.width ?? 640, 400] };
          this.changed({ t: 'emit', id: e.id, c: -1 }, true);
          this.buildPane();
        });
  }
}
