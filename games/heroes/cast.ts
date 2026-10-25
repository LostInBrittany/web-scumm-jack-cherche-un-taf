import type { CharacterDef } from '@engine/core/types';
import { cat, human } from '../demo/cast';

// One hero character, three heroes (4.3.0 "Hero Choice", wiki/en/create.heroes.md#hero-choice): its written
// look and name are Pixel's; two variants, read from the flag `form`, make it Biscuit or Gaby the gull, each with its
// own name, sprites and portrait. The sample game's art (games/demo/art, D13).
export const characters: Record<string, CharacterDef> = {
  hero: {
    name: 'Pixel', color: '#ffd27a', height: 36, kind: ['animal'], portrait: 'hero/r1c1', sprites: cat('hero'),
    description: 'a small fluffy ragdoll kitten: cream fur, chocolate-brown ears, mask, paws and tail, big round sky-blue eyes',
    variants: [
      { if: { flag: 'form', eq: 'biscuit' }, name: 'Biscuit', sprites: cat('cat'), portrait: 'cat/r1c1' },
      {
        if: { flag: 'form', eq: 'gull' }, name: 'Gaby', portrait: 'extras/r2c4',
        // A gull hops: one standing frame for every pose but the squawk.
        sprites: { idle: ['extras/r2c4'], walk: ['extras/r2c4'], front: ['extras/r2c4'], back: ['extras/r2c4'], talk: ['extras/r2c5', 'extras/r2c4'] },
      },
    ],
  },
  grandma: {
    name: 'Grandma', color: '#ff9ec4', height: 120, kind: ['person'], portrait: 'grandma/r1c2', sprites: human('grandma'),
    description: 'a short, round, cheerful grandmother: curly ginger hair, round glasses, a flowered scarf, a teal cardigan',
    refuse: 'Keep it, {form?gull=feathers|*=fluffball}.', hug: 'Come here, {hero}.',
  },
};
