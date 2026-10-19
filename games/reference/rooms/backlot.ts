import { defineRoom } from '@engine/core/define';

// Behind the fence: only Biscuit comes here. The cellar key Grandma dropped over the fence last week.
export default defineRoom({
  id: 'backlot',
  name: 'Behind the fence',
  decor: 'decor/market',
  description: 'Behind the fence: the back of the stalls in the dark, crates and fog',
  renderer: 'canvas',
  stage: {
    lights: [{ id: 'gloom', kind: 'ambient', color: '#141838', intensity: 0.7, blend: 'multiply' }],
    emitters: [{ id: 'fog', kind: 'smoke', color: '#c8d0ff' }],
    transition: 'wipe',
  },
  props: { key: { name: 'shiny thing', img: 'items/r2c4', visible: '!key_found' } },
  hotspots: { crates: { name: 'crates' } },
  exits: { back: { name: 'back under the fence', to: 'alley', entry: 'from_backlot' } },
  look: {
    key: 'Something shiny in the mud. Shiny things are worth a nap interruption.',
    crates: 'Empty crates. They smell of yesterday\'s fish. Lovely.',
    back: 'Back under the fence.',
  },
  on: [
    { id: 'backlot.take-key', verb: 'take', a: 'key', if: '!key_found', do: [
      { gain: 'cellar_key' }, { set: 'key_found' }, { sfx: 'metal' },
      { id: 'backlot.take-key.l-mrrp-a-key-pixel', say: ['biscuit', 'Mrrp. (A key. Pixel likes keys. Pixel will owe me sardines.)'] },
    ] },
  ],
  hints: [{ id: 'backlot.hint', until: 'key_found', lines: [{ id: 'backlot.hint.l-something-shines', text: 'Something shines in the mud.' }] }],
});
