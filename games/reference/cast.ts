import type { CharacterDef } from '@engine/core/types';
import { cat, human, mouths } from '../demo/cast';

// The reference chapter's cast: the sample game's art (D13), its two playable cats and three of its people.
export const characters: Record<string, CharacterDef> = {
  hero: {
    name: 'Pixel', color: '#ffd27a', height: 36, kind: ['cat'],
    description: 'a small fluffy ragdoll kitten: cream fur, chocolate-brown ears, mask, paws and tail, big round sky-blue eyes', portrait: 'hero/r1c1', sprites: cat('hero'),
  },
  biscuit: {
    name: 'Biscuit', color: '#e8b07a', height: 36, kind: ['cat'],
    description: 'a big lazy tortoiseshell cat, round and sleepy, who fits through any gap when food is involved', portrait: 'cat/r1c2', sprites: cat('cat'),
    refuse: 'Mrrp. (Biscuit only accepts food.)', hug: 'Mrrrrp. Purr. Zzz.',
    palette: { '#2c1818': '#7a3416', '#2f1b22': '#80381a', '#362326': '#8c401c', '#492a25': '#b0592a', '#4e2718': '#b85f24', '#543329': '#c4703a' },
    paletteTolerance: 14,
  },
  grandma: {
    name: 'Grandma', color: '#ff9ec4', height: 120, kind: ['person'], portrait: 'grandma/r1c2',
    description: 'a cheerful grandmother who loves the night market and the radio', sprites: human('grandma'), mouths: mouths('talk_grandma', { idle: 'profil', front: 'face' }),
    refuse: 'Keep it, fluffball.', hug: 'Come here, fluffball.',
  },
  neighbor: {
    name: 'Lou', color: '#b8ff8f', height: 120, kind: ['person'], portrait: 'neighbor/r1c2',
    description: 'Lou, the handyman who organises the night festival this year', sprites: human('neighbor', { pinch: ['neighbor/r4c1'], celebrate: ['neighbor/r4c2'], wrench: ['neighbor/r4c3'], thumbs: ['neighbor/r4c6'] }, false),
    mouths: mouths('talk_neighbor', { idle: 'profil', front: 'face' }),
    refuse: 'My pockets are full of festival things.', hug: 'Ha! Mind the wrench.',
  },
  seller: {
    name: 'The seller', color: '#ffb36b', height: 118, kind: ['person'], portrait: 'seller/r1c2',
    description: 'the market seller, who walks his stall back and forth in the dark', sprites: human('seller', { welcome: ['seller/r4c1'], offering: ['seller/r4c2'], laugh: ['seller/r4c3'], panic: ['seller/r4c4'] }, false),
    mouths: mouths('talk_seller', { idle: 'profil', front: 'face' }),
    refuse: 'Tonight I only take tokens.', hug: 'A cat hug! Good luck for the festival.',
  },
};
