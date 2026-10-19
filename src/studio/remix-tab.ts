// The Studio's Remix tab (4.1.15, programme §11.9), its view over src/studio/remix-model.ts: the dimensions and their
// domains; a seed previewed (or a new one); dimensions locked and the others rerolled; two worlds compared; a puzzle
// order drawn as a graph; coverage and bias over many seeds; the rooms' anchors, and an anchor added from the Rooms
// tab's selection; a world played in the game (`?seed=`, `?world=`) or exported as a frozen file for a bug report.
import type { GameIR } from '@engine/core/ir';
import type { WorldVariant } from '@engine/core/remix/compile';
import { newSeedCode } from '@engine/core/remix/seed-code';
import { frozenParam } from '@engine/dom/remix-menu';
import { api } from './api';
import { exportWorld, RemixModel, readSeed } from './remix-model';
import { h, toast } from './ui';
import { gameLink } from './game-origin';

/** What the tab asks of the Studio: the Rooms tab's selection (for "anchor from the scene"). */
export interface RemixHost {
  selection(): { room: string; entity?: { kind: string; id: string } };
  /** The IR (the dev server's `api.ir`; a test hands one in). */
  ir?: () => Promise<GameIR>;
}

const table = (head: string[], rows: (string | Node)[][], cls = 'grid') =>
  h(
    'table',
    { class: cls },
    h(
      'tr',
      null,
      head.map((x) => h('th', null, x)),
    ),
    rows.map((r) =>
      h(
        'tr',
        null,
        r.map((x) => h('td', null, x)),
      ),
    ),
  );

export class RemixTab {
  readonly el = h('section', { class: 'tab remix', 'aria-label': 'Remix' });
  model: RemixModel | undefined;
  private current: WorldVariant | undefined;
  private locks = new Set<string>();

  constructor(private host: RemixHost) {}

  async load(): Promise<void> {
    const read = this.host.ir ?? api.ir?.bind(api);
    if (!read) {
      this.el.replaceChildren(h('p', { class: 'muted' }, 'The Remix tab needs the dev server (npm run studio).'));
      return;
    }
    try {
      this.model = new RemixModel(await read());
    } catch (e) {
      this.el.replaceChildren(h('p', { class: 'error' }, (e as Error).message));
      return;
    }
    this.render();
  }

  private render() {
    const m = this.model!;
    if (!m.manifest) {
      this.el.replaceChildren(
        h('h2', null, 'Remix'),
        h(
          'p',
          null,
          'This game declares no `remix` manifest: one world, the story. docs/en/REMIX.md says how to add one.',
        ),
        this.anchorsSection(),
      );
      return;
    }
    if (m.problems.length) {
      this.el.replaceChildren(
        h('h2', null, 'Remix'),
        h(
          'ul',
          { class: 'error', role: 'alert' },
          m.problems.map((p) => h('li', null, p)),
        ),
      );
      return;
    }
    this.el.replaceChildren(
      h('h2', null, 'Remix'),
      table(
        ['dimension', 'kind', 'solver', 'values', 'story', 'modes'],
        m
          .dimensions()
          .map((d) => [
            d.id,
            d.kind,
            d.logical ? 'logical' : 'presentation',
            d.domain.join(' · '),
            d.story,
            d.modes.join(', '),
          ]),
        'grid dims',
      ),
      this.previewSection(),
      this.coverageSection(),
      this.anchorsSection(),
    );
  }

  private previewSection(): HTMLElement {
    const m = this.model!;
    const seed = h('input', {
      name: 'seed',
      placeholder: 'WS-XXXX-XXXX',
      'aria-label': 'Seed',
      value: this.current?.seed ?? '',
    });
    const mode = h(
      'select',
      { name: 'mode', 'aria-label': 'Mode' },
      m.modes.map((x) => h('option', { value: x, selected: x === 'remix' }, x)),
    );
    const out = h('div', { class: 'remix-world', 'aria-live': 'polite' });
    const show = (v: WorldVariant) => {
      this.current = v;
      seed.value = v.seed;
      out.replaceChildren(this.worldView(v));
    };
    const preview = () => {
      const r = readSeed(seed.value);
      if ('error' in r) {
        out.replaceChildren(h('p', { class: 'error', role: 'alert' }, r.error));
        return;
      }
      show(m.preview(r.seed, mode.value));
    };
    const section = h(
      'section',
      { class: 'remix-preview' },
      h('h3', null, 'Preview a seed'),
      seed,
      mode,
      h('button', { type: 'button', onclick: preview }, 'Preview'),
      h('button', { type: 'button', onclick: () => show(m.preview(newSeedCode(), mode.value)) }, 'New seed'),
      h(
        'button',
        {
          type: 'button',
          title: 'Keep the locked dimensions, draw the others again',
          onclick: () => {
            if (!this.current) return;
            const locked = Object.fromEntries([...this.locks].map((id) => [id, this.current!.assignments[id]]));
            const v = m.reroll(locked, mode.value, Number.parseInt(this.current.hash.slice(0, 6), 16));
            if (v) show(v);
            else toast('No seed of this mode keeps those locks', 'error');
          },
        },
        'Reroll the others',
      ),
      out,
    );
    if (this.current) out.replaceChildren(this.worldView(this.current));
    return section;
  }

