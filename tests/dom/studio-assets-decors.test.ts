// @vitest-environment happy-dom
// The Assets tab's backgrounds view (4.1.8, src/studio/assets-decors.ts): the overlay SVG's geometry for a layout, a
// decor rendered with the room's layout read through a fake api (the room select, the spots toggle, "Open in Rooms",
// the stale render dropped), its side panel, and the Replace upload (POST assets/decor, the new selection).
import type { Layout } from '@engine/core/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Api, type AssetDecor, type AssetsListing, type GameInfo, serverApi, useApi } from '../../src/studio/api';
import { DecorsView, overlaySvg } from '../../src/studio/assets-decors';
import type { Sel } from '../../src/studio/assets-model';
import type { AssetsHost } from '../../src/studio/assets-view';

const decor = (name: string, o: Partial<AssetDecor> = {}): AssetDecor => ({
  id: name,
  name: `decor/${name}`,
  file: `art/decor/${name}.png`,
  w: 1536,
  h: 960,
  used: [`${name}.decor`],
  ids: [`decor/${name}`],
  prepared: true,
  backups: [],
  mtime: 9,
  rooms: [name],
  ...o,
});
const yard = decor('yard', { rooms: ['yard', 'yard_night'] });
const title = decor('title', { rooms: [], used: ['skin.title'], prepared: false });
const info = (): GameInfo => ({
  id: 'demo',
  title: 'Demo',
  rooms: [{ id: 'yard', name: 'Yard', decor: 'decor/yard' }],
  characters: {},
  items: {},
  verbs: [],
  checkpoints: {},
  hero: 'hero',
  images: {},
});
const listing = (): AssetsListing => ({
  sheets: [],
  decors: [yard, title],
  sounds: { music: [], sfx: [] },
  missing: [],
  unprepared: 0,
  prompts: { sheets: [{ id: 'decor/yard', kind: 'decor', markdown: '```text\na yard\n```' }], style: 'style' },
});
function host(o: Partial<AssetsHost> & { selected?: Sel | null } = {}): AssetsHost {
  const { selected = { type: 'decor', id: 'decor/yard' }, ...rest } = o;
  return {
    demo: false,
    info: info(),
    data: listing,
    listing,
    sel: () => selected,
    select: vi.fn(),
    url: (x) => (x.file ? `/f/${x.file}?v=${x.mtime}` : null),
    ownWrite: vi.fn(),
    reload: vi.fn(async () => undefined),
    renderCenter: vi.fn(),
    ...rest,
  };
}
const layout: Layout = {
  walk: {
    area: [
      [0, 300],
      [640, 300],
      [640, 400],
      [0, 400],
    ],
  },
  hotspots: {
    door: { rect: [10, 20, 30, 40] },
    window: {
      poly: [
        [100, 50],
        [150, 50],
        [150, 90],
      ],
    },
  },
  props: { pot: { x: 200, y: 350, h: 40 } },
  actors: { grandpa: { x: 400, y: 380 } },
};
const texts = (root: ParentNode, sel: string) => [...root.querySelectorAll(sel)].map((e) => e.textContent);
const attrs = (e: Element | null, ...names: string[]) => names.map((n) => e?.getAttribute(n));

/** Empties the page but keeps the toast stack `toast()` caches (emptied), so later toasts stay visible. */
const clean = () => {
  for (const el of [...document.body.children]) if (!el.classList.contains('toasts')) el.remove();
  document.querySelector('.toasts')?.replaceChildren();
};

afterEach(() => {
  useApi({ ...serverApi });
  vi.unstubAllGlobals();
  clean();
});

