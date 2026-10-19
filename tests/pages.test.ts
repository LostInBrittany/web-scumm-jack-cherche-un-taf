// Review pages (tools/pages) built for the test fixture in a temporary game folder.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as fixture from './fixture';
import type { GameModule } from '../tools/game';
import { loadContext, type PageContext } from '../tools/pages/lib';
import { buildStoryboard, readStoryboard, storyboardMarkdown } from '../tools/pages/storyboard';
import { buildReview, listSheets } from '../tools/pages/review';
import { buildPlacement } from '../tools/pages/placement';
import { importLayouts, layoutsFromExport, mergeLayout } from '../tools/pages/import-layout';

// A 1 × 1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function tempGame(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pages-'));
  cpSync(resolve(__dirname, 'fixture/layout'), join(dir, 'layout'), { recursive: true });
  for (const f of ['grandma/idle', 'hero/idle', 'props/lamp_off', 'props/lamp_on', 'props/box', 'props/spare']) {
    mkdirSync(join(dir, 'art', f.split('/')[0]), { recursive: true });
    writeFileSync(join(dir, 'art', f + '.png'), PNG);
  }
  writeFileSync(
    join(dir, 'storyboard.json'),
    JSON.stringify({
      boards: [
        {
          id: 'house',
          title: 'At home',
          room: 'house',
          goal: 'Get the key.',
          panels: [
            {
              id: 'house-1',
              title: 'The drawer',
              action: 'Open drawer',
              lines: [
                { who: 'hero', text: 'A coin!' },
                { who: 'stage', text: 'It shines.' },
              ],
              sfx: ['ding'],
            },
            {
              id: 'house-2',
              title: 'Grandma',
              action: 'Give coin to Grandma',
              lines: [
                { who: 'grandma', text: 'Thanks! Here is the key.' },
                { who: 'action', text: 'Hero takes the key' },
              ],
            },
          ],
          talks: { grandma: [{ topic: 'Where is the key?', lines: [{ who: 'grandma', text: 'Bring me a coin.' }] }] },
          hints: ['Look in the drawer.', 'Grandma wants the coin.'],
        },
      ],
    }),
  );
  return dir;
}

async function ctxFor(dir: string): Promise<PageContext> {
  return loadContext({ gameDir: dir, mod: fixture as unknown as GameModule });
}

describe('storyboard page', () => {
  it('renders boards, speakers, notes and rewrites slots, and the markdown export', async () => {
    const dir = tempGame();
    const ctx = await ctxFor(dir);
    const sb = readStoryboard(dir);
    const html = buildStoryboard(ctx, sb);
    expect(html).toContain('<title>');
    expect(html).toContain('id="b-house"');
    expect(html).toContain('data-key="house-1"');
    expect(html).toContain('data-rewrite="house-2"');
    expect(html).toContain('data-key="general"');
    expect(html).toContain('Grandma');
    expect(html).toContain('class="act">Open drawer');
    expect(html).toContain('class="dir">It shines.');
    expect(html).toContain("window.claude.use('db')");
    expect(html).toContain('id="ps-export"');
    expect(html).toContain('data:image/'); // hero portrait from art/
    const md = storyboardMarkdown(ctx, sb);
    expect(md).toContain('### house-1 · The drawer');
    expect(md).toContain('- GRANDMA: Thanks! Here is the key.');
    expect(md).toContain('- ACTION: Open drawer');
    expect(md).toContain('- STAGE: It shines.');
  });
});

describe('review page', () => {
  it('lists every cell, marks the referenced ones, lists missing ids', async () => {
    const dir = tempGame();
    const ctx = await ctxFor(dir);
    const { sheets, missing } = listSheets(ctx);
    const cells = sheets.flatMap((s) => s.cells);
    expect(cells.map((c) => `${c.sheet}/${c.cell}`)).toContain('props/spare');
    expect(cells.find((c) => c.cell === 'lamp_on')!.usedBy).toEqual(['props/lamp_on']);
    expect(cells.find((c) => c.cell === 'spare')!.usedBy).toEqual([]);
    expect(missing).toContain('decor/house');
    const html = buildReview(ctx);
    expect(html).toContain('data-key="props__lamp_on"');
    expect(html).toContain('data-key="props__spare" data-sheet="props" data-cell="spare" data-used="0"');
    expect(html).toContain('value="redo"');
    expect(html).toContain("'decide'");
    expect(html).toContain('Referenced but missing');
  });
});

