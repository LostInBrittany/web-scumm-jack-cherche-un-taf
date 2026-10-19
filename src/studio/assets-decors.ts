// Assets tab, the backgrounds (4.1.8, programme §4.7: the Studio's biggest owners split into model / IO / view): a
// decor in the centre with its prompt and the room's spots drawn over it (hotspots, props, actors, walk area, from the
// room's layout through `api.room`), its side panel, and the uploads: a replaced or added background (POST
// assets/decor). The view keeps the overlay's state (which room, shown or not, the layouts read so far); the tab
// (assets.ts) owns the selection and hands an `AssetsHost`.
import type { Layout } from '@engine/core/types';
import { api, type AssetDecor, type AssetPrompt, type UploadResult } from './api';
import { copy, pickFile, post, readFile } from './assets-io';
import { fenced, promptOf } from './assets-model';
import { type AssetsHost, backupsList, nodes, styleDetails, usedList } from './assets-view';
import { h, toast } from './ui';
import { must } from '../engine/core/must';

export class DecorsView {
  private overlayRoom = '';
  private overlay = true;
  private layouts = new Map<string, Layout>();

  constructor(private host: AssetsHost) {}

  /**
   * The centre for a decor, handed to `show` (at once when the room's layout is known, after `api.room` otherwise;
   * not at all when the selection moved on meanwhile).
   */
  async render(name: string, show: (kids: (Node | string)[]) => void): Promise<void> {
    const host = this.host;
    const d = host.data().decors.find((x) => x.name === name);
    if (!d) {
      show([h('p', { class: 'muted pad' }, `No background "${name}".`)]);
      return;
    }
    if (!this.overlayRoom || !d.rooms.includes(this.overlayRoom)) this.overlayRoom = d.rooms[0] ?? '';
    const room = this.overlayRoom;
    if (room && !this.layouts.has(room)) {
      try {
        this.layouts.set(room, (await api.room(room, { track: false })).layout);
      } catch {
        this.layouts.set(room, {});
      }
      const sel = host.sel();
      if (sel?.type !== 'decor' || sel.id !== name) return;
    }
    const src = host.url(d);
    const L = room ? this.layouts.get(room) : undefined;
    const roomSel =
      d.rooms.length > 1
        ? h(
            'select',
            {
              'aria-label': 'Room',
              onchange: (e: Event) => {
                this.overlayRoom = (e.target as HTMLSelectElement).value;
                this.host.renderCenter();
              },
            },
            d.rooms.map((r) => h('option', { value: r, selected: r === room }, r)),
          )
        : null;
    const prompt = promptOf(host.data(), name);
    const open = host.openRoom;
    show(
      nodes(
        h(
          'header',
          { class: 'as-head' },
          h('h2', null, name),
          h(
            'span',
            { class: 'muted' },
            d.rooms.length
              ? `room${d.rooms.length > 1 ? 's' : ''} ${d.rooms.join(', ')}`
              : 'no room (map, title or credits)',
          ),
          d.w ? h('span', { class: 'muted small' }, `${d.w} × ${d.h} px`) : null,
        ),
        prompt ? this.prompt(prompt) : null,
        h(
          'div',
          { class: 'bar' },
          room
            ? h(
                'label',
                null,
                h('input', {
                  type: 'checkbox',
                  checked: this.overlay,
                  onchange: (e: Event) => {
                    this.overlay = (e.target as HTMLInputElement).checked;
                    this.host.renderCenter();
                  },
                }),
                " Show the room's spots",
              )
            : null,
          roomSel,
          room && open ? h('button', { class: 'link', onclick: () => open(room) }, `Open ${room} in Rooms`) : null,
        ),
        h(
          'div',
          { class: 'as-decor' },
          src
            ? h('img', { src, alt: name })
            : h(
                'div',
                { class: 'nodecor' },
                d.missing ? 'Missing: generate it with the prompt above.' : 'No preview in the demo.',
              ),
          L && this.overlay ? overlaySvg(room, L) : null,
        ),
        L && this.overlay
          ? h(
              'p',
              { class: 'muted small' },
              'Dashed band: the empty floor the prompt asks for (58% to 95% of the height). Blue: hotspots; yellow: props (foot and height); green: actors; white: walk area.',
            )
          : null,
      ),
    );
  }

  private prompt(p: AssetPrompt) {
    return h(
      'details',
      { class: 'as-prompt panel' },
      h(
        'summary',
        null,
        h(
          'div',
          { class: 'as-phead' },
          h('h3', null, 'Prompt ', h('span', { class: 'muted small' }, '(click to show)')),
          h(
            'button',
            {
              onclick: (e: Event) => {
                e.preventDefault();
                void copy(fenced(p.markdown), 'Prompt');
              },
            },
            'Copy prompt',
          ),
        ),
      ),
      h('pre', { class: 'as-md' }, p.markdown),
      styleDetails(this.host),
    );
  }