describe('overlaySvg', () => {
  it('draws the floor band, the walk area, each hotspot with its label, each prop as foot and height, each actor', () => {
    const svg = overlaySvg('yard', layout);
    expect(attrs(svg, 'viewBox', 'class', 'role', 'aria-label')).toEqual([
      '0 0 640 400',
      'as-over',
      'img',
      'Spots of yard',
    ]);
    expect(attrs(svg.querySelector('rect.band'), 'x', 'y', 'width', 'height')).toEqual(['0', '232', '640', '148']);
    expect(svg.querySelector('polygon.walk')?.getAttribute('points')).toBe('0,300 640,300 640,400 0,400');
    const hs = [...svg.querySelectorAll('.hs')];
    expect(hs.map((e) => e.tagName)).toEqual(['rect', 'polygon']);
    expect(attrs(hs[0], 'x', 'y', 'width', 'height')).toEqual(['10', '20', '30', '40']);
    expect(hs[1].getAttribute('points')).toBe('100,50 150,50 150,90');
    expect([...svg.querySelectorAll('text.hst')].map((t) => [t.textContent, ...attrs(t, 'x', 'y')])).toEqual([
      ['door', '13', '31'],
      ['window', '103', '61'],
    ]);
    expect(attrs(svg.querySelector('line.prop'), 'x1', 'y1', 'x2', 'y2')).toEqual(['200', '350', '200', '310']);
    expect(attrs(svg.querySelector('circle.propf'), 'cx', 'cy', 'r')).toEqual(['200', '350', '3.5']);
    expect(attrs(svg.querySelector('text.propt'), 'x', 'y')).toEqual(['205', '319']);
    expect(attrs(svg.querySelector('circle.act'), 'cx', 'cy', 'r')).toEqual(['400', '380', '5']);
    expect([...attrs(svg.querySelector('text.actt'), 'x', 'y'), svg.querySelector('text.actt')?.textContent]).toEqual([
      '407',
      '376',
      'grandpa',
    ]);
  });

  it('with several floors, draws each zone and a dashed line per link instead of the single walk area', () => {
    const svg = overlaySvg('yard', {
      walk: {
        area: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
      walkZones: {
        low: {
          area: [
            [0, 300],
            [640, 300],
            [640, 400],
          ],
        },
        high: {
          area: [
            [0, 100],
            [640, 100],
            [640, 200],
          ],
        },
      },
      walkLinks: {
        stairs: { from: { zone: 'low', at: [320, 300] }, to: { zone: 'high', at: [320, 200] }, mode: 'stairs' },
      },
    });
    expect([...svg.querySelectorAll('polygon.walk')].map((p) => p.getAttribute('points'))).toEqual([
      '0,300 640,300 640,400',
      '0,100 640,100 640,200',
    ]);
    const link = svg.querySelector('line.link');
    expect(attrs(link, 'x1', 'y1', 'x2', 'y2', 'data-link', 'stroke-dasharray')).toEqual([
      '320',
      '300',
      '320',
      '200',
      'stairs',
      '4 3',
    ]);
  });
});

describe('DecorsView.render', () => {
  it('reads the room layout once, shows the decor with its rooms, the spots overlay, the room select and Open in Rooms', async () => {
    const room = vi.fn(async (id: string) => ({ def: {}, layout: id === 'yard' ? layout : {}, texts: [], file: '' }));
    useApi({ ...serverApi, room } as unknown as Api);
    const openRoom = vi.fn();
    const h = host({ openRoom });
    const view = new DecorsView(h);
    const show = vi.fn();
    await view.render('decor/yard', show);
    expect(room).toHaveBeenCalledWith('yard', { track: false });
    const root = document.createElement('div');
    root.append(...(show.mock.calls[0][0] as Node[]));
    expect(texts(root, 'header.as-head > *')).toEqual(['decor/yard', 'rooms yard, yard_night', '1536 × 960 px']);
    expect(root.querySelector('details.as-prompt pre.as-md')?.textContent).toBe('```text\na yard\n```');
    expect(root.querySelector('.as-decor img')?.getAttribute('src')).toBe('/f/art/decor/yard.png?v=9');
    expect(root.querySelector('.as-decor svg.as-over')).not.toBeNull();
    expect([...root.querySelectorAll('select[aria-label=Room] option')].map((o) => o.textContent)).toEqual([
      'yard',
      'yard_night',
    ]);
    expect(root.querySelector<HTMLInputElement>('.bar input[type=checkbox]')?.checked).toBe(true);
    root.querySelector<HTMLButtonElement>('.bar button.link')?.click();
    expect(openRoom).toHaveBeenCalledWith('yard');
    // Rendering again does not read the layout again.
    await view.render('decor/yard', show);
    expect(room).toHaveBeenCalledTimes(1);
  });

  it('hiding the spots or changing the room asks the host to render the centre again, without the overlay then', async () => {
    useApi({ ...serverApi, room: async () => ({ def: {}, layout, texts: [], file: '' }) } as unknown as Api);
    const h = host();
    const view = new DecorsView(h);
    const show = vi.fn();
    await view.render('decor/yard', show);
    const root = document.createElement('div');
    root.append(...(show.mock.calls[0][0] as Node[]));
    const box = root.querySelector<HTMLInputElement>('.bar input[type=checkbox]');
    if (box) box.checked = false;
    box?.dispatchEvent(new Event('change'));
    expect(h.renderCenter).toHaveBeenCalledTimes(1);
    await view.render('decor/yard', show);
    const again = document.createElement('div');
    again.append(...(show.mock.calls[1][0] as Node[]));
    expect(again.querySelector('svg.as-over')).toBeNull();
    expect(again.querySelector('p.muted.small')).toBeNull();
  });

  it('drops the render when the selection moved on while the layout loaded, and shows a decor without a room at once', async () => {
    useApi({ ...serverApi, room: async () => ({ def: {}, layout, texts: [], file: '' }) } as unknown as Api);
    const moved = new DecorsView(host({ selected: { type: 'sheet', id: 'hero' } }));
    const show = vi.fn();
    await moved.render('decor/yard', show);
    expect(show).not.toHaveBeenCalled();
    await new DecorsView(host({ demo: true, url: () => null })).render('decor/title', show);
    const root = document.createElement('div');
    root.append(...(show.mock.calls[0][0] as Node[]));
    expect(texts(root, 'header.as-head > *')).toEqual([
      'decor/title',
      'no room (map, title or credits)',
      '1536 × 960 px',
    ]);
    expect(root.querySelector('.as-decor .nodecor')?.textContent).toBe('No preview in the demo.');
    expect(root.querySelector('.bar')?.childElementCount).toBe(0);
    show.mockClear();
    await new DecorsView(host()).render('decor/ghost', show);
    expect((show.mock.calls[0][0] as Node[])[0].textContent).toBe('No background "decor/ghost".');
  });
});

describe('DecorsView.panel and replace', () => {
  it('shows the facts and where the decor is used; the demo offers no replacement', () => {
    const panel = new DecorsView(host()).panel(yard);
    expect(panel.querySelector('h2')?.textContent).toBe('decor/yard');
    expect(texts(panel, 'dl.facts dd')).toEqual(['art/decor/yard.png', '✔ in public/assets']);
    expect(texts(panel, '.as-used code')).toEqual(['yard.decor']);
    expect(panel.querySelector('section button.primary')?.textContent).toBe('Replace…');
    const demo = new DecorsView(host({ demo: true })).panel(title);
    expect(texts(demo, 'dl.facts dd')).toEqual(['art/decor/title.png', 'no: run Prepare assets']);
    expect(demo.querySelector('button.primary')).toBeNull();
    expect(demo.querySelector('p.muted.small')?.textContent).toBe('Replacing a background needs the dev server.');
  });

  it('Replace… POSTs assets/decor with the short name and the data URL, selects the decor and reloads', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, file: 'art/decor/yard.png' }),
    }));
    vi.stubGlobal('fetch', fetch);
    const h = host();
    const panel = new DecorsView(h).panel(yard);
    document.body.append(panel);
    panel.querySelector<HTMLButtonElement>('section button.primary')?.click();
    const input = document.body.querySelector<HTMLInputElement>('input[type=file][hidden]');
    expect(input?.getAttribute('accept')).toBe('image/png,image/jpeg');
    Object.defineProperty(input, 'files', { value: [new File(['jpg'], 'yard.jpg', { type: 'image/jpeg' })] });
    input?.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(h.reload).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/__studio/api/assets/decor');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'yard', data: 'data:image/jpeg;base64,anBn' });
    expect(h.select).toHaveBeenCalledWith({ type: 'decor', id: 'decor/yard' });
    expect(h.ownWrite).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.toast')?.textContent).toBe('art/decor/yard.png saved');
  });

  it('"+ background" refuses a bad name without any upload', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('prompt', () => 'back yard');
    await new DecorsView(host()).add();
    expect(document.querySelector('.toast.error')?.textContent).toBe('Name: letters, digits, _ and -');
    expect(fetch).not.toHaveBeenCalled();
    expect(document.body.querySelector('input[type=file]')).toBeNull();
  });
});
