import { defineRoom } from '@engine/core/define';

// The cellar: pitch dark until Pixel brings the lit lamp (the stage's light follows the bag). The spare cable is in
// the crate, which only shows in the light.
export default defineRoom({
  id: 'cellar',
  name: 'The cellar',
  decor: 'decor/dining',
  description: 'Under the kitchen: the same old room, in the dark, lit only by a lamp when there is one',
  renderer: 'canvas',
  stage: {
    lights: [
      { id: 'black', kind: 'ambient', color: '#05060f', intensity: 0.9, blend: 'multiply', visible: { not: { has: 'lit_lamp' } } },
      { id: 'dim', kind: 'ambient', color: '#20140a', intensity: 0.45, blend: 'multiply', visible: { has: 'lit_lamp' } },
      { id: 'lamp', kind: 'radial', color: '#ffb84d', intensity: 0.85, visible: { has: 'lit_lamp' } },
    ],
    emitters: [{ id: 'dust', kind: 'dust', color: '#ffdca0', visible: { has: 'lit_lamp' } }],
    transition: 'fade',
  },
  hotspots: { crate: { name: 'crate', visible: { has: 'lit_lamp' } }, darkness: { name: 'darkness', visible: { not: { has: 'lit_lamp' } } } },
  exits: { up: { name: 'stairs up', to: 'kitchen', entry: 'from_cellar' } },
  look: {
    crate: 'A crate of Lou\'s spares. Cables, bulbs, one sock.',
    darkness: 'Darkness. Cats see in the dark. Not THIS dark.',
    up: 'The stairs up to the kitchen.',
  },
  on: [
    { id: 'cellar.take-crate', verb: ['take', 'open'], a: 'crate', if: '!cable_taken', do: [{ gain: 'cable' }, { set: 'cable_taken' }, { sfx: 'cloth' }, { say: ['hero', 'A spare cable. The fuse box will purr.'], id: 'cellar.take-crate.l-a-spare-cable' }] },
    { id: 'cellar.take-crate-2', verb: ['take', 'open'], a: 'crate', do: [{ say: ['hero', 'Bulbs and one sock. The sock is not mine. I think.'], id: 'cellar.take-crate-2.l-bulbs-and-one' }] },
    { id: 'cellar.look-darkness', verb: 'look', a: 'darkness', do: [{ say: ['hero', 'I bump into something. It goes CLONK. I need a light.'], id: 'cellar.look-darkness.l-i-bump-into' }] },
  ],
  hints: [{ id: 'cellar.hint', until: 'cable_taken', lines: [{ id: 'cellar.hint.l-bring-a-lit-lamp', text: 'Bring a lit lamp down here.' }] }],
});
