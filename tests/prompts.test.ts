// tools/prompts.ts (npm run prompts) on games/demo: one section per sheet, the engine's pose rows, the special poses
// on their cells, object sheets grouped by folder, backgrounds with their empty spots, and --missing on a temp copy.
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { GameDef } from '@engine/core/types';
import { buildPrompts, COLOR_RULES, readArtStyle } from '../tools/prompts';
import { game } from '../games/demo/game';

const ROOT = resolve(__dirname, '..');
const GAME_DIR = join(ROOT, 'games', 'demo');
const opts = { gameId: 'demo', gameDir: GAME_DIR, root: ROOT };
const section = (md: string, title: string) => {
  const i = md.indexOf(title);
  expect(i, title).toBeGreaterThanOrEqual(0);
  const next = md.indexOf('\n#### ', i + title.length);
  const next3 = md.indexOf('\n### ', i + title.length);
  const end = Math.min(...[next, next3].filter((x) => x > 0), md.length);
  return md.slice(i, end);
};

describe('npm run prompts on games/demo', () => {
  const { markdown: md, missing, sheets } = buildPrompts({ game }, opts);

  it('writes the style block once, with the flat background and the reference', () => {
    expect(md.match(/^## Style block/gm)).toHaveLength(1);
    expect(md).toContain('#2B2E45');
    expect(md).toContain('games/demo/art/_reference.png');
    expect(missing).toEqual([]);
  });

  it('has a section per character, with the ROW lines and the description', () => {
    for (const name of ['Pixel', 'Biscuit', 'Grandma', 'Grandpa', 'Lou', 'The seller'])
      expect(md).toMatch(new RegExp(`^### ${name} \\(`, 'm'));
    const hero = section(md, '#### Base sheet `hero`');
    expect(hero).toContain('CHARACTER: a small fluffy ragdoll kitten');
    for (const r of [1, 2, 3, 4]) expect(hero).toContain(`ROW ${r} — `);
    expect(hero).toContain('profile facing RIGHT, 6 consecutive frames of one smooth walk loop');
    const grandma = section(md, '#### Base sheet `grandma`');
    expect(grandma).toContain('ROW 4 — full-body walk: walking toward the viewer (3 frames)');
    expect(grandma).toContain('`walk` = r2c1, r2c2, r2c3, r2c4, r2c5, r2c6');
    expect(md).toContain('Reuses the sheet `grandma` of `grandma`');
  });

  it('assigns the special poses to their cells', () => {
    const lou = section(md, '#### Base sheet `neighbor`');
    expect(lou).toMatch(
      /ROW 4 — full-body special poses: pinching the nose.* \| celebrating.* \| holding a big wrench.* \| EMPTY \(flat background only\) \| EMPTY \(flat background only\) \| thumbs up/,
    );
    expect(lou).toContain('`wrench` = r4c3');
    expect(lou).toContain('`celebrate` = r4c2');
    const seller = section(md, '#### Base sheet `seller`');
    for (const [p, c] of [
      ['welcome', 'r4c1'],
      ['offering', 'r4c2'],
      ['laugh', 'r4c3'],
      ['panic', 'r4c4'],
      ['fist', 'r4c6'],
    ])
      expect(seller).toContain(`\`${p}\` = ${c}`);
    const seated = section(md, '#### Special poses sheet `grandpa_seated`');
    expect(seated).toContain('SEATED POSES: draw the seat together with the character');
    expect(seated).toContain('the SAME green armchair');
    expect(seated).toContain('same face, same outfit, same scale as the base sheet');
    for (const [p, c] of [
      ['idle', 'r2c1'],
      ['surprised', 'r2c3'],
      ['laugh', 'r2c4'],
      ['slumped', 'r2c6'],
    ])
      expect(seated).toContain(`\`${p}\` = ${c}`);
    expect(seated).toMatch(/ROW 2 — seated poses.*sitting in the green armchair, at rest/);
  });

  it('gives the mouth kits for the characters with mouths', () => {
    expect(md).toContain('#### Mouth kit `talk_grandpa` (poses: `idle`)');
    expect(md).toContain('`idle` → kit `grandpa_assis`, from `grandpa_seated/r2c1`');
    expect(md).toContain('Change ONLY the mouth');
  });

  it('groups the object images by sheet, states of one object together', () => {
    const home2 = section(md, '### Objects `home2`');
    expect(home2).toContain('- cell 3: pantry cupboard, state "locked"');
    expect(home2).toContain(
      '- cell 4: the SAME pantry cupboard as in ROW 1 cell 3 (same size, same angle, same position), state "open"',
    );
    expect(home2).toContain('- r1c3 `home2/r1c3` — pantry cupboard, state "locked" (exists — keep)');
    expect(section(md, '### Objects `pipes`')).toContain('seen from DIRECTLY ABOVE');
    expect(section(md, '### Objects `items`')).toContain('market token (inventory icon)');
    expect(sheets.filter((s) => s.kind === 'objects').map((s) => s.id)).toEqual(
      expect.arrayContaining(['home2', 'house', 'items', 'minigame', 'pipes', 'ui']),
    );
  });

  it('writes the backgrounds with LOCATION and EMPTY SPOTS, and the furniture sheets', () => {
    const dining = section(md, '### Background `decor/dining`');
    expect(dining).toContain('FORMAT: 1536 x 960 pixels (16:10).');
    expect(dining).toContain("LOCATION: Grandma's dining room at golden hour");
    expect(dining).toMatch(/EMPTY SPOTS: .*pantry cupboard.*teacup.*table \(furniture/);
    expect(dining).toMatch(/MUST SHOW.*bookshelf.*garden window/);
    expect(section(md, '### Background `decor/market_wide`')).toContain('LOCATION: A North African market street');
    const furn = section(md, '### Furniture `furniture_market`');
    expect(furn).toContain("ROW 1: stall left | stall mid | seller's stall");
    expect(furn).toContain('decor/market_wide.jpg');
  });

  it('ends with the checklist, in order', () => {
    const list = md.slice(md.indexOf('## Checklist'));
    const at = (s: string) => list.indexOf(s);
    expect(at('_reference.png')).toBeLessThan(at('Pixel:'));
    expect(at('Pixel:')).toBeLessThan(at('Grandma:'));
    expect(at('Grandma:')).toBeLessThan(at('Objects `home2`'));
    expect(at('Objects `home2`')).toBeLessThan(at('Background `decor/dining`'));
    expect(list).toContain('npm run assets');
  });

  it('puts poses the rooms use but no sprite provides on a new special sheet', () => {
    const g = structuredClone(game) as GameDef;
    g.rooms[2].on!.push({
      verb: 'push',
      a: 'seller',
      do: [{ pose: ['seller', 'happy_dance'] }, { anim: ['seller', 'sit_down'], ms: 500 }],
    });
    const r = buildPrompts({ game: g }, opts);
    const s = section(r.markdown, '#### New special poses sheet `seller_poses`');
    expect(s).toMatch(/ROW 1 — .*happy, big smile \(happy dance\).* \| .*sitting/);
    expect(s).toContain("happy_dance: ['seller_poses/r1c1'], sit_down: ['seller_poses/r1c2'],");
    expect(r.missing).toEqual([]);
  });
});

describe('npm run prompts --missing', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'prompts-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('on a copy of the art with one cell deleted, lists exactly that cell', () => {
    const art = join(tmp, 'art');
    cpSync(join(GAME_DIR, 'art'), art, { recursive: true });
    rmSync(join(art, 'home2', 'r1c4.png'));
    const r = buildPrompts({ game }, { ...opts, artDir: art, missing: true });
    expect(r.missing).toEqual(['home2/r1c4']);
    expect(r.sheets.filter((s) => s.missing.length).map((s) => s.id)).toEqual(['home2']);
    const md = r.markdown;
    expect(md).not.toMatch(/^### Objects `(?!home2)/m);
    expect(md).not.toContain('#### Base sheet');
    expect(md).not.toContain('### Background');
    const home2 = section(md, '### Objects `home2`');
    expect(home2).toContain('- cell 4: the SAME pantry cupboard as in ROW 1 cell 3');
    expect(home2).not.toContain('- cell 3: pantry cupboard');
    expect(home2).not.toContain('clock');
    expect(home2.match(/^- r\dc\d /gm)).toEqual(['- r1c4 ']);
    expect(md).toContain('python3 tools/cut-sheet.py games/demo/private/sheets/home2.png home2 --cells r1c4');
  });
});

describe('art style presets', () => {
  const colorBlock = COLOR_RULES.join('\n');

  it('cel (the demo): COLOR RULES in the style block and in every sheet prompt, clean cel shading, no pixel rules', () => {
    expect(readArtStyle(GAME_DIR)).toBe('cel');
    const md = buildPrompts({ game }, opts).markdown;
    const style = md.slice(md.indexOf('## Style block'), md.indexOf('\n## ', md.indexOf('## Style block') + 5));
    expect(style).toContain(colorBlock);
    expect(colorBlock).toContain(
      '- Hue-shift every ramp: highlights are brighter, slightly less saturated and shifted toward the warm light (yellow)',
    );
    expect(colorBlock).toContain(
      '- One single outline colour for the whole sheet (dark warm brown-black), consistent line weight.',
    );
    expect(section(md, '#### Base sheet `hero`')).toContain(colorBlock);
    expect(section(md, '### Objects `home2`')).toContain('COLOR RULES:');
    expect(section(md, '### Background `decor/dining`')).toContain('- One single outline colour for the whole image');
    expect(md).toContain('clean cel shading with flat tones');
    expect(md).not.toContain('soft cel shading');
    expect(md).not.toContain('PIXEL RULES');
    expect(md).toContain('- Art style: `cel`');
  });

  it('pixel: the STYLE sentence becomes retro pixel art and the strict rules are added, with the note that the tools enforce them', () => {
    const md = buildPrompts({ game }, { ...opts, artStyle: 'pixel' }).markdown;
    expect(md).toContain(
      'STYLE (characters): match exactly the art style of the attached reference sheet: retro pixel art in the spirit of 1990s LucasArts adventures',
    );
    expect(md).toContain('1 pixel = 1 pixel, crisp, no anti-aliasing');
    expect(md).not.toContain('clean cel shading with flat tones');
    expect(md).toContain(colorBlock);
    const hero = section(md, '#### Base sheet `hero`');
    expect(hero).toContain('PIXEL RULES — strict:');
    expect(hero).toContain(
      'The whole canvas is drawn on a 384 x 256 pixel grid (64 x 64 per 256 px cell), scaled up 4x with hard edges',
    );
    expect(hero).toContain('- Exact flat RGB values');
    expect(hero).toContain('- No anti-aliasing: no semi-transparent');
    expect(hero).toContain('- The same material keeps exactly the same RGB values on every frame and every cell.');
    expect(section(md, '### Background `decor/dining`')).toContain(
      'The whole image is drawn on a 384 x 240 pixel grid',
    );
    expect(md).toContain('the tools enforce the PIXEL RULES after generation');
    expect(md).toContain('- Art style: `pixel`');
  });

  it('reads artStyle from site.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'artstyle-'));
    try {
      expect(readArtStyle(dir)).toBe('cel');
      writeFileSync(join(dir, 'site.json'), JSON.stringify({ artStyle: 'pixel' }));
      expect(readArtStyle(dir)).toBe('pixel');
      writeFileSync(join(dir, 'site.json'), JSON.stringify({ artStyle: 'watercolour' }));
      expect(readArtStyle(dir)).toBe('cel');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
