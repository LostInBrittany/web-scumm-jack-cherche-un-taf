// Art prompts for the current game: `npm run prompts [--missing] [--out games/<id>/prompts.md]`.
// Reads the game module (characters, rooms, props, items, minigame params) and the art folder, and writes one
// ready-to-paste image-model prompt per sheet to generate, all sharing one STYLE block and one reference sheet, with
// the engine's pose rows (docs/en/PROMPTS.md). `--missing`: only the sheets with at least one image not cut yet.
// Also used by the MCP tool `asset_prompts` (tools/mcp/server.ts).
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CharacterDef, GameDef, Layout, PropDef, RoomDef } from '../src/engine/core/types';
import { normalizeExits } from '../src/engine/core/define';
import type { GameModule } from './game';
import { collectRefs } from './refs';

/** The default flat background of the sheets, when `site.json` has no valid `sheetBackground`. */
export const BG = '#2B2E45';

export interface PromptOptions {
  /** Game id, used in paths (`games/<id>/…`). */
  gameId: string;
  /** Game folder (layout/*.json, talk-kits.json). */
  gameDir: string;
  /** Art folder (default `<gameDir>/art`): what is already cut. */
  artDir?: string;
  /** Only the sheets with at least one missing image, and only their missing cells. */
  missing?: boolean;
  /** Room layouts (default: read from `<gameDir>/layout/<room>.json`), for "left / center / right" hints. */
  layouts?: Record<string, Layout>;
  /** Repository root, for the paths shown in the text (default: the parent of `games/`). */
  root?: string;
  /** Art style preset (default: `artStyle` of `<gameDir>/site.json`, else `cel`). */
  artStyle?: ArtStyle;
  /** Background of the sprite sheets (default: `sheetBackground` of `<gameDir>/site.json`, else {@link BG}). */
  sheetBackground?: SheetBackground;
}

/**
 * Art style preset, from `games/<id>/site.json` → `"artStyle"`. `cel` (default): painted cartoon, clean cel shading with
 * flat tones. `pixel`: retro pixel art drawn 4× up on the same canvas; the cutter scales it back down and fixes its
 * colours (`tools/cut-sheet.py`), `npm run assets` keeps it lossless and the engine draws it with hard edges.
 */
export type ArtStyle = 'cel' | 'pixel';

/** Pixel art: each art pixel is drawn as a SCALE × SCALE block (a 256 px cell is a 64 × 64 grid). */
export const PIXEL_SCALE = 4;

/** `artStyle` of `<gameDir>/site.json` (`cel` when absent, unreadable or unknown). */
export function readArtStyle(gameDir: string): ArtStyle {
  try {
    const s = JSON.parse(readFileSync(join(gameDir, 'site.json'), 'utf8'));
    return s?.artStyle === 'pixel' ? 'pixel' : 'cel';
  } catch {
    return 'cel';
  }
}

/**
 * Background of the sprite sheets, from `games/<id>/site.json` → `"sheetBackground"`: a flat `#RRGGBB` colour the
 * cutter keys out (default {@link BG}), or `transparent` for an image tool that writes real alpha (the cutter then
 * keeps the opaque pixels and keys nothing). Room backgrounds are not concerned. docs/en/PROMPTS.md, "Choosing the
 * sheet background".
 */
export type SheetBackground = 'transparent' | `#${string}`;

/**
 * `sheetBackground` of `<gameDir>/site.json`: `transparent`, or a `#RRGGBB` colour (upper case). {@link BG} when absent
 * or unreadable, and with a warning when the value is neither.
 */
export function readSheetBackground(gameDir: string): SheetBackground {
  let v: unknown;
  try {
    v = JSON.parse(readFileSync(join(gameDir, 'site.json'), 'utf8'))?.sheetBackground;
  } catch {
    return BG;
  }
  if (v === undefined) return BG;
  if (v === 'transparent') return v;
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return `#${v.slice(1).toUpperCase()}`;
  console.warn(
    `site.json: sheetBackground ${JSON.stringify(v)} is neither "transparent" nor a #RRGGBB colour; using ${BG}.`,
  );
  return BG;
}

export interface PromptSheet {
  /** Sheet id: the art subfolder it is cut into. */
  id: string;
  kind: 'character' | 'poses' | 'mouths' | 'objects' | 'background' | 'furniture' | 'other';
  /** Image ids of this sheet the game references but the art folder lacks. */
  missing: string[];
}

export interface PromptResult {
  markdown: string;
  /** Every image id the game references that is not in the art folder yet. */
  missing: string[];
  sheets: PromptSheet[];
}

// ------------------------------------------------------------------ the shared text (docs/en/PROMPTS.md)

interface StyleText {
  char: string;
  obj: string;
  bg: string;
}
const STYLES: Record<ArtStyle, StyleText> = {
  cel: {
    char: 'warm expressive cartoon caricature in the spirit of Day of the Tentacle and Monkey Island 2 remastered, clean dark outlines, clean cel shading with flat tones, head about one third of the body height, friendly and funny.',
    obj: 'same clean dark outlines, same clean cel shading with flat tones, same warm palette and level of detail, Day of the Tentacle / Monkey Island 2 remastered spirit, funny and friendly.',
    bg: 'match exactly the art style of the attached reference sheet (same clean dark outlines, clean cel shading with flat tones, warm saturated palette). A hand-painted background for a 1990s LucasArts point-and-click adventure, in the spirit of Day of the Tentacle and Monkey Island 2 remastered: cozy, funny, full of small details, but readable.',
  },
  pixel: {
    char: 'retro pixel art in the spirit of 1990s LucasArts adventures (Day of the Tentacle, Monkey Island 2), 1 pixel = 1 pixel, crisp, no anti-aliasing: a warm expressive cartoon caricature with a clean dark one-pixel outline and flat cel-shaded tones, head about one third of the body height, friendly and funny.',
    obj: 'same retro pixel art, 1 pixel = 1 pixel, crisp, no anti-aliasing, same dark one-pixel outline, same flat tones, same warm palette and level of detail, 1990s LucasArts spirit, funny and friendly.',
    bg: `match exactly the art style of the attached reference sheet (same retro pixel art, crisp, no anti-aliasing, same flat tones, warm saturated palette). A pixel-art background for a 1990s LucasArts point-and-click adventure, in the spirit of Day of the Tentacle and Monkey Island 2: drawn on a ${1536 / PIXEL_SCALE} x ${960 / PIXEL_SCALE} pixel grid and scaled up ${PIXEL_SCALE}x with hard edges; cozy, funny, full of small details, but readable.`,
  },
};
/** The colour discipline shared by every art style (docs/en/PROMPTS.md, "Common rules"). */
export const COLOR_RULES = [
  'COLOR RULES:',
  '- Use a limited palette. For each material (skin, hair, each garment, each object) use at most 4 flat tones: highlight, base, shadow, deep shadow.',
  '- Hue-shift every ramp: highlights are brighter, slightly less saturated and shifted toward the warm light (yellow); shadows are darker, more saturated and shifted toward cool purple. Never make highlights by adding white, never make shadows by adding black.',
  '- Flat, clearly separated areas: no gradients, no airbrush, no blur, no dithering.',
  '- One single outline colour for the whole sheet (dark warm brown-black), consistent line weight.',
  '- The same material keeps exactly the same tones on every cell of the sheet and on every animation frame.',
];
/** Pixel art only: the strict rules the cutter enforces afterwards. `grid`: what is drawn on the pixel grid. */
function pixelRules(grid: string): string[] {
  return [
    'PIXEL RULES — strict:',
    `- ${grid}, scaled up ${PIXEL_SCALE}x with hard edges: every art pixel is an exact ${PIXEL_SCALE} x ${PIXEL_SCALE} square of one single colour, aligned to the grid. No detail smaller than one art pixel.`,
    "- Exact flat RGB values: every pixel uses one of its material's tones exactly, never an in-between value.",
    '- No anti-aliasing: no semi-transparent, blended or soft pixels on any edge, not even against the background.',
    '- The same material keeps exactly the same RGB values on every frame and every cell.',
  ];
}
/** What the pixel grid is, for a canvas of w × h px (cells of 256 px, or a background). */
function pixelGrid(w: number, h: number, cells: boolean): string {
  const g = (n: number) => Math.round(n / PIXEL_SCALE);
  return `The whole ${cells ? 'canvas' : 'image'} is drawn on a ${g(w)} x ${g(h)} pixel grid${cells ? ` (${g(256)} x ${g(256)} per 256 px cell)` : ''}`;
}
/** The BACKGROUND line of every sheet prompt: a flat colour, or real transparency with the carved shapes kept opaque. */
function backgroundLine(bg: SheetBackground): string {
  return bg === 'transparent'
    ? 'BACKGROUND: fully transparent (alpha 0) over the whole canvas, saved as a PNG with an alpha channel. Never paint a checkerboard, a colour or a texture to show the transparency. Every pixel of a figure is fully opaque, including the inside of carved or open shapes (mouths, eyes): only the space around and between the figures is transparent. No floor, no cast shadow, no grid lines, no borders.'
    : `BACKGROUND: one single flat uniform color ${bg} over the whole canvas. No gradient, no texture, no vignette, no floor, no cast shadow on the background, no grid lines, no borders.`;
}
const NO_TEXT = 'DO NOT add any text, names, labels, numbers, logos or watermarks.';
const LIGHT = 'Consistent lighting from the upper left.';

