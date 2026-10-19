import { defineRoom } from '@engine/core/define';

// The garden behind Grandma's: two floors (3.4). The ground, and the top of the stone wall where the old lamp waits.
// The ladder to the wall is up (`ladder_down` lowers it); Biscuit jumps there from the cherry tree. Its rules check
// the same conditions as the links (lint walk-link-gate).
export default defineRoom({
  id: 'yard',
  name: 'The garden',
  decor: 'decor/backyard',
  description: 'Grandma\'s garden at night: steps to the house, a bench, a stone wall with a gate, a cherry tree',
  renderer: 'canvas',
  stage: {
    lights: [{ id: 'dark', kind: 'ambient', color: '#1c2460', intensity: 0.5, blend: 'multiply', visible: '!lights_on' }],
    transition: 'fade',
    // The walk links' logic (their geometry is in the layout): the ladder once lowered, the tree for Biscuit only.
    links: { ladder: { if: 'ladder_down', locked: 'The ladder is hooked up high on the wall.' }, tree: { if: { player: 'biscuit' }, locked: 'Me, climb a tree? My claws are for decoration.' } },
  },
  props: { lamp: { name: 'old lamp', img: 'extras/r1c3', visible: '!lamp_taken' } },
  hotspots: { ladder: { name: 'ladder' }, tree: { name: 'cherry tree' }, bench: { name: 'bench' } },
  exits: { to_street: { name: 'steps to the street', to: 'street', entry: 'from_yard' } },
  look: {
    lamp: 'An old lamp on top of the wall. The festival needs a lamp.',
    ladder: [{ id: 'yard.look-ladder.l-a-ladder-hooked', text: 'A ladder, hooked up high on the wall. I am too small to unhook it.' }, { id: 'yard.look-ladder.l-still-hooked-up', text: 'Still hooked up there.' }],
    tree: 'The cherry tree. Biscuit climbs it when nobody watches. Biscuit is never watched: he is asleep.',
    bench: 'Grandma\'s bench. Warm in the day. Cold now.',
    to_street: 'The steps back to the street.',
  },
  on: [
    { id: 'yard.push-ladder', verb: ['push', 'pull'], a: 'ladder', if: { all: [{ player: 'biscuit' }, '!ladder_down'] }, do: [
      { set: 'ladder_down' }, { sfx: 'drop', caption: '[The ladder clatters down against the wall]' },
      { id: 'yard.push-ladder.l-mrrp-from-the', say: ['biscuit', 'Mrrp. (From the top of the wall: one push. CLONK.)'] },
    ] },
    { id: 'yard.push-ladder-2', verb: ['push', 'pull'], a: 'ladder', if: '!ladder_down', do: [{ say: ['hero', 'It is hooked at the top of the wall. From up there, a cat could push it.'], id: 'yard.push-ladder-2.l-it-is-hooked-at' }] },
    { id: 'yard.push-ladder-3', verb: ['push', 'pull'], a: 'ladder', do: [{ say: ['hero', 'It is down. It stays down. Good ladder.'], id: 'yard.push-ladder-3.l-it-is-down-it' }] },
    { id: 'yard.take-lamp', verb: 'take', a: 'lamp', if: { all: [{ any: ['ladder_down', { player: 'biscuit' }] }, '!lamp_taken'] }, do: [
      { gain: 'lamp' }, { set: 'lamp_taken' }, { sfx: 'metal' }, { say: ['hero', 'Got the old lamp. Empty and cold, but mine.'], id: 'yard.take-lamp.l-got-the-old-lamp' },
    ] },
    { id: 'yard.use-tree', verb: 'use', a: 'tree', if: { player: 'hero' }, do: [{ say: ['hero', 'Me, climb that? My claws are for decoration.'], id: 'yard.use-tree.l-me-climb-that-my' }] },
  ],
  hints: [
    { id: 'yard.hint', until: 'ladder_down', lines: [{ id: 'yard.hint.l-biscuit-can-jump', text: 'Biscuit can jump from the cherry tree onto the wall, and push the ladder down.' }] },
    { id: 'yard.hint-2', until: 'lamp_taken', lines: [{ id: 'yard.hint-2.l-the-old-lamp', text: 'The old lamp waits on top of the wall.' }] },
  ],
});
