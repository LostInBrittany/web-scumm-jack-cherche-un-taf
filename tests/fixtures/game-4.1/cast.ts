import type { CharacterDef, SpriteSet } from 'web-scumm/content';

// Cat sheet: walk row 2; row 3 = front, back, idle, curl, stretch, jump; row 4 = sleep ×3, eat ×3.
function cat(id: string, extra: SpriteSet = {}): SpriteSet {
  const r = (row: number, a: number, b: number) =>
    Array.from({ length: b - a + 1 }, (_, i) => `${id}/r${row}c${a + i}`);
  return {
    walk: r(2, 1, 6),
    idle: [`${id}/r3c3`],
    talk: [`${id}/r1c3`, `${id}/r3c3`],
    front: [`${id}/r3c1`],
    back: [`${id}/r3c2`],
    sleep: r(4, 1, 3),
    curl: [`${id}/r3c4`],
    stretch: [`${id}/r3c5`],
    jump: [`${id}/r3c6`],
    eat: r(4, 4, 6),
    ...extra,
  };
}

export const characters: Record<string, CharacterDef> = {
  // The placeholder hero is a cat drawn from shapes (tools/placeholder-art.py); replace it with your own sheet (docs/en/PROMPTS.md).
  hero: {
    name: 'Hero',
    color: '#ffffff',
    height: 34,
    kind: ['cat'],
    portrait: 'starter/hero/r1c2',
    sprites: cat('starter/hero'),
    // What the hero looks like, for `npm run prompts` (the CHARACTER line of every sprite prompt). Replace it with yours.
    description:
      'a small fluffy kitten: cream fur, brown ears, mask and tail, big round blue eyes, long white whiskers; curious and cheeky',
  },
};
