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

/** An NPC on the standard sheet: human() poses, and the talk pose (r3c4) as the open mouth over idle (r3c3). */
function npc(id: string): Pick<CharacterDef, 'sprites' | 'mouths'> {
  return { sprites: human(id), mouths: { idle: { closed: `${id}/r3c3`, open: [`${id}/r3c4`], blink: `${id}/r3c3` } } };
}

export const characters: Record<string, CharacterDef> = {
  hero: {
    name: 'Jack', color: '#ffb35c', height: 120, kind: ['person', 'skeleton'], portrait: 'jack/r1c2', sprites: human('jack'),
    mouths: { idle: { closed: 'jack/r3c3', open: ['jack/r3c4'], blink: 'jack/r3c3' } },
    description: 'a lanky friendly skeleton (ivory bones, visible ribs, skinny arms and legs) whose head is a big carved Halloween pumpkin: orange, triangle eyes and a jagged grin glowing warm yellow from a candle inside, a curly green stem on top; kind, clumsy, always trying his best, more goofy than scary',
    hug: 'Câlin osseux. Attention aux côtes.',
  },
  mireille: { name: 'Mireille', color: '#e88cc8', offscreen: true,
    description: 'a tiny round black spider with a pink bow and big white eyes, who lives inside Jack\'s pumpkin head' },
  radinoff: { name: 'Comte Radinoff', color: '#e05a6a', height: 150, kind: ['person', 'vampire'], portrait: 'radinoff/r1c2', ...npc('radinoff'),
    description: 'a tall skinny stingy vampire count, pale green-grey skin, slicked black hair in a widow\'s peak, fangs, black suit and a long cape with red lining, a coin purse on his belt',
    refuse: 'Un cadeau ? C\'est gratuit ? Non. Méfiance.', hug: 'Un câlin ? Ça coûte deux euros.' },
  bandelette: { name: 'Mme Bandelette', color: '#e8d8a8', height: 125, kind: ['person', 'mummy'], portrait: 'bandelette/r1c2', ...npc('bandelette'),
    description: 'a very slow, very polite mummy office clerk wrapped in beige bandages, round glasses, a pen behind the ear',
    refuse: 'Ce n\'est pas dans la liiiste des pièces à fournir.', hug: 'Attentiooon, je me déroule.' },
  maire: { name: 'M. le Maire', color: '#9be07c', height: 150, kind: ['person', 'monster'], portrait: 'maire/r1c2', ...npc('maire'),
    variants: [{ if: 'lettre_ok', portrait: 'maire_ok/r1c2', ...npc('maire_ok') }],
    description: 'Frankenstein\'s monster as a mayor: green square head with flat top and black hair, neck bolts, dark suit, red tie, blue-white-red mayor sash, big friendly politician smile',
    refuse: 'Je n\'accepte pas les cadeaux. Sauf les voix.', hug: 'Une poignée de main, plutôt. Si elle tient.' },
  gloubi: { name: 'Gloubi', color: '#8ee05a', height: 85, kind: ['person', 'blob'], portrait: 'gloubi/r1c2', ...npc('gloubi'),
    description: 'a huge round green slime blob garbage collector, eyes on stalks, enormous mouth, wearing an orange hi-vis vest with yellow stripes',
    refuse: 'Gloubi pas faim de ça. Gloubi veut barbe à papa.', hug: 'Câlin gluant ! Blorp !' },
  brigadier: { name: 'Brigadier Sans-Tête', color: '#a8c0ff', height: 150, kind: ['person', 'knight'], portrait: 'brigadier/r1c2', ...npc('brigadier'),
    variants: [{ if: 'route_ouverte', portrait: 'brigadier_lanterne/r1c2', ...npc('brigadier_lanterne') }],
    description: 'a headless knight in grey plate armour working as a village policeman, a blue police badge on the breastplate, holding his kepi in one hand; nothing above the neck',
    refuse: 'Un pot-de-vin ? Je n\'ai rien vu. Forcément.', hug: 'Câlin réglementaire. Trois secondes.' },
  guimauve: { name: 'Mémé Guimauve', color: '#ff9ccc', height: 130, kind: ['person', 'witch'], portrait: 'guimauve/r1c2', ...npc('guimauve'),
    description: 'a retired old witch selling cotton candy: pale green skin, warty nose, pink pointy hat, purple dress, pink apron',
    refuse: 'Garde ça, mon chou.', hug: 'Viens là, mon chou ! Tu sens la citrouille.' },
  carrousel: { name: 'M. Carrousel', color: '#ff7070', height: 140, kind: ['person'], portrait: 'carrousel/r1c2', ...npc('carrousel'),
    description: 'a jolly middle-aged carousel owner dressed as a circus ringmaster: wavy chestnut-brown hair over the ears, a big curled brown handlebar moustache, round nose, rosy cheeks; black top hat with a red and gold band; red tailcoat with gold epaulettes, gold piping and long tails; cream waistcoat with gold buttons; red bow tie; white gloves; black trousers with a gold side stripe; black shoes with gold buckles; cheerful but a little worried',
    refuse: 'Merci, mais j\'ai les mains prises. Par mes soucis.' },
  ginette: { name: 'Ginette', color: '#f0f0ff', height: 95, kind: ['person', 'ghost'], portrait: 'ginette/r1c2', ...npc('ginette'),
    description: 'a plump old-fashioned bedsheet ghost (white sheet with a few holes and patches), big black oval eyes, a red bow on top, a union delegate who speaks in protest slogans, fists raised; determined and funny',
    refuse: 'Ce n\'est pas dans nos revendications, camarade.', hug: 'Un câlin solidaire ! Attention, je suis un peu transparente.' },
  bouh: { name: 'Bouh', color: '#d8dcff', height: 60, kind: ['person', 'ghost'], portrait: 'bouh/r1c2', ...npc('bouh'),
    description: 'a tiny shy baby bedsheet ghost, the intern of the ghost train, round black eyes, only ever says "bouh"',
    refuse: 'Bouh ?', hug: 'Bouh !' },
  wolfgang: { name: 'Wolfgang', color: '#d0a070', height: 145, kind: ['person', 'werewolf'], portrait: 'wolfgang/r1c2', ...npc('wolfgang'),
    description: 'a mild werewolf with round glasses running the ghost train ticket booth, brown fur, green waistcoat, looks like an accountant',
    refuse: 'Ouaf. Non merci.', hug: 'Attention, je perds mes poils en octobre.' },
};
