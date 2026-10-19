import type { CharacterDef, MouthSet, SpriteSet } from '@engine/core/types';

const cells = (id: string, row: number, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `${id}/r${row}c${a + i}`);

/**
 * Standard 6 × 4 human sheet: portraits row 1, walk row 2, poses row 3 (front, back, idle, talk, point, use),
 * walks toward / away from the viewer row 4. `row4: false` for sheets whose row 4 holds special poses instead.
 */
export function human(id: string, extra: SpriteSet = {}, row4 = true): SpriteSet {
  return {
    walk: cells(id, 2, 1, 6), idle: [`${id}/r3c3`], talk: [`${id}/r3c4`, `${id}/r3c3`], front: [`${id}/r3c1`], back: [`${id}/r3c2`],
    point: [`${id}/r3c5`], use: [`${id}/r3c6`], ...(row4 ? { walk_front: cells(id, 4, 1, 3), walk_back: cells(id, 4, 4, 6) } : {}), ...extra,
  };
}

/** Cat sheet: walk row 2; row 3 = front, back, idle (sitting), curl, stretch, jump; row 4 = sleep ×3, eat ×3. */
export function cat(id: string, extra: SpriteSet = {}): SpriteSet {
  return {
    walk: cells(id, 2, 1, 6), idle: [`${id}/r3c3`], front: [`${id}/r3c1`], back: [`${id}/r3c2`],
    // The talk gesture (played once at the start of a long line) is the cat turning to the viewer.
    talk: [`${id}/r3c1`],
    sleep: cells(id, 4, 1, 3), curl: [`${id}/r3c4`], stretch: [`${id}/r3c5`], jump: [`${id}/r3c6`], eat: cells(id, 4, 4, 6), ...extra,
  };
}

/** Mouth frames `<folder>/<dir>/t1..t6` (t1 closed, t2–t4 open, t5 blink, t6 smile), per pose. */
export function mouths(folder: string, poses: Record<string, string>): Record<string, MouthSet> {
  const out: Record<string, MouthSet> = {};
  for (const [pose, dir] of Object.entries(poses)) {
    const t = (n: number) => `${folder}/${dir}/t${n}`;
    out[pose] = { closed: t(1), open: [t(2), t(3), t(4)], blink: t(5), smile: t(6) };
  }
  return out;
}

export const characters: Record<string, CharacterDef> = {
  hero: {
    name: 'Pixel', color: '#ffd27a', height: 36, kind: ['cat'],
    description: 'a small fluffy ragdoll kitten: cream fur, chocolate-brown ears, mask, paws and tail, big round sky-blue eyes, long white whiskers, a fluffy chest; curious, greedy for sardines, cheeky but sweet', portrait: 'hero/r1c1', sprites: cat('hero'),
  },
  biscuit: {
    name: 'Biscuit', color: '#e8b07a', height: 36, kind: ['cat'],
    description: 'a big lazy tortoiseshell cat: dark brown fur with orange and caramel patches, a cream chest and cream paws, green eyes, a thick tail; sleepy, round, content, always half asleep', portrait: 'cat/r1c2', sprites: cat('cat'),
    refuse: 'Mrrp. (Biscuit only accepts food.)', hug: 'Mrrrrp. Purr. Zzz.',
    // Palette swap (docs/en/CONTENT_GUIDE.md): the six most frequent dark-brown fur tones of cat/r3c3.png become a
    // ginger ramp, so Biscuit reads as a ginger tabby next to the cream hero. The sheet is painted (cel style) and
    // served as lossy WebP, so a small tolerance catches the neighbouring tones of every frame.
    palette: { '#2c1818': '#7a3416', '#2f1b22': '#80381a', '#362326': '#8c401c', '#492a25': '#b0592a', '#4e2718': '#b85f24', '#543329': '#c4703a' },
    paletteTolerance: 14,
  },
  grandma: {
    name: 'Grandma', color: '#ff9ec4', height: 120, kind: ['person'],
    description: 'a short, round, cheerful grandmother in her seventies: curly ginger-orange hair, round thin-rimmed glasses, small earrings, a pink and peach flowered scarf, a teal cardigan over a cream top, blue jeans, brown loafers; warm, a little scatterbrained, hands often clasped in front of her', portrait: 'grandma/r1c2',
    sprites: human('grandma'), mouths: mouths('talk_grandma', { idle: 'profil', front: 'face' }),
    refuse: 'Keep it, fluffball. You will need it.', hug: 'Come here, fluffball. Purr purr.',
  },
  // Grandma's voice in the shell phone: the hint voice, shown in a frame at the top of the screen.
  grandma_voice: {
    name: 'Grandma (shell phone)', color: '#ff9ec4', offscreen: true, portrait: 'grandma/r1c2',
    description: 'Grandma\'s voice through the shell phone: no sheet of its own, it reuses Grandma\'s portrait',
  },
  grandpa: {
    name: 'Grandpa', color: '#8fd3ff', height: 100, kind: ['person'],
    // He starts in the garden and moves home (with the armchair) when the key is found: game.ts `events`.
    room: 'garden',
    description: 'a relaxed grandfather in his seventies: short grey hair, short white beard, red sunglasses, a navy track jacket with white and red stripes, a grey t-shirt, blue jeans, white sneakers; always sitting in his green armchair with a flowered cushion, a TV remote at hand; laid-back, dozes a lot, laughs easily', portrait: 'grandpa/r1c2',
    sprites: { idle: ['grandpa_seated/r2c1'], surprised: ['grandpa_seated/r2c3'], laugh: ['grandpa_seated/r2c4'], slumped: ['grandpa_seated/r2c6'] },
    mouths: mouths('talk_grandpa', { idle: 'assis' }),
    refuse: 'Not now, Pixel. I am busy. Resting.', hug: 'Careful, the armchair is ticklish.',
  },
  neighbor: {
    name: 'Lou', color: '#b8ff8f', height: 120, kind: ['person'],
    description: 'Lou, the handyman neighbour, in his forties: short brown hair, short beard, dark sunglasses, navy blue work overalls with oil stains and a wrench in the chest pocket, a red rag hanging from a back pocket, brown work boots; friendly, confident, borrows everything', portrait: 'neighbor/r1c2',
    sprites: human('neighbor', { pinch: ['neighbor/r4c1'], celebrate: ['neighbor/r4c2'], wrench: ['neighbor/r4c3'], thumbs: ['neighbor/r4c6'] }, false),
    mouths: mouths('talk_neighbor', { idle: 'profil', front: 'face' }),
    refuse: 'Thanks, but my pockets are full. Of other people\'s things.', hug: 'Ha! Mind the wrench.',
  },
  seller: {
    name: 'The seller', color: '#ffb36b', height: 118, kind: ['person'],
    description: 'a round, jolly market seller in his fifties: big black curly moustache, black curly hair, a red and cream embroidered cap, a long cream djellaba with thin brown stripes, yellow pointed slippers; generous, theatrical, laughs loudly', portrait: 'seller/r1c2',
    sprites: human('seller', { welcome: ['seller/r4c1'], offering: ['seller/r4c2'], laugh: ['seller/r4c3'], panic: ['seller/r4c4'], fist: ['seller/r4c6'] }, false),
    mouths: mouths('talk_seller', { idle: 'profil', front: 'face' }),
    refuse: 'Today I only take tokens. And flowers.', hug: 'A hug from a cat! Good luck for the whole week.',
  },
};
