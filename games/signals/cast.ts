import type { CharacterDef, MouthSet, SpriteSet } from 'web-scumm/content';

// Standard 6 × 4 sheet (see docs/en/PROMPTS.md): portraits row 1, walk row 2, poses row 3, front/back walks row 4.
export function human(id: string, extra: SpriteSet = {}): SpriteSet {
  const r = (row: number, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `${id}/r${row}c${a + i}`);
  return { walk: r(2, 1, 6), idle: [`${id}/r3c3`], talk: [`${id}/r3c4`, `${id}/r3c3`], front: [`${id}/r3c1`], back: [`${id}/r3c2`],
    point: [`${id}/r3c5`], use: [`${id}/r3c6`], walk_front: r(4, 1, 3), walk_back: r(4, 4, 6), ...extra };
}

// Cat sheet: walk row 2; row 3 = front, back, idle, curl, stretch, jump; row 4 = sleep ×3, eat ×3.
export function cat(id: string, extra: SpriteSet = {}): SpriteSet {
  const r = (row: number, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `${id}/r${row}c${a + i}`);
  return { walk: r(2, 1, 6), idle: [`${id}/r3c3`], talk: [`${id}/r1c3`, `${id}/r3c3`], front: [`${id}/r3c1`], back: [`${id}/r3c2`],
    sleep: r(4, 1, 3), curl: [`${id}/r3c4`], stretch: [`${id}/r3c5`], jump: [`${id}/r3c6`], eat: r(4, 4, 6), ...extra };
}

/** Mouth frames produced by tools/talk-apply.py: `<folder>/<row>/t1..t6` (t1 closed, t2-t4 open, t5 blink, t6 smile).
 *  `poses` maps a character pose to a row folder, e.g. { idle: 'profil', front: 'face' }. */
export function mouths(folder: string, poses: Record<string, string>): Record<string, MouthSet> {
  const out: Record<string, MouthSet> = {};
  for (const [pose, row] of Object.entries(poses)) {
    const t = (n: number) => `${folder}/${row}/t${n}`;
    out[pose] = { closed: t(1), open: [t(2), t(3), t(4)], blink: t(5), smile: t(6) };
  }
  return out;
}

export const characters: Record<string, CharacterDef> = {
  // The placeholder hero is a cat drawn from shapes (tools/placeholder-art.py); replace it with your own sheet (docs/en/PROMPTS.md).
  hero: {
    name: 'Hero', color: '#ffffff', height: 34, kind: ['cat'], portrait: 'starter/hero/r1c2', sprites: cat('starter/hero'),
    // What the hero looks like, for `npm run prompts` (the CHARACTER line of every sprite prompt). Replace it with yours.
    description: 'a small fluffy kitten: cream fur, brown ears, mask and tail, big round blue eyes, long white whiskers; curious and cheeky',
  },
};