  private worldView(v: WorldVariant): HTMLElement {
    const m = this.model!;
    const rows = m.compare(v, v).map((r) => {
      const lock = h('input', {
        type: 'checkbox',
        'aria-label': `Lock ${r.id}`,
        checked: this.locks.has(r.id),
        onchange: (e: Event) =>
          (e.target as HTMLInputElement).checked ? this.locks.add(r.id) : this.locks.delete(r.id),
      });
      return [lock, r.id, r.a];
    });
    const other = h('input', { name: 'other', placeholder: 'another seed', 'aria-label': 'Compare with seed' });
    const cmp = h('div', { class: 'remix-compare' });
    const orders = m.compiled!.order.map((id) => m.order(id, v)).filter((x) => x);
    const broken = m.broken(v);
    return h(
      'div',
      null,
      h(
        'p',
        null,
        `World ${v.hash.slice(0, 12)} · seed ${v.seed} · mode ${v.mode} · ${v.algorithm} v${v.algorithmVersion}`,
      ),
      broken.length ? h('p', { class: 'error' }, `Breaks: ${broken.join('; ')}`) : null,
      table(['lock', 'dimension', 'value'], rows),
      orders.map((o) => this.orderSvg(o!.groups, o!.edges)),
      gameLink(`?seed=${encodeURIComponent(v.seed)}`, 'Play this seed ↗'),
      ' ',
      gameLink(`?world=${frozenParam(v)}`, 'Play this frozen world ↗'),
      ' ',
      h('button', { type: 'button', onclick: () => this.download(v) }, 'Export the frozen world'),
      h('h4', null, 'Compare'),
      other,
      h(
        'button',
        {
          type: 'button',
          onclick: () => {
            const r = readSeed(other.value);
            if ('error' in r) return void cmp.replaceChildren(h('p', { class: 'error', role: 'alert' }, r.error));
            const w = m.preview(r.seed, v.mode === 'story' ? 'remix' : v.mode);
            cmp.replaceChildren(
              table(
                ['dimension', v.seed, w.seed],
                m.compare(v, w).map((x) => [x.id, x.a, x.differs ? h('strong', null, x.b) : x.b]),
              ),
            );
          },
        },
        'Compare',
      ),
      cmp,
    );
  }

  /** A puzzle order as boxes left to right, the author's edges as arrows (the groups this world plays first, first). */
  private orderSvg(groups: string[], edges: [string, string][]): SVGSVGElement {
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${groups.length * 110} 60`);
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', `Order: ${groups.join(' then ')}`);
    groups.forEach((g, i) => {
      const r = document.createElementNS(NS, 'rect');
      for (const [k, v] of Object.entries({
        x: i * 110 + 5,
        y: 15,
        width: 90,
        height: 30,
        rx: 6,
        fill: '#eef',
        stroke: '#335',
      }))
        r.setAttribute(k, String(v));
      const t = document.createElementNS(NS, 'text');
      for (const [k, v] of Object.entries({ x: i * 110 + 50, y: 35, 'text-anchor': 'middle', 'font-size': 12 }))
        t.setAttribute(k, String(v));
      t.textContent = `${i + 1}. ${g}`;
      s.append(r, t);
    });
    for (const [a, b] of edges) {
      const l = document.createElementNS(NS, 'line');
      const [x1, x2] = [groups.indexOf(a) * 110 + 95, groups.indexOf(b) * 110 + 5];
      for (const [k, v] of Object.entries({ x1, y1: 30, x2, y2: 30, stroke: '#c33', 'stroke-width': 2 }))
        l.setAttribute(k, String(v));
      s.append(l);
    }
    return s;
  }

  private download(v: WorldVariant) {
    const { name, json } = exportWorld(this.model!.ir.gameId, v);
    const a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: name });
    a.click();
    toast(`Exported ${name}`);
  }

  private coverageSection(): HTMLElement {
    const m = this.model!;
    const out = h('div', { 'aria-live': 'polite' });
    const count = h('input', {
      type: 'number',
      name: 'count',
      value: '500',
      min: '10',
      max: '5000',
      'aria-label': 'Seeds',
    });
    const mode = h(
      'select',
      { 'aria-label': 'Mode of the coverage' },
      m.modes.map((x) => h('option', { value: x, selected: x === 'remix' }, x)),
    );
    return h(
      'section',
      { class: 'remix-coverage' },
      h('h3', null, 'Coverage and bias'),
      count,
      mode,
      h(
        'button',
        {
          type: 'button',
          onclick: () => {
            const rows = m.coverage(mode.value, Number(count.value) || 500);
            out.replaceChildren(
              table(
                ['dimension', 'how often', 'never chosen', 'dominant'],
                rows.map((r) => [
                  r.id,
                  Object.entries(r.counts)
                    .map(([v, n]) => `${v}: ${n}`)
                    .join(' · '),
                  r.never.join(', '),
                  r.dominant.join(', '),
                ]),
              ),
            );
          },
        },
        'Draw',
      ),
      out,
    );
  }

  private anchorsSection(): HTMLElement {
    const m = this.model!;
    const add = async () => {
      const sel = this.host.selection();
      if (!sel.entity || sel.entity.kind === 'actor')
        return toast('Select a prop or a hotspot in the Rooms tab first', 'error');
      if (!api.setValue) return toast('Adding an anchor needs the dev server', 'error');
      try {
        await api.setValue(sel.room, `anchors.${sel.entity.id}`, { at: sel.entity.id });
        toast(`Anchor ${sel.room}.${sel.entity.id} added`);
        await this.load();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    };
    return h(
      'section',
      { class: 'remix-anchors' },
      h('h3', null, 'Anchors'),
      table(
        ['room', 'anchor', 'on', 'phase', 'used by'],
        m.anchors().map((a) => [a.room, a.anchor, a.at, a.phase ?? '', a.usedBy.join(', ') || '(none)']),
      ),
      h('button', { type: 'button', onclick: () => void add() }, 'Add an anchor from the scene’s selection'),
    );
  }
}
