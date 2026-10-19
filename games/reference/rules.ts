import type { GameRules } from '@engine/core/types';
import { rules as demo } from '../demo/rules';

// The sample game's fallback answers and reactions by kind: the same two cats.
export const rules: GameRules = {
  fallbacks: demo.fallbacks,
  // A reaction by kind answers before an item is handed to a playable character (Engine.resolve): the sample game's
  // "use or give to a cat" would catch Biscuit handing Pixel the key. Here the cats only purr at `use`.
  kinds: demo.kinds?.map((k) => (k.id === 'kind.use-cat' ? { ...k, verb: 'use' } : k)),
  // In any room: the lamp is filled, then lit.
  on: [
    { id: 'game.use-oil-lamp', verb: 'use', a: 'oil', b: 'lamp', do: [{ lose: 'oil' }, { lose: 'lamp' }, { gain: 'full_lamp' }, { sfx: 'glass' }, { say: ['hero', 'Glug glug. The lamp is full of oil.'], id: 'game.use-oil-lamp.l-glug-glug-the' }] },
    { id: 'game.use-matches-full-lamp', verb: 'use', a: 'matches', b: 'full_lamp', do: [
      { lose: 'matches' }, { lose: 'full_lamp' }, { gain: 'lit_lamp' }, { sfx: 'chips', caption: '[A match strikes, the lamp catches]' },
      { say: ['hero', 'Scratch... the lamp is lit. I am a cat with a lamp.'], id: 'game.use-matches-full-lamp.l-scratch-the-lamp' },
    ] },
    { id: 'game.use-matches-lamp', verb: 'use', a: 'matches', b: 'lamp', do: [{ say: ['hero', 'It is empty. Lighting an empty lamp is just burning a wick. Oil first.'], id: 'game.use-matches-lamp.l-it-is-empty' }] },
  ],
};