type Cell = `r${number}c${number}`;
const CELL_RE = /^(.+)\/r(\d+)c(\d+)$/;
const cellKey = (r: number, c: number): Cell => `r${r}c${c}`;
function splitId(id: string): { sheet: string; name: string; row?: number; col?: number } {
  const m = CELL_RE.exec(id);
  if (m) return { sheet: m[1], name: `r${m[2]}c${m[3]}`, row: +m[2], col: +m[3] };
  const i = id.lastIndexOf('/');
  return { sheet: id.slice(0, i), name: id.slice(i + 1) };
}
const words = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim();
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const uniq = <T>(a: T[]) => [...new Set(a)];

// ------------------------------------------------------------------ sheet layouts (the engine's pose rows)

interface SheetLayout {
  kind: 'human' | 'cat';
  /** Engine pose that owns a cell in the standard layout. */
  owner(r: number, c: number): string;
  standard: string[];
  /** The ROW lines of the base prompt, rows 1 to 4. */
  rows: string[];
  /** One cell, for rows mixing standard cells and special poses. */
  cell(r: number, c: number): string;
  mapping: string;
  helper: string;
}

const WALK_ROW =
  'ROW 2 — walk cycle, full body, profile facing RIGHT, 6 consecutive frames of one smooth walk loop: contact | down | passing | up | contact (other leg) | passing (other leg)';
const WALK_CELLS = ['contact', 'down', 'passing', 'up', 'contact (other leg)', 'passing (other leg)'];

const HUMAN: SheetLayout = {
  kind: 'human',
  owner: (r, c) =>
    r === 1
      ? 'portrait'
      : r === 2
        ? 'walk'
        : r === 3
          ? ['front', 'back', 'idle', 'talk', 'point', 'use'][c - 1]
          : c <= 3
            ? 'walk_front'
            : 'walk_back',
  standard: ['portrait', 'walk', 'idle', 'talk', 'front', 'back', 'point', 'use', 'walk_front', 'walk_back'],
  rows: [
    'ROW 1 — head-and-shoulders portraits, facing the viewer: neutral | smiling | talking (mouth open) | laughing | surprised | thinking (hand on chin)',
    WALK_ROW,
    'ROW 3 — full-body poses: standing facing the viewer | standing seen from the back | standing facing right | talking facing right with one hand gesturing | pointing to the right | reaching forward to pick up or use an object',
    'ROW 4 — full-body walk: walking toward the viewer (3 frames) | walking away from the viewer, seen from the back (3 frames)',
  ],
  cell: (r, c) =>
    r === 1
      ? `head-and-shoulders portrait facing the viewer, ${['neutral', 'smiling', 'talking (mouth open)', 'laughing', 'surprised', 'thinking (hand on chin)'][c - 1]}`
      : r === 2
        ? `walk cycle facing RIGHT, ${WALK_CELLS[c - 1]}`
        : r === 3
          ? [
              'standing facing the viewer',
              'standing seen from the back',
              'standing facing right',
              'talking facing right with one hand gesturing',
              'pointing to the right',
              'reaching forward to pick up or use an object',
            ][c - 1]
          : c <= 3
            ? `walking toward the viewer, frame ${c} of 3`
            : `walking away from the viewer, seen from the back, frame ${c - 3} of 3`,
  mapping:
    'portrait = r1c2; walk = r2c1–r2c6; front = r3c1; back = r3c2; idle = r3c3; talk = r3c4; point = r3c5; use = r3c6; walk_front = r4c1–r4c3; walk_back = r4c4–r4c6',
  helper: 'human',
};

const CAT: SheetLayout = {
  kind: 'cat',
  owner: (r, c) =>
    r === 1
      ? 'portrait'
      : r === 2
        ? 'walk'
        : r === 3
          ? ['front', 'back', 'idle', 'curl', 'stretch', 'jump'][c - 1]
          : c <= 3
            ? 'sleep'
            : 'eat',
  standard: ['portrait', 'walk', 'idle', 'talk', 'front', 'back', 'sleep', 'curl', 'stretch', 'jump', 'eat'],
  rows: [
    'ROW 1 — head-and-shoulders portraits, facing the viewer: neutral | smiling | meowing (mouth open) | purring, eyes closed, happy | surprised, ears up | curious, head tilted',
    WALK_ROW,
    'ROW 3 — full-body poses: sitting facing the viewer | sitting seen from the back | sitting at rest in profile facing right | curled up in a ball | stretching, front paws forward and rear up | jumping, body stretched in the air',
    'ROW 4 — full body, profile facing RIGHT: sleeping curled up, 3 frames of slow breathing | eating from a small bowl, 3 frames',
  ],
  cell: (r, c) =>
    r === 1
      ? `head portrait facing the viewer, ${['neutral', 'smiling', 'meowing (mouth open)', 'purring, eyes closed, happy', 'surprised, ears up', 'curious, head tilted'][c - 1]}`
      : r === 2
        ? `walk cycle facing RIGHT, ${WALK_CELLS[c - 1]}`
        : r === 3
          ? [
              'sitting facing the viewer',
              'sitting seen from the back',
              'sitting at rest in profile facing right',
              'curled up in a ball',
              'stretching, front paws forward and rear up',
              'jumping, body stretched in the air',
            ][c - 1]
          : c <= 3
            ? `sleeping curled up, breathing frame ${c} of 3`
            : `eating from a small bowl, frame ${c - 3} of 3`,
  mapping:
    'portrait = r1c2; walk = r2c1–r2c6; front = r3c1; back = r3c2; idle = r3c3; curl = r3c4; stretch = r3c5; jump = r3c6; sleep = r4c1–r4c3; eat = r4c4–r4c6',
  helper: 'cat',
};

/** Words for common special poses; anything else falls back to its name in words. */
const POSE_WORDS: Record<string, string> = {
  idle: 'at rest, relaxed',
  talk: 'talking with one hand gesturing',
  laugh: 'laughing out loud, head thrown back',
  surprised: 'surprised, eyes wide, eyebrows up',
  panic: 'panicking, both hands on the cheeks',
  celebrate: 'celebrating, both fists up in the air',
  pinch: 'pinching the nose with two fingers, grimacing',
  thumbs: 'thumbs up, big grin',
  wrench: 'holding a big wrench on the shoulder',
  welcome: 'welcoming, both arms wide open',
  offering: 'offering something on an open hand, arm stretched forward',
  fist: 'shaking a fist in the air',
  slumped: 'slumped down, dozing, eyes closed',
  sleep: 'sleeping, eyes closed',
  eat: 'eating',
  sit: 'sitting',
  seated: 'sitting',
  wave: 'waving hello',
  cry: 'crying, tears flying',
  angry: 'angry, fists clenched',
  sad: 'sad, shoulders down',
  think: 'thinking, hand on chin',
  shrug: 'shrugging',
  dance: 'dancing, one leg up',
  jump: 'jumping high, knees tucked',
  run: 'running, profile facing RIGHT',
  sneak: 'sneaking on tiptoes',
  kneel: 'kneeling',
  crouch: 'crouching low',
  point: 'pointing to the right',
  use: 'reaching forward to use an object',
  front: 'facing the viewer',
  back: 'seen from the back',
  shocked: 'shocked, mouth wide open',
  proud: 'proud, chest out, hands on the hips',
  scared: 'scared, trembling',
  happy: 'happy, big smile',
  yawn: 'yawning, arms stretched',
  read: 'reading',
  phone: 'talking on the phone',
  drink: 'drinking from a cup',
};
const SEAT_RE = /\b(sit|sitting|seat|seated|assis|armchair|chair|bench|sofa|stool)\b/;
function poseWords(pose: string, seated: boolean): string {
  const parts = pose.toLowerCase().split(/[_-]+/);
  const known = POSE_WORDS[pose.toLowerCase()] ?? POSE_WORDS[parts[0]];
  let w = known && parts.length === 1 ? known : known ? `${known} (${words(pose)})` : words(pose);
  if (/^(hold|holding|with)$/.test(parts[0]) && parts.length > 1) w = `holding a ${parts.slice(1).join(' ')}`;
  return seated && !/sitting/.test(w) ? `sitting, ${w}` : w;
}