describe('placement page', () => {
  it('embeds every room with its layout and flags what is not placed', async () => {
    const dir = tempGame();
    writeFileSync(join(dir, 'layout/garden.json'), '{}');
    const ctx = await ctxFor(dir);
    const html = buildPlacement(ctx);
    const rooms = JSON.parse(html.match(/var ROOMS = (.*?);\n/)![1]) as {
      id: string;
      layout: any;
      items: { kind: string; id: string; img?: string }[];
    }[];
    expect(rooms.map((r) => r.id)).toEqual(['house', 'garden']);
    const house = rooms[0];
    expect(house.layout.props.lamp).toEqual({ x: 250, y: 300, h: 60 });
    expect(house.items.map((i) => `${i.kind}:${i.id}`)).toEqual([
      'prop:lamp',
      'actor:grandma',
      'hotspot:drawer',
      'hotspot:door',
    ]);
    expect(house.items[0].img).toMatch(/^data:image\//);
    expect(rooms[1].items).toEqual([expect.objectContaining({ kind: 'hotspot', id: 'shed' })]);
    expect(html).toContain('<svg id="st" viewBox="0 0 640 400"');
    expect(html).toContain("'layouts'");
  });
});

describe('import-layout', () => {
  it('reads every export shape', () => {
    const l = { props: { a: { x: 1, y: 2, h: 3 } } };
    expect(layoutsFromExport({ layouts: { house: l } })).toEqual([{ room: 'house', layout: l }]);
    expect(layoutsFromExport({ room: 'house', layout: l })).toEqual([{ room: 'house', layout: l }]);
    expect(layoutsFromExport([{ id: 'house', data: { room: 'house', layout: l } }])).toEqual([
      { room: 'house', layout: l },
    ]);
    expect(layoutsFromExport(l, 'garden.json')).toEqual([{ room: 'garden', layout: l }]);
  });

  it('replaces exported entities, keeps the others and the keys not exported', () => {
    const base = {
      floor: 390,
      props: { lamp: { x: 1, y: 2, h: 3, z: 9 }, box: { x: 5, y: 5, h: 5 } },
      entries: { default: [1, 1] as [number, number] },
    };
    const { layout, changes } = mergeLayout(base, {
      props: { lamp: { x: 10, y: 2, h: 3 } },
      hotspots: { door: { rect: [0, 0, 10, 10] } },
    });
    // The page exports complete entities: a `z` removed on the page is removed here (no silent merge back).
    expect(layout).toEqual({
      floor: 390,
      props: { lamp: { x: 10, y: 2, h: 3 }, box: { x: 5, y: 5, h: 5 } },
      entries: { default: [1, 1] },
      hotspots: { door: { rect: [0, 0, 10, 10] } },
    });
    expect(changes).toEqual(['~ props.lamp: x 1 → 10, z 9 → —', '+ hotspots.door {"rect":[0,0,10,10]}']);
  });

  it('writes the merged layout and is idempotent', async () => {
    const dir = tempGame();
    const exp = join(dir, 'export.json');
    writeFileSync(exp, JSON.stringify({ layouts: { house: { props: { lamp: { x: 300, y: 310, h: 60 } } } } }));
    const log: string[] = [];
    // The folder holds layouts only (no game to validate): the guard is off.
    expect(await importLayouts(exp, dir, { log: (s) => log.push(s), guard: false })).toBe(1);
    const house = JSON.parse(readFileSync(join(dir, 'layout/house.json'), 'utf8'));
    expect(house.props.lamp).toEqual({ x: 300, y: 310, h: 60 });
    expect(house.actors.grandma).toEqual({ x: 450, y: 340, h: 110 });
    expect(await importLayouts(exp, dir, { log: () => {}, guard: false })).toBe(0);
  }, 60000);
});
