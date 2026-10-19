import type { ItemDef } from '@engine/core/types';

export const items: Record<string, ItemDef> = {
  cellar_key: { name: 'cellar key', icon: 'items/r2c4', look: 'The cellar key. It smells of fish and adventure.' },
  token: { name: 'market token', icon: 'items/r2c2', look: 'A market token with a big star. Worth one thing at a stall.' },
  oil: { name: 'lamp oil', icon: 'items/r2c3', look: 'A little bottle of lamp oil. Not a drink. I checked with my nose.' },
  matches: { name: 'matches', icon: 'items/r1c6', look: 'A box of long matches. Grandma says: never, ever, Pixel.' },
  lamp: { name: 'old lamp', icon: 'extras/r1c3', look: 'An old brass lamp. Empty and cold.' },
  full_lamp: { name: 'lamp with oil', icon: 'extras/r1c3', look: 'The lamp, full of oil. It wants a flame.' },
  lit_lamp: { name: 'lit lamp', icon: 'extras/r1c2', look: 'The lamp glows. I am a cat with a lamp. Fear me, darkness.' },
  cable: { name: 'spare cable', icon: 'items/r1c2', look: 'A long spare cable. For the fuse box, Lou said.' },
  board: { name: 'festival board', icon: 'home2/r4c4', look: 'The festival board. Lou chalked WELCOME on it. Badly.' },
};