// ------------------------------------------------------------------ helpers

function walkPoses(v: unknown, who: (w: string) => string, out: [string, string][]) {
  if (Array.isArray(v)) {
    v.forEach((x) => walkPoses(x, who, out));
    return;
  }
  if (!v || typeof v !== 'object') return;
  const o = v as Record<string, unknown>;
  for (const k of ['pose', 'anim']) {
    const p = o[k];
    if (Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string')
      out.push([who(p[0]), p[1]]);
  }
  for (const x of Object.values(o)) walkPoses(x, who, out);
}

function fence(body: string[]): string {
  return ['```text', ...body, '```'].join('\n');
}

function where(x: number, y?: number, onFurniture?: boolean): string {
  const h = x < 213 ? 'left' : x < 427 ? 'center' : 'right';
  if (onFurniture) return `${h}, on a piece of furniture`;
  if (y === undefined) return h;
  return y < 232 ? `${h}, up on the back wall` : y < 300 ? `${h}, at the back of the floor` : `${h}, in the foreground`;
}

// ------------------------------------------------------------------ main

export function buildPrompts(mod: Pick<GameModule, 'game' | 'extraImages'>, opts: PromptOptions): PromptResult {
  const game: GameDef = normalizeExits(mod.game); // declared exits are hotspots the backgrounds must show
  const gid = opts.gameId;
  const artStyle: ArtStyle = opts.artStyle ?? readArtStyle(opts.gameDir);
  const pixel = artStyle === 'pixel';
  const { char: STYLE_CHAR, obj: STYLE_OBJ, bg: STYLE_BG } = STYLES[artStyle];
  const sheetBg: SheetBackground = opts.sheetBackground ?? readSheetBackground(opts.gameDir);
  const transparent = sheetBg === 'transparent';
  const BACKGROUND_LINE = backgroundLine(sheetBg);
  const EMPTY = transparent ? 'EMPTY (transparent background only)' : 'EMPTY (flat background only)';
  /** Colour rules (every style) and, for pixel art, the strict pixel rules, for a sheet of 256 px cells or a background. */
  const colorLines = (w = 1536, h = 1024, cells = true) => [
    ...COLOR_RULES,
    ...(pixel ? pixelRules(pixelGrid(w, h, cells)) : []),
  ];
  const artDir = opts.artDir ?? join(opts.gameDir, 'art');
  const root = opts.root ?? resolve(opts.gameDir, '..', '..');
  const rel = (p: string) => relative(root, p) || '.';
  const artRel = rel(artDir);
  const onlyMissing = !!opts.missing;
  const has = (id: string) => ['.png', '.jpg', '.jpeg', '.webp'].some((e) => existsSync(join(artDir, id + e)));
  const fileOf = (id: string) => {
    const e = ['.png', '.jpg', '.jpeg', '.webp'].find((x) => existsSync(join(artDir, id + x)));
    return `${artRel}/${id}${e ?? '.png'}`;
  };
  const layouts: Record<string, Layout> = { ...(opts.layouts ?? {}) };
  for (const r of game.rooms) {
    if (layouts[r.id]) continue;
    const f = join(opts.gameDir, 'layout', `${r.id}.json`);
    if (existsSync(f))
      try {
        layouts[r.id] = JSON.parse(readFileSync(f, 'utf8'));
      } catch {
        /* a broken layout only loses the position hints */
      }
  }
  const refs = collectRefs(mod).images;
  const sheets: PromptSheet[] = [];
  const steps: { order: number; text: string }[] = [];
  const out: string[] = [];
  const privateDir = `games/${gid}/private/sheets`;

  // ---------------------------------------------------------------- reference
  const heroId = game.hero;
  const chars = Object.entries(game.characters).sort(([a], [b]) => (a === heroId ? -1 : b === heroId ? 1 : 0));
  const baseSheetOf = (c: CharacterDef): string | undefined => {
    if (c.portrait) return splitId(c.portrait).sheet;
    const n: Record<string, number> = {};
    Object.values(c.sprites ?? {})
      .flat()
      .forEach((id) => {
        const s = splitId(id).sheet;
        n[s] = (n[s] ?? 0) + 1;
      });
    return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const heroSheet = game.characters[heroId] ? baseSheetOf(game.characters[heroId]) : undefined;
  const refFile = `${artRel}/_reference.png`;
  const hasRef = existsSync(join(artDir, '_reference.png'));
  const heroCut = heroSheet ? existsSync(join(artDir, heroSheet)) && has(`${heroSheet}/r3c3`) : false;
  const refName = hasRef
    ? refFile
    : heroCut
      ? `the hero's validated sheet (the image you cut into ${artRel}/${heroSheet}/)`
      : `${refFile} (not made yet: see "Reference sheet" below)`;
  const attachChar = hasRef
    ? `\`${refFile}\``
    : heroCut
      ? `the hero's validated sheet (the original image cut into \`${artRel}/${heroSheet}/\`)`
      : `\`${refFile}\``;

  out.push(
    `# Art prompts — ${game.title}`,
    '',
    `Generated by \`npm run prompts${onlyMissing ? ' -- --missing' : ''}\` from the game's content (\`games/${gid}/\`) and its art folder (\`${artRel}/\`). ` +
      'Do not edit by hand: change the game (`description` on characters and rooms, `furniture` on rooms) and run it again.',
    '',
    'Each section is one sheet to ask an image model for. Paste the fenced block as-is, attach the files it names, save ' +
      `the image under \`${privateDir}/<sheet>.png\` (gitignored), then cut it with the command of the checklist at the end.`,
    '',
  );

  out.push(
    '## Style block',
    '',
    'Every prompt below already contains these lines; they are what keeps all the sheets of the game consistent. ' +
      `Attach the reference sheet to every prompt: ${refName}.`,
    '',
    fence([
      `STYLE (characters): match exactly the art style of the attached reference sheet: ${STYLE_CHAR}`,
      `STYLE (objects): match exactly the art style of the attached reference sheet: ${STYLE_OBJ} Objects are shown in a 3/4 view from slightly above.`,
      `STYLE (backgrounds): ${STYLE_BG}`,
      ...colorLines(),
      BACKGROUND_LINE,
      `${NO_TEXT} ${LIGHT}`,
    ]),
    '',
    `- Art style: \`${artStyle}\` (\`artStyle\` in \`games/${gid}/site.json\`: \`cel\` or \`pixel\`).`,
    ...(pixel
      ? [
          `- Pixel art: the tools enforce the PIXEL RULES after generation. \`tools/cut-sheet.py\` (it reads \`artStyle\`) scales each cell down ${PIXEL_SCALE}× with nearest neighbour, ` +
            'merges near-identical colours into one exact value and keeps at most 32 colours per cell (indexed PNG); `npm run assets` writes lossless WebP ' +
            `and scales full-size backgrounds down ${PIXEL_SCALE}× the same way; set \`skin: { pixelArt: true }\` in the game so the engine draws every image with hard edges.`,
        ]
      : []),
    transparent
      ? '- Background: transparent (`sheetBackground` in `site.json`); the cutter keeps the opaque pixels and keys nothing. Light from the upper left.'
      : `- Background color: flat \`${sheetBg}\` (the cutter keys it out). Light from the upper left.`,
    "- Never write a brand or a famous character's name: describe the thing instead.",
    '- Object states: same size, same angle, same position from one cell to the next; only the described change differs.',
    '- Cut only the new cells (`--cells`); never re-cut a validated sheet.',
    '',
  );

  if (!hasRef) {
    out.push(
      '## Reference sheet',
      '',
      heroCut
        ? `\`${refFile}\` does not exist: attach the hero's validated sheet instead (the original image cut into \`${artRel}/${heroSheet}/\`), ` +
            `or save a copy of it as \`${refFile}\` so every prompt can name it.`
        : `Nothing is drawn yet. Generate the hero's base sheet first (next section): its prompt has no attachment. Once validated, ` +
            `save that image as \`${refFile}\`: it is the reference for every other sheet.`,
      '',
    );
    steps.push({
      order: 0,
      text: heroCut
        ? `Copy the hero's validated sheet to \`${refFile}\`.`
        : `Generate the hero's base sheet with no attachment and save it as \`${refFile}\` (it becomes the reference).`,
    });
  }

  // ---------------------------------------------------------------- characters
  const charsAt = out.length;
  out.push('## Characters', '');
  const roomPoses: [string, string][] = [];
  for (const r of game.rooms) {
    const actorChar = (w: string) => (w === 'hero' ? heroId : (r.actors?.[w]?.char ?? w));
    walkPoses(r, actorChar, roomPoses);
    for (const a of Object.values(r.actors ?? {})) if (a.pose) roomPoses.push([a.char, a.pose]);
  }
  walkPoses([game.rules, game.start], (w) => (w === 'hero' ? heroId : w), roomPoses);

  const charImages = new Set<string>();
  const ownedSheets = new Map<string, string>();
  let charIndex = 0;
  for (const [cid, c] of chars) {
    const base = baseSheetOf(c);
    const all = [
      c.portrait,
      ...Object.values(c.sprites ?? {}).flat(),
      ...(c.variants ?? []).flatMap((v) => [v.portrait, ...Object.values(v.sprites ?? {}).flat()]),
    ].filter((x): x is string => !!x);
    all.forEach((x) => charImages.add(x));
    Object.values(c.mouths ?? {})
      .concat((c.variants ?? []).flatMap((v) => Object.values(v.mouths ?? {})))
      .forEach((m) => [m.closed, ...m.open, m.blink, m.smile].forEach((x) => x && charImages.add(x)));
    if (!base) {
      if (!onlyMissing) out.push(`### ${c.name} (\`${cid}\`)`, '', 'No portrait and no sprites: nothing to draw.', '');
      continue;
    }
    if (ownedSheets.has(base) && !c.sprites) {
      if (!onlyMissing)
        out.push(
          `### ${c.name} (\`${cid}\`)`,
          '',
          `Reuses the sheet \`${base}\` of \`${ownedSheets.get(base)}\`: nothing to draw.`,
          '',
        );
      continue;
    }
    ownedSheets.set(base, cid);
    const layout =
      (c.kind ?? []).includes('cat') || (c.sprites && 'sleep' in c.sprites && 'curl' in c.sprites) ? CAT : HUMAN;
    const isHero = cid === heroId;
    const order = isHero ? 1 : 2;
    const desc = c.description?.trim()
      ? sentence(c.description)
      : '<describe: age, hair, glasses, build, outfit, signature accessory, personality>';
    const seatMatch = /(?:\b[a-z]+\s)?\b(armchair|chair|bench|sofa|stool|throne|wheelchair|rocking chair)\b/i.exec(
      c.description ?? '',
    );
    const seat = seatMatch ? seatMatch[0].replace(/^(a|an|the|his|her|their|in)\s/i, '') : '<the seat>';

    // Every mapped cell: sheet → cell → uses.
    interface Use {
      pose: string;
      frame: number;
      frames: number;
      standard: boolean;
      variant?: number;
    }
    const cells = new Map<string, Map<Cell, Use[]>>();
    const named = new Map<string, Use[]>();
    const add = (id: string, u: Omit<Use, 'standard'>) => {
      const s = splitId(id);
      if (s.row === undefined) {
        named.set(id, [...(named.get(id) ?? []), { ...u, standard: false }]);
        return;
      }
      const owner = layout.owner(s.row, s.col!);
      const standard =
        s.sheet === base &&
        s.row <= 4 &&
        s.col! <= 6 &&
        layout.standard.includes(u.pose) &&
        layout.standard.includes(owner);
      const m = cells.get(s.sheet) ?? new Map<Cell, Use[]>();
      m.set(cellKey(s.row, s.col!), [...(m.get(cellKey(s.row, s.col!)) ?? []), { ...u, standard }]);
      cells.set(s.sheet, m);
    };
    if (c.portrait) add(c.portrait, { pose: 'portrait', frame: 1, frames: 1 });
    for (const [pose, ids] of Object.entries(c.sprites ?? {}))
      ids.forEach((id, i) => add(id, { pose, frame: i + 1, frames: ids.length }));
    (c.variants ?? []).forEach((v, vi) => {
      if (v.portrait) add(v.portrait, { pose: 'portrait', frame: 1, frames: 1, variant: vi + 1 });
      for (const [pose, ids] of Object.entries(v.sprites ?? {}))
        ids.forEach((id, i) => add(id, { pose, frame: i + 1, frames: ids.length, variant: vi + 1 }));
    });
    if (!cells.has(base)) cells.set(base, new Map());

    // Poses the game asks for that no sprite provides: a new special sheet.
    const known = new Set([
      ...Object.keys(c.sprites ?? {}),
      ...(c.variants ?? []).flatMap((v) => Object.keys(v.sprites ?? {})),
      'portrait',
    ]);
    const unassigned = uniq(
      roomPoses
        .filter(([w, p]) => w === cid && !known.has(p) && !(layout.standard.includes(p) && !c.sprites))
        .map(([, p]) => p),
    );
    const newSheet = `${base}_poses`;
    unassigned.forEach((p, i) => {
      const m = cells.get(newSheet) ?? new Map<Cell, Use[]>();
      m.set(cellKey(Math.floor(i / 6) + 1, (i % 6) + 1), [{ pose: p, frame: 1, frames: 1, standard: false }]);
      cells.set(newSheet, m);
    });

    const beforeHead = out.length;
    out.push(`### ${c.name} (\`${cid}\`)${isHero ? ' — the hero' : ''}`, '');
    if (!c.description)
      out.push(
        `> No \`description\` in cast.ts for \`${cid}\`: fill the CHARACTER line yourself, or add \`description\` and run again.`,
        '',
      );
    const afterHead = out.length;
    const variantNote = (vi?: number) =>
      vi ? ` (variant ${vi}, shown when ${JSON.stringify(c.variants![vi - 1].if)})` : '';

    const sheetOrder = [base, ...[...cells.keys()].filter((s) => s !== base)];
    for (const sheet of sheetOrder) {
      const m = cells.get(sheet)!;
      const isBase = sheet === base;
      const isNew = sheet === newSheet && unassigned.length > 0;
      const mappedIds = [...m.keys()].map((k) => `${sheet}/${k}`);
      const missingIds = mappedIds.filter((id) => !has(id));
      if (onlyMissing && !missingIds.length) continue;
      const want = (k: Cell) => m.has(k) && (!onlyMissing || !has(`${sheet}/${k}`));
      const seatedSheet = SEAT_RE.test(words(sheet.toLowerCase()));
      const isSeated = (u: Use) => seatedSheet || SEAT_RE.test(words(u.pose.toLowerCase()));
      const anySeated = [...m.values()].flat().some((u) => !u.standard && isSeated(u));
      const maxRow = Math.max(4, ...[...m.keys()].map((k) => +k.slice(1, k.indexOf('c'))));

      const describe = (u: Use): string => {
        if (u.standard) return '';
        const w = poseWords(u.pose, isSeated(u));
        const seatW = isSeated(u) ? `${w.replace(/^sitting,?\s*/, `sitting in the ${seat}, `)}` : w;
        const frame = u.frames > 1 ? `, frame ${u.frame} of ${u.frames}` : '';
        const facing = /front|viewer|back|portrait/.test(u.pose)
          ? ''
          : isSeated(u)
            ? ', three-quarter view turned to the RIGHT'
            : ', turned to the RIGHT';
        return u.pose === 'portrait'
          ? 'head-and-shoulders portrait facing the viewer, smiling'
          : `${seatW}${facing}${frame}`;
      };

      const rows: string[] = [];
      for (let r = 1; r <= maxRow; r++) {
        const ks = [1, 2, 3, 4, 5, 6].map((col) => cellKey(r, col));
        const uses = ks.flatMap((k) => m.get(k) ?? []);
        const wanted = ks.filter(want);
        const allStd = uses.every((u) => u.standard);
        const canonical = r <= 4 && allStd && (isBase || uses.length > 0);
        if (canonical && (!onlyMissing ? true : wanted.length === ks.length)) {
          rows.push(layout.rows[r - 1]);
          continue;
        }
        if (!wanted.length && !(isBase && !onlyMissing && allStd)) {
          rows.push(`ROW ${r} — ${EMPTY}`);
          continue;
        }
        const label = isSeated(
          uses.find((u) => !u.standard) ?? uses[0] ?? { pose: '', frame: 1, frames: 1, standard: true },
        )
          ? 'seated poses, character and seat as one single figure group'
          : 'full-body special poses';
        rows.push(
          `ROW ${r} — ${label}: ` +
            ks
              .map((k) => {
                if (!want(k))
                  return isBase && !onlyMissing && r <= 4 && !m.has(k) && allStd
                    ? layout.cell(r, +k.slice(k.indexOf('c') + 1))
                    : EMPTY;
                const u = m.get(k)!;
                const std = u.find((x) => x.standard);
                return std ? layout.cell(r, +k.slice(k.indexOf('c') + 1)) : describe(u[0]);
              })
              .join(' | '),
        );
      }

      const sheetTitle = isBase
        ? `Base sheet \`${sheet}\` (6 × 4, SCUMM poses)`
        : `${isNew ? 'New special poses sheet' : 'Special poses sheet'} \`${sheet}\` (6 × ${maxRow})`;
      out.push(`#### ${sheetTitle}`, '');
      const first = isHero && isBase && !hasRef && !heroCut;
      const attach = [
        first ? 'nothing (this sheet becomes the reference)' : attachChar,
        ...(isBase ? [] : [`the validated base sheet of ${c.name} (\`${artRel}/${base}/\`)`]),
      ];
      const existingSeated = anySeated ? mappedIds.filter((id) => has(id)) : [];
      if (existingSeated.length)
        attach.push(`one already cut seated cell (\`${fileOf(existingSeated[0])}\`), so the seat stays the same`);
      out.push(`Attach: ${attach.join(', ')}.`, '');
      const body: string[] = [];
      if (isBase) {
        body.push(
          'Create a pixel-art character sprite sheet for a point-and-click adventure game.',
          first
            ? `STYLE: ${STYLE_CHAR.replace(/^w/, 'W')}`
            : `STYLE: match exactly the art style of the first attached image (reference sheet): ${STYLE_CHAR}`,
          `CHARACTER: ${desc}`,
          'SHEET LAYOUT — follow it strictly:',
          '- Canvas 1536 x 1024 pixels, landscape.',
          '- An invisible grid of 6 columns x 4 rows, every cell exactly 256 x 256 pixels. One figure per cell, centered horizontally.',
          layout.kind === 'cat'
            ? '- Full-body figures (rows 2 to 4) all at the SAME scale, the body about 200 pixels long in profile, paws resting on the same baseline 16 pixels above the bottom of each cell.'
            : '- Full-body figures (rows 2 to 4) all at the SAME scale, about 220 pixels tall, feet resting on the same baseline 16 pixels above the bottom of each cell.',
          '- Leave empty space around each figure: nothing may touch or cross a cell border.',
        );
        body.push(
          ...rows,
          ...colorLines(),
          BACKGROUND_LINE,
          `${NO_TEXT} Same outfit, same colors and same proportions in all 24 cells. ${LIGHT}`,
        );
      } else {
        body.push(
          `Create a pixel-art character sprite sheet for a point-and-click adventure game: SPECIAL POSES of the character of the attached base sheet (same face, same outfit, same scale as the base sheet).`,
          `STYLE: match exactly the art style of the attached reference sheet: ${STYLE_CHAR}`,
          `CHARACTER: ${desc}`,
          `LAYOUT: canvas 1536 x ${maxRow * 256}, 6 columns x ${maxRow} rows of 256 x 256 cells, one figure per cell, feet on the baseline 16 pixels above the bottom of each cell (except jumps, which rise above it), nothing touching the borders.`,
        );
        if (anySeated)
          body.push(
            `SEATED POSES: draw the seat together with the character, as one single figure group: the SAME ${seat}, at the same size, angle and position in every seated cell, resting on the baseline. Only the character's pose changes.`,
          );
        body.push(
          ...rows,
          ...colorLines(1536, maxRow * 256),
          BACKGROUND_LINE.replace(' over the whole canvas', ''),
          `${NO_TEXT} Same face, same outfit, same scale as the base sheet in every cell. ${LIGHT}`,
        );
      }
      out.push(fence(body), '');

      // What the cut gives the engine.
      const byPose = new Map<string, string[]>();
      for (const [k, us] of m)
        for (const u of us)
          byPose.set(u.pose + variantNote(u.variant), [...(byPose.get(u.pose + variantNote(u.variant)) ?? []), k]);
      const cellSort = (a: string, b: string) => {
        const x = splitId(`s/${a}`),
          y = splitId(`s/${b}`);
        return x.row! - y.row! || x.col! - y.col!;
      };
      const lines = [...byPose]
        .map(([p, ks0]) => {
          const ks = [...ks0].sort(cellSort);
          const miss = ks.filter((k) => !has(`${sheet}/${k}`));
          const extra = [...m.values()].flat().find((u) => u.pose + variantNote(u.variant) === p && !u.standard);
          const d = extra ? ` — ${describe(extra).replace(/, frame \d+ of \d+$/, '')}` : '';
          if (onlyMissing && !miss.length) return '';
          return `- \`${p}\` = ${ks.join(', ')}${d}${miss.length ? ` (missing: ${miss.join(', ')})` : ' (exists — keep)'}`;
        })
        .filter(Boolean);
      out.push(
        isBase ? `Engine poses from this sheet (cast.ts):` : 'Engine poses from this sheet, cell by cell:',
        '',
        ...lines,
      );
      if (isBase && !onlyMissing) {
        const usedStd = new Set(
          [...m.values()]
            .flat()
            .filter((u) => u.standard)
            .map((u) => u.pose),
        );
        const taken = new Set(m.keys());
        const canonicalCells = (p: string) =>
          [1, 2, 3, 4].flatMap((r) =>
            [1, 2, 3, 4, 5, 6].filter((col) => layout.owner(r, col) === p).map((col) => cellKey(r, col)),
          );
        const unused = layout.standard.filter(
          (p) =>
            !usedStd.has(p) &&
            !(p === 'talk' && layout.kind === 'cat') &&
            p !== 'talk' &&
            !canonicalCells(p).some((k) => taken.has(k) && m.get(k)!.some((u) => !u.standard)),
        );
        if (unused.length)
          out.push(
            `- Standard cells cast.ts does not use yet: ${unused.join(', ')} (\`${layout.helper}('${sheet}')\` maps them: ${layout.mapping}).`,
          );
      }
      if (isNew) {
        out.push(
          '',
          `These poses are used by the rooms but no sprite provides them. After cutting, add to \`sprites\` in cast.ts:`,
          '',
          '```ts',
          unassigned.map((p, i) => `${p}: ['${newSheet}/${cellKey(Math.floor(i / 6) + 1, (i % 6) + 1)}'],`).join(' '),
          '```',
        );
      }
      out.push('');
      sheets.push({ id: sheet, kind: isBase ? 'character' : 'poses', missing: missingIds });
      const cutCells =
        missingIds.length && missingIds.length < mappedIds.length
          ? ` --cells ${missingIds.map((x) => splitId(x).name).join(',')}`
          : '';
      steps.push({
        order,
        text: missingIds.length
          ? `${c.name}: generate \`${sheet}\`, then \`python3 tools/cut-sheet.py ${privateDir}/${sheet}.png ${sheet}${maxRow > 4 ? ` --grid 6x${maxRow}` : ''}${cutCells}\`.`
          : `${c.name}: \`${sheet}\` is already cut (keep it).`,
      });
      charIndex++;
    }
    if (named.size)
      out.push(
        `Named sprites (not on a grid, cut them by hand): ${[...named.keys()].map((x) => `\`${x}\``).join(', ')}.`,
        '',
      );

    // Mouth kit.
    const mouthSets = Object.entries(c.mouths ?? {});
    if (mouthSets.length) {
      const kitsFile = join(opts.gameDir, 'talk-kits.json');
      let kits: Record<string, Record<string, string>> = {};
      try {
        kits = existsSync(kitsFile) ? JSON.parse(readFileSync(kitsFile, 'utf8')) : {};
      } catch {
        /* rewritten below */
      }
      const rowsM = mouthSets.map(([pose, ms]) => {
        const s = splitId(ms.closed);
        const folder = s.sheet.split('/')[0];
        const dir = s.sheet.split('/').slice(1).join('/') || pose;
        const kitChar = folder.replace(/^talk_/, '');
        const src =
          c.sprites?.[pose]?.[0] ??
          (c.variants ?? []).map((v) => v.sprites?.[pose]?.[0]).find(Boolean) ??
          `${base}/r3c3`;
        const frames = [ms.closed, ...ms.open, ms.blink, ms.smile].filter((x): x is string => !!x);
        return {
          pose,
          dir,
          kitChar,
          src,
          frames,
          missing: frames.filter((f) => !has(f)),
          inKits: kits[kitChar]?.[dir] === src,
        };
      });
      const missingM = rowsM.flatMap((x) => x.missing);
      if (!onlyMissing || missingM.length) {
        const kitChar = rowsM[0].kitChar;
        out.push(
          `#### Mouth kit \`talk_${kitChar}\` (poses: ${rowsM.map((x) => `\`${x.pose}\``).join(', ')})`,
          '',
          'The body never changes while a character talks: only the mouth. The image model only supplies mouths, pasted back onto the validated sprite.',
          '',
          ...rowsM.map(
            (x) =>
              `- \`${x.pose}\` → kit \`${x.kitChar}_${x.dir}\`, from \`${x.src}\`, frames \`talk_${x.kitChar}/${x.dir}/t1..t6\`${x.missing.length ? ` (missing: ${x.missing.map((f) => splitId(f).name).join(', ')})` : ' (exists — keep)'}`,
          ),
          '',
          `1. \`games/${gid}/talk-kits.json\` needs: \`"${kitChar}": ${JSON.stringify(Object.fromEntries(rowsM.map((x) => [x.dir, x.src])))}\`${rowsM.every((x) => x.inKits) ? ' (already there)' : ' (add it)'}.`,
          `2. \`python3 tools/talk-kit.py ${kitChar}\` writes one kit per pose to \`games/${gid}/private/talk_kits/\`.`,
          `3. Send each kit to the image model, one per message, with the prompt below; save the reply as \`${kitChar}_<pose>_out.png\` next to the kit.`,
          `4. \`python3 tools/talk-apply.py ${kitChar}_<pose>\` for each pose (${rowsM.map((x) => `\`${kitChar}_${x.dir}\``).join(', ')}).`,
          '',
          fence([
            'This image is a grid of 6 identical cartoon portraits (3 columns x 2 rows).',
            'Keep EVERYTHING exactly identical in all 6 cells: same drawing, same size, same position, same colors, same style, same background, same image size (1536 x 1024).',
            'Change ONLY the mouth, and the eyes in cell 5:',
            '- cell 1 (top left): unchanged, mouth closed',
            '- cell 2 (top middle): mouth slightly open, talking',
            '- cell 3 (top right): mouth open, talking',
            '- cell 4 (bottom left): mouth wide open, exclaiming',
            '- cell 5 (bottom middle): eyes gently closed (blinking), mouth closed',
            '- cell 6 (bottom right): mouth closed, small warm smile',
            'Do not redraw, move, resize or recolor anything else. No text.',
          ]),
          '',
        );
        sheets.push({ id: `talk_${kitChar}`, kind: 'mouths', missing: missingM });
        steps.push({
          order,
          text: missingM.length
            ? `${c.name}: mouth kit — \`python3 tools/talk-kit.py ${kitChar}\`, one message per kit, then \`python3 tools/talk-apply.py ${kitChar}_<pose>\`.`
            : `${c.name}: mouths \`talk_${kitChar}\` already done (keep them).`,
        });
      }
    }
    // --missing: a character with nothing to draw leaves no empty heading.
    if (onlyMissing && out.length === afterHead) out.length = beforeHead;
  }
  void charIndex;
  if (out.length === charsAt + 2) out.length = charsAt;

  // ---------------------------------------------------------------- labels for objects
  const labels = new Map<string, string[]>();
  const label = (id: string | undefined, l: string) => {
    if (id) labels.set(id, uniq([...(labels.get(id) ?? []), l]));
  };
  const roomsOf = new Map<string, string[]>();
  const furnitureOf = new Map<string, { room: RoomDef; label: string }[]>();
  const isFurniture = (id: string) => /^furniture_/.test(id);
  const sameAs = new Map<string, string>();
  for (const r of game.rooms) {
    const pieces = new Set<string>(r.furniture ?? []);
    for (const [pid, p] of Object.entries(r.props ?? {}) as [string, PropDef][]) {
      const name = p.name ?? words(pid);
      const ids = p.img ? [p.img] : [];
      const states = Object.entries(p.states ?? {});
      if (states.length) {
        const ordered = p.initial
          ? [...states.filter(([s]) => s === p.initial), ...states.filter(([s]) => s !== p.initial)]
          : states;
        const [, first] = ordered[0];
        ordered.forEach(([s, id], i) => {
          if (i === 0) label(id, `${name}, state "${s}"`);
          else {
            label(id, `the SAME ${name} (same size, same angle, same position), state "${s}"`);
            sameAs.set(id, first);
          }
          ids.push(id);
        });
      } else if (p.img) label(p.img, name);
      for (const id of ids) {
        roomsOf.set(id, uniq([...(roomsOf.get(id) ?? []), r.name]));
        if (isFurniture(id)) pieces.add(id);
      }
    }
    for (const id of pieces) {
      const prop = Object.entries(r.props ?? {}).find(
        ([, p]) => p.img === id || Object.values(p.states ?? {}).includes(id),
      );
      const l = labels.get(id)?.[0] ?? (prop ? (prop[1].name ?? words(prop[0])) : words(splitId(id).name));
      furnitureOf.set(id, [...(furnitureOf.get(id) ?? []), { room: r, label: l }]);
    }
  }
  for (const it of Object.values(game.items)) {
    const cur = labels.get(it.icon);
    if (cur?.some((l) => l === it.name || l.startsWith(`${it.name},`)))
      labels.set(
        it.icon,
        cur.map((l) => (l.startsWith(it.name) ? `${l} (also the inventory icon)` : l)),
      );
    else label(it.icon, `${it.name} (inventory icon)`);
  }
  const scanMinigames = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(scanMinigames);
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.minigame === 'string' && o.params) {
      const mg = o.minigame;
      // The nearest text next to an image (a round's prompt, a label) says what it is.
      const scan = (x: unknown, path: string, ctx: string) => {
        if (typeof x === 'string' && /^[a-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(x)) {
          const key = words(path.replace(/\[\d+\]/g, '').replace(/\./g, ' '));
          label(x, `${mg} minigame: ${key}${ctx ? ` (for "${ctx}")` : ''}`);
        } else if (Array.isArray(x)) x.forEach((y, i) => scan(y, `${path}[${i}]`, ctx));
        else if (x && typeof x === 'object') {
          const t = Object.entries(x).find(
            ([k, y]) => /^(prompt|label|name|text|title)$/.test(k) && typeof y === 'string',
          );
          const here = t ? String(t[1]).slice(0, 90) : ctx;
          const o2 = x as Record<string, unknown>;
          for (const [k, y] of Object.entries(x)) {
            // A choice with an `answer` index (pick): the right one is named as such.
            if (Array.isArray(y) && typeof o2.answer === 'number' && here) {
              y.forEach((v, i) =>
                typeof v === 'string' && v.includes('/')
                  ? label(
                      v,
                      i === o2.answer
                        ? `${mg} minigame: the right answer to "${here}"`
                        : `${mg} minigame: a wrong choice for "${here}"`,
                    )
                  : scan(v, `${path}.${k}[${i}]`, here),
              );
              continue;
            }
            scan(y, path ? `${path}.${k}` : k, here);
          }
        }
      };
      scan(o.params, '', '');
    }
    Object.values(o).forEach(scanMinigames);
  };
  scanMinigames([game.rooms, game.rules, game.start]);
  for (const [id, ls] of labels)
    if (ls.some((l) => l.includes('the right answer')))
      labels.set(
        id,
        ls.filter((l) => !l.includes('a wrong choice')),
      );
  const sk = game.skin.icons as Record<string, string | string[] | undefined>;
  for (const [k, v] of Object.entries(sk))
    (Array.isArray(v) ? v : [v]).forEach((id) => label(id, `interface icon: ${words(k)}`));
  for (const [k, v] of Object.entries(game.map?.vehicles ?? {})) label(v, `map marker: ${words(k)}`);
  label(game.titleScreen?.logo, 'title screen logo');
  const scratch = game.ending?.scratch as Record<string, unknown> | undefined;
  for (const [k, v] of Object.entries(scratch ?? {}))
    if (typeof v === 'string' && v.includes('/')) label(v, `ending scratch card: ${words(k)}`);
  (mod.extraImages ?? []).forEach((id) => label(id, 'kept by extraImages (index.ts)'));

  // ---------------------------------------------------------------- objects
  const objectIds = refs.filter((id) => !charImages.has(id) && !id.startsWith('decor/') && !isFurniture(id));
  const bySheet = new Map<string, string[]>();
  for (const id of objectIds) {
    const s = splitId(id).sheet;
    bySheet.set(s, [...(bySheet.get(s) ?? []), id]);
  }
  const objSections: string[] = [];
  for (const [sheet, ids] of [...bySheet].sort(([a], [b]) => a.localeCompare(b))) {
    const grid = ids.filter((id) => CELL_RE.test(id));
    const namedIds = ids.filter((id) => !CELL_RE.test(id));
    const theme = uniq(ids.flatMap((id) => roomsOf.get(id) ?? [])).join(', ');
    const kinds = uniq(
      ids.flatMap((id) =>
        (labels.get(id) ?? []).map((l) =>
          l.includes('inventory')
            ? 'inventory items'
            : l.includes('minigame')
              ? `${l.split(' minigame')[0]} minigame pieces`
              : l.startsWith('interface') || l.startsWith('map marker')
                ? 'interface icons'
                : 'scenery objects',
        ),
      ),
    );
    const themeText = `${kinds.join(', ')}${theme ? ` for ${theme}` : ''}`;
    const fromAbove = ids.some((id) => (labels.get(id) ?? []).some((l) => /minigame: tiles/.test(l)));
    if (grid.length) {
      const missingIds = grid.filter((id) => !has(id));
      if (!onlyMissing || missingIds.length) {
        const maxR = Math.max(4, ...grid.map((id) => splitId(id).row!));
        const maxC = Math.max(6, ...grid.map((id) => splitId(id).col!));
        const at = new Map(grid.map((id) => [splitId(id).name, id]));
        const listed = (id: string) => !onlyMissing || !has(id);
        const cellText = (id: string) => {
          const l = (labels.get(id) ?? ['an object the game uses (describe it)']).join(' / ');
          const ref = sameAs.get(id);
          if (!ref) return l;
          const rs = splitId(ref);
          return l.replace(
            / \(same size/,
            ` as in ${rs.sheet === sheet ? `ROW ${rs.row} cell ${rs.col}` : `the attached ${ref}`} (same size`,
          );
        };
        const body = [
          `Create an item sheet for a point-and-click adventure game: ${themeText}.`,
          `STYLE: match exactly the art style of the attached reference sheet: ${STYLE_OBJ} Objects are shown in a 3/4 view from slightly above.`,
          'LAYOUT — follow it strictly:',
          `- Canvas ${maxC * 256} x ${maxR * 256} pixels${maxC * 256 > maxR * 256 ? ', landscape' : ''}.`,
          `- An invisible grid of ${maxC} columns x ${maxR} rows, every cell exactly 256 x 256 pixels.`,
          '- One object per cell, centered, filling about 70% of the cell. Nothing may touch or cross a cell border.',
          '- When several cells show STATES of the same object, draw it with the exact same size, angle and position in each of those cells: only the described change differs.',
          ...(fromAbove
            ? [
                '- Minigame tiles are seen from DIRECTLY ABOVE, flat, no perspective, all at the same tile size, their edges lining up at the middle of each border.',
              ]
            : []),
          ...colorLines(maxC * 256, maxR * 256),
          BACKGROUND_LINE.replace('no vignette, ', ''),
          `DO NOT add any text, letters, numbers, labels, logos or watermarks. No hands, no people. ${LIGHT}`,
          'CELL BY CELL (left to right):',
        ];
        for (let r = 1; r <= maxR; r++) {
          const row = Array.from({ length: maxC }, (_, i) => at.get(cellKey(r, i + 1))).map((id) =>
            id && listed(id) ? id : undefined,
          );
          if (!row.some(Boolean)) {
            body.push(`ROW ${r}: ${EMPTY}`);
            continue;
          }
          body.push(`ROW ${r}:`, ...row.map((id, i) => `- cell ${i + 1}: ${id ? cellText(id) : EMPTY}`));
        }
        const attach = [attachChar];
        const sibling = grid.find((id) => has(id));
        if (sibling) attach.push(`an already cut cell of this sheet (\`${fileOf(sibling)}\`) for scale and style`);
        objSections.push(
          `### Objects \`${sheet}\` (${maxC} × ${maxR})`,
          '',
          `Attach: ${attach.join(', ')}.`,
          '',
          fence(body),
          '',
          'Cells:',
          '',
          ...grid
            .filter(listed)
            .sort((a, b) => splitId(a).row! - splitId(b).row! || splitId(a).col! - splitId(b).col!)
            .map(
              (id) => `- ${splitId(id).name} \`${id}\` — ${cellText(id)}${has(id) ? ' (exists — keep)' : ' (missing)'}`,
            ),
          '',
        );
        sheets.push({ id: sheet, kind: 'objects', missing: missingIds });
        const cutCells =
          missingIds.length && missingIds.length < grid.length
            ? ` --cells ${missingIds.map((x) => splitId(x).name).join(',')}`
            : '';
        steps.push({
          order: 3,
          text: missingIds.length
            ? `Objects \`${sheet}\`: generate, then \`python3 tools/cut-sheet.py ${privateDir}/${sheet}.png ${sheet}${maxC !== 6 || maxR !== 4 ? ` --grid ${maxC}x${maxR}` : ''}${cutCells}\`.`
            : `Objects \`${sheet}\`: every cell exists (keep them).`,
        });
      }
    }
    if (namedIds.length) {
      const r = namedSheet(
        sheet,
        namedIds.map((id) => ({ id, label: (labels.get(id) ?? [words(splitId(id).name)]).join(' / ') })),
        'objects',
        themeText,
      );
      if (r) objSections.push(r);
    }
  }

  function namedSheet(
    sheet: string,
    pieces: { id: string; label: string }[],
    kind: 'objects' | 'furniture',
    theme: string,
    decor?: string,
  ): string | null {
    const missingIds = pieces.filter((p) => !has(p.id)).map((p) => p.id);
    if (onlyMissing && !missingIds.length) return null;
    const list = onlyMissing ? pieces.filter((p) => !has(p.id)) : pieces;
    const [cols, rowsN] = list.length <= 6 ? [3, 2] : [6, Math.max(4, Math.ceil(list.length / 6))];
    const pos = (i: number) => cellKey(Math.floor(i / cols) + 1, (i % cols) + 1);
    const body =
      kind === 'furniture'
        ? [
            'Create an item sheet for a point-and-click adventure game.',
            `STYLE: match exactly the art style, lighting and colors of the attached decor${decor ? ` (${decor})` : ''}.`,
            `LAYOUT: canvas 1536 x 1024, an invisible grid of ${cols} x ${rowsN}, one object per cell, centered, nothing touching the cell borders. ${transparent ? 'Transparent background (alpha 0, a PNG with an alpha channel, never a painted checkerboard), every pixel of an object fully opaque, no floor, no cast shadow, no text.' : `One single flat uniform background color ${sheetBg}, no gradient, no floor, no cast shadow on the background, no text.`}`,
            'Every object is seen from the SAME angle and at the SAME scale as in the attached decor.',
            ...colorLines(),
          ]
        : [
            `Create an item sheet for a point-and-click adventure game: ${theme}.`,
            `STYLE: match exactly the art style of the attached reference sheet: ${STYLE_OBJ} Objects are shown in a 3/4 view from slightly above.`,
            `LAYOUT: canvas 1536 x 1024, an invisible grid of ${cols} columns x ${rowsN} rows, one object per cell, centered, filling about 70% of the cell, nothing touching the cell borders. States of the same object: same size, same angle, same position.`,
            ...colorLines(),
            BACKGROUND_LINE.replace('no vignette, ', ''),
            `DO NOT add any text, letters, numbers, labels, logos or watermarks. No hands, no people. ${LIGHT}`,
          ];
    for (let r = 1; r <= rowsN; r++) {
      const inRow = Array.from({ length: cols }, (_, c) => list[(r - 1) * cols + c]);
      body.push(`ROW ${r}: ${inRow.map((p) => (p ? p.label : EMPTY)).join(' | ')}`);
    }
    sheets.push({ id: sheet, kind, missing: missingIds });
    const cut = list.filter((p) => !has(p.id));
    steps.push({
      order: kind === 'furniture' ? 5 : 3,
      text: cut.length
        ? `${kind === 'furniture' ? 'Furniture' : 'Objects'} \`${sheet}\`: generate, then \`python3 tools/cut-sheet.py ${privateDir}/${sheet}.png ${sheet} --grid ${cols}x${rowsN} --cells ${cut.map((p) => pos(list.indexOf(p))).join(',')}\` and rename: ${cut.map((p) => `${pos(list.indexOf(p))}.png → ${splitId(p.id).name}.png`).join(', ')}.`
        : `${kind === 'furniture' ? 'Furniture' : 'Objects'} \`${sheet}\`: every piece exists (keep them).`,
    });
    return [
      `### ${kind === 'furniture' ? 'Furniture' : 'Objects'} \`${sheet}\` (${cols} × ${rowsN}, named pieces)`,
      '',
      `Attach: ${kind === 'furniture' ? `the room's background${decor ? ` \`${decor}\`` : ''}` : attachChar}.`,
      '',
      fence(body),
      '',
      'Pieces (cut into cells, then renamed):',
      '',
      ...list.map((p, i) => `- ${pos(i)} → \`${p.id}\` — ${p.label}${has(p.id) ? ' (exists — keep)' : ' (missing)'}`),
      '',
    ].join('\n');
  }

  if (objSections.length) out.push('## Objects', '', ...objSections);

  // ---------------------------------------------------------------- backgrounds
  const bgSections: string[] = [];
  const byDecor = new Map<string, RoomDef[]>();
  for (const r of game.rooms) byDecor.set(r.decor, [...(byDecor.get(r.decor) ?? []), r]);
  for (const [decor, rooms] of byDecor) {
    const exists = has(decor);
    sheets.push({ id: decor, kind: 'background', missing: exists ? [] : [decor] });
    if (onlyMissing && exists) continue;
    const loc =
      rooms
        .map((r) => r.description?.trim())
        .filter((x): x is string => !!x)
        .map(sentence)
        .join(' ') || '<describe the room, left to right, with its light and mood>';
    const mustShow: string[] = [];
    const spots: string[] = [];
    const furnitureHere: string[] = [];
    const people: string[] = [];
    for (const r of rooms) {
      const L = layouts[r.id];
      for (const [hid, h] of Object.entries(r.hotspots ?? {})) {
        const g = L?.hotspots?.[hid];
        const x = g?.rect
          ? g.rect[0] + g.rect[2] / 2
          : g?.poly
            ? g.poly.reduce((s, p) => s + p[0], 0) / g.poly.length
            : undefined;
        mustShow.push(`${h.name}${x !== undefined ? ` (${where(x)})` : ''}`);
      }
      for (const [pid, p] of Object.entries(r.props ?? {})) {
        const g = L?.props?.[pid];
        const ids = [p.img, ...Object.values(p.states ?? {})].filter(Boolean) as string[];
        const furn = ids.some(isFurniture);
        const pos = [furn ? 'furniture' : '', g ? where(g.x, g.y, g.on) : ''].filter(Boolean).join(', ');
        (furn ? furnitureHere : spots).push(`${p.name ?? words(pid)}${pos ? ` (${pos})` : ''}`);
      }
      for (const [aid, a] of Object.entries(r.actors ?? {})) {
        const g = L?.actors?.[aid];
        people.push(`${a.name ?? game.characters[a.char]?.name ?? aid}${g ? ` (${where(g.x, g.y)})` : ''}`);
      }
    }
    // A wide room (layout `width` > 640) wants a backdrop that many screens wide; the game scrolls it.
    const wideW = Math.max(640, ...rooms.map((r) => layouts[r.id]?.width ?? 640));
    const body = [
      'Create a background image for a point-and-click adventure game.',
      `STYLE: ${STYLE_BG}`,
      wideW > 640
        ? `FORMAT: ${Math.round((1536 * wideW) / 640)} x 960 pixels: a panorama ${(wideW / 640).toFixed(1)} screens wide (the game scrolls it; one 16:10 screen is 1536 x 960).`
        : 'FORMAT: 1536 x 960 pixels (16:10).',
      'COMPOSITION — follow it strictly:',
      '- One single eye-level perspective: the back wall or horizon seen from the front, one vanishing point in the center. No fisheye, no isometric view, no tilted camera.',
      '- Scale: an adult standing on the floor near the front is about one third of the image height.',
      '- A clear, empty, walkable floor band across the lower part of the image, from about 58% to 95% of the height. Keep the center of the floor clear: large furniture stays against the walls.',
      '- One single main light source, warm; shadows lean toward deep purple, never pure black.',
      ...colorLines(1536, 960, false).map((l) =>
        l
          .replace('for the whole sheet', 'for the whole image')
          .replace(
            /on every cell of the sheet and on every animation frame|on every frame and every cell/,
            'everywhere in the image',
          ),
      ),
      'DO NOT draw any people or animals. DO NOT write any text, letters, numbers or logos: signs and screens stay blank.',
      `LOCATION: ${loc}`,
      ...(mustShow.length ? [`MUST SHOW, clearly and easy to tap: ${mustShow.join(', ')}.`] : []),
      `EMPTY SPOTS: leave a plain, uncluttered spot for each of these, drawn separately and placed by the game: ${[...spots, ...furnitureHere].join(', ') || 'none'}.` +
        (people.length ? ` Characters stand here too, keep their floor free: ${people.join(', ')}.` : ''),
    ];
    bgSections.push(
      `### Background \`${decor}\` — ${rooms.map((r) => r.name).join(', ')}`,
      '',
      `Attach: ${attachChar}. Output: \`${artRel}/${decor}.jpg\`${exists ? ' (exists — keep)' : ' (missing)'}.`,
      '',
      ...(rooms.some((r) => !r.description)
        ? [
            `> No \`description\` on room${rooms.length > 1 ? 's' : ''} ${rooms
              .filter((r) => !r.description)
              .map((r) => `\`${r.id}\``)
              .join(', ')}: fill LOCATION yourself, or add it and run again.`,
            '',
          ]
        : []),
      fence(body),
      '',
    );
    steps.push({
      order: 4,
      text: exists
        ? `Background \`${decor}\`: exists (keep).`
        : `Background \`${decor}\`: generate at 1536 × 960 and save it as \`${artRel}/${decor}.jpg\` (no cutting).`,
    });
  }
  const otherDecor = refs.filter((id) => id.startsWith('decor/') && !byDecor.has(id) && (!onlyMissing || !has(id)));
  if (bgSections.length || otherDecor.length) {
    out.push('## Backgrounds', '', ...bgSections);
    if (otherDecor.length) {
      out.push(
        'Other full-screen images (map, title, credits): use the background prompt above with your own LOCATION, and no floor band.',
        '',
        ...otherDecor.map((id) => `- \`${id}\`${has(id) ? ' (exists — keep)' : ' (missing)'}`),
        '',
      );
      otherDecor.forEach((id) => sheets.push({ id, kind: 'other', missing: has(id) ? [] : [id] }));
    }
  }

  // ---------------------------------------------------------------- furniture
  const furnSections: string[] = [];
  const byFolder = new Map<string, string[]>();
  for (const id of furnitureOf.keys()) {
    const s = splitId(id).sheet;
    byFolder.set(s, [...(byFolder.get(s) ?? []), id]);
  }
  for (const [folder, ids] of byFolder) {
    const rooms = uniq(ids.flatMap((id) => furnitureOf.get(id)!.map((x) => x.room)));
    const decor = rooms[0] ? fileOf(rooms[0].decor) : undefined;
    const r = namedSheet(
      folder,
      ids.map((id) => ({ id, label: furnitureOf.get(id)![0].label })),
      'furniture',
      '',
      decor,
    );
    if (r) furnSections.push(r);
  }
  if (furnSections.length)
    out.push(
      '## Furniture',
      '',
      'Furniture that blocks the path is drawn on its own sheet so the engine can depth-sort it with the characters; the background keeps its spot empty.',
      '',
      ...furnSections,
    );

  // ---------------------------------------------------------------- checklist
  const missing = refs.filter((id) => !has(id));
  out.push('## Checklist', '');
  if (onlyMissing && !missing.length)
    out.push('Nothing is missing: every image the game references is already in the art folder.', '');
  out.push('In this order (reference → hero → other characters → objects → backgrounds → furniture):', '');
  steps.sort((a, b) => a.order - b.order).forEach((s, i) => out.push(`${i + 1}. ${s.text}`));
  out.push(
    `${steps.length + 1}. \`npm run assets\` (prepares the cut art for the engine), then \`npm run audit\` and look at the rooms in \`npm run studio\`.`,
    '',
  );
  if (missing.length) out.push(`Missing images (${missing.length}): ${missing.map((x) => `\`${x}\``).join(', ')}.`, '');

  return {
    markdown: out.join('\n').replace(/\n{3,}/g, '\n\n'),
    missing,
    sheets: onlyMissing ? sheets.filter((x) => x.missing.length) : sheets,
  };
}

// ------------------------------------------------------------------ CLI

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { loadGameModule, GAME, GAME_DIR, ROOT } = await import('./game');
  const args = process.argv.slice(2);
  const missing = args.includes('--missing');
  const oi = args.indexOf('--out');
  const outFile = resolve(ROOT, oi >= 0 && args[oi + 1] ? args[oi + 1] : join(GAME_DIR, 'prompts.md'));
  const mod = await loadGameModule();
  const r = buildPrompts(mod, { gameId: GAME, gameDir: GAME_DIR, missing, root: ROOT });
  const { writeOutput } = await import('./game-write');
  await writeOutput('prompts.md', outFile, r.markdown);
  const toDo = r.sheets.filter((s) => s.missing.length);
  console.log(
    `${relative(ROOT, outFile)}: ${r.sheets.length} sheet(s), ${toDo.length} with missing images, ${r.missing.length} missing image(s).`,
  );
  for (const s of toDo) console.log(`  ${s.kind.padEnd(10)} ${s.id}: ${s.missing.length} missing`);
}