  /** The side panel of a decor: its facts, where it is used, Replace, its backups. */
  panel(d: AssetDecor) {
    const host = this.host;
    return h(
      'div',
      { class: 'as-panel' },
      h('div', { class: 'sheethead' }, h('h2', null, d.name)),
      h(
        'dl',
        { class: 'facts' },
        h('dt', null, 'File'),
        h('dd', null, d.file ? h('code', null, d.file) : '—'),
        h('dt', null, 'Prepared'),
        h(
          'dd',
          null,
          d.missing
            ? '—'
            : !d.used.length
              ? h('span', { class: 'muted' }, 'not needed (unused)')
              : d.prepared
                ? h('span', { class: 'ok' }, '✔ in public/assets')
                : h('span', { class: 'warn' }, 'no: run Prepare assets'),
        ),
      ),
      h('section', null, h('h3', null, 'Used by'), usedList(host, d.used)),
      host.demo
        ? h('p', { class: 'muted small' }, 'Replacing a background needs the dev server.')
        : h(
            'section',
            null,
            h('h3', null, d.missing ? 'Add the file' : 'Replace'),
            h(
              'button',
              { class: 'primary', onclick: () => void this.replace(d.name.slice(6)) },
              d.missing ? 'Add file…' : 'Replace…',
            ),
            h(
              'p',
              { class: 'muted small' },
              'PNG or JPEG, about 1536 × 960 (16:10); the old picture is kept as a backup.',
            ),
          ),
      backupsList(host, d.backups, d.mtime),
    );
  }

  /** Picks a picture for `decor/<name>` (new or replaced) → POST assets/decor, then selects it. */
  async replace(name: string) {
    const host = this.host;
    const f = await pickFile('image/png,image/jpeg');
    try {
      host.ownWrite();
      const r = await post<UploadResult>('decor', { name, data: await readFile(f) });
      toast(`${r.file} saved${r.backup ? `, old one kept as ${r.backup.split('/').pop()}` : ''}`);
      host.select({ type: 'decor', id: `decor/${name}` });
      await host.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  /** "+ background": asks a name, then uploads its picture. */
  async add() {
    const name = prompt('Name of the new background (letters, digits, _ and -): it becomes decor/<name>');
    if (!name) return;
    if (!/^[\w-]+$/.test(name.trim())) {
      toast('Name: letters, digits, _ and -', 'error');
      return;
    }
    await this.replace(name.trim());
  }
}

/** The room's hotspots, props, actors and walk area over the decor (logical 640 × 400). */
export function overlaySvg(room: string, L: Layout): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text) e.textContent = text;
    return e;
  };
  const svg = el('svg', {
    viewBox: '0 0 640 400',
    preserveAspectRatio: 'none',
    class: 'as-over',
    role: 'img',
    'aria-label': `Spots of ${room}`,
  }) as SVGSVGElement;
  svg.append(el('rect', { x: 0, y: 232, width: 640, height: 148, class: 'band' }));
  if (L.walk?.area?.length && !L.walkZones)
    svg.append(el('polygon', { points: L.walk.area.map((p) => p.join(',')).join(' '), class: 'walk' }));
  // Several floors (3.4): each zone, and each link as a line between its two ends.
  for (const z of Object.values(L.walkZones ?? {}))
    svg.append(el('polygon', { points: z.area.map((p) => p.join(',')).join(' '), class: 'walk' }));
  for (const [id, k] of Object.entries(L.walkLinks ?? {}))
    svg.append(
      el('line', {
        x1: k.from.at[0],
        y1: k.from.at[1],
        x2: k.to.at[0],
        y2: k.to.at[1],
        class: 'link',
        'data-link': id,
        stroke: '#ffd84d',
        'stroke-width': 2,
        'stroke-dasharray': '4 3',
      }),
    );
  const label = (x: number, y: number, t: string, cls: string) => svg.append(el('text', { x, y, class: cls }, t));
  for (const [id, g] of Object.entries(L.hotspots ?? {})) {
    if (g.rect) {
      svg.append(el('rect', { x: g.rect[0], y: g.rect[1], width: g.rect[2], height: g.rect[3], class: 'hs' }));
      label(g.rect[0] + 3, g.rect[1] + 11, id, 'hst');
    } else if (g.poly?.length) {
      svg.append(el('polygon', { points: g.poly.map((p) => p.join(',')).join(' '), class: 'hs' }));
      const first = must(g.poly[0], 'first point of a hotspot polygon');
      label(first[0] + 3, first[1] + 11, id, 'hst');
    }
  }
  for (const [id, p] of Object.entries(L.props ?? {})) {
    svg.append(
      el('line', { x1: p.x, y1: p.y, x2: p.x, y2: p.y - p.h, class: 'prop' }),
      el('circle', { cx: p.x, cy: p.y, r: 3.5, class: 'propf' }),
    );
    label(p.x + 5, p.y - p.h + 9, id, 'propt');
  }
  for (const [id, a] of Object.entries(L.actors ?? {})) {
    svg.append(el('circle', { cx: a.x, cy: a.y, r: 5, class: 'act' }));
    label(a.x + 7, a.y - 4, id, 'actt');
  }
  return svg;
}
