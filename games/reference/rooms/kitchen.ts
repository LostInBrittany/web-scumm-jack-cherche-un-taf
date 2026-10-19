import { defineRoom } from '@engine/core/define';

// Grandma's kitchen: the radio makes her dance (and look away from the matches cupboard), the armchair hides a
// token, the white door goes down to the cellar (the cellar key).
export default defineRoom({
  id: 'kitchen',
  name: 'Grandma\'s kitchen',
  decor: 'decor/dining',
  description: 'A cosy room at night: a bookcase, a floor lamp, French windows to the street, a white door to the cellar',
  props: {
    radio: { name: 'radio', states: { off: 'house/r3c1', on: 'house/r3c2' }, initial: 'off' },
    cupboard: { name: 'cupboard', states: { shut: 'home2/r1c3', open: 'home2/r1c4' }, initial: 'shut' },
    armchair: { name: 'armchair', states: { plump: 'home2/r2c1', searched: 'home2/r2c2' }, initial: 'plump' },
  },
  actors: { grandma: { char: 'grandma', facing: 'right' } },
  hotspots: { cellar_door: { name: 'white door' } },
  exits: {
    windows: { name: 'French windows', to: 'street', entry: 'from_kitchen' },
    down: { name: 'stairs to the cellar', to: 'cellar', entry: 'from_kitchen', if: 'cellar_open', locked: 'Locked. The cellar key went over the market fence last week, Grandma says.' },
  },
  look: {
    radio: 'Grandma\'s radio. One button: DANCE.',
    cupboard: 'The matches cupboard. Grandma watches it like a hawk. A hawk with glasses.',
    armchair: 'The armchair. Things fall into armchairs. Then they wait for a cat.',
    cellar_door: 'The white door to the cellar.',
    grandma: 'Grandma, ready for the festival since five o\'clock.',
    windows: 'The French windows to the street.',
    down: 'The stairs to the cellar, behind the white door.',
  },
  on: [
    { id: 'kitchen.push-radio', verb: ['push', 'use'], a: 'radio', if: '!radio_on', do: [
      { prop: ['radio', 'on'] }, { set: 'radio_on' }, { sfx: 'click', caption: '[The radio plays a waltz]' },
      { anim: ['grandma', 'point'], ms: 900 },
      { id: 'kitchen.push-radio.l-oh-my-song-turn', say: ['grandma', 'Oh! My song! Turn, turn, turn...'] },
    ] },
    { id: 'kitchen.push-radio-2', verb: ['push', 'use'], a: 'radio', do: [{ say: ['hero', 'Grandma is dancing. I let her dance.'], id: 'kitchen.push-radio-2.l-grandma-is' }] },
    { id: 'kitchen.open-cupboard', verb: 'open', a: 'cupboard', if: { all: ['radio_on', '!matches_taken'] }, do: [
      { prop: ['cupboard', 'open'] }, { gain: 'matches' }, { set: 'matches_taken' }, { sfx: 'latch' },
      { say: ['hero', 'She is dancing with her eyes closed. Matches: mine.'], id: 'kitchen.open-cupboard.l-she-is-dancing' },
    ] },
    { id: 'kitchen.open-cupboard-2', verb: 'open', a: 'cupboard', if: '!matches_taken', do: [{ id: 'kitchen.open-cupboard-2.l-not-the-matches', say: ['grandma', 'Not the matches cupboard, fluffball. Never.'] }] },
    { id: 'kitchen.open-cupboard-3', verb: 'open', a: 'cupboard', do: [{ say: ['hero', 'Nothing else in there. Some candles. Boring candles.'], id: 'kitchen.open-cupboard-3.l-nothing-else-in' }] },
    { id: 'kitchen.take-armchair', verb: ['take', 'open', 'push'], a: 'armchair', if: '!token_found', do: [
      { prop: ['armchair', 'searched'] }, { gain: 'token' }, { set: 'token_found' }, { sfx: 'coins' },
      { say: ['hero', 'Under the cushion: a market token. Armchairs never let me down.'], id: 'kitchen.take-armchair.l-under-the' },
    ] },
    { id: 'kitchen.use-cellar-key-cellar-door', verb: 'use', a: 'cellar_key', b: 'cellar_door', if: { all: [{ player: 'hero' }, '!cellar_open'] }, do: [
      { lose: 'cellar_key' }, { set: 'cellar_open' }, { sfx: 'door_open' }, { say: ['hero', 'Click. The cellar is open. And very, very dark.'], id: 'kitchen.use-cellar-key-cellar-door.l-click-the-cellar' },
    ] },
    { id: 'kitchen.use-cellar-key-cellar-door-2', verb: 'use', a: 'cellar_key', b: 'cellar_door', if: { player: 'biscuit' }, do: [{ id: 'kitchen.use-cellar-key-cellar-door-2.l-mrrp-keys-are', say: ['biscuit', 'Mrrp. (Keys are Pixel\'s department. I just find them.)'] }] },
  ],
  talk: {
    grandma: [
      { id: 'kitchen.grandma.ready-for-the-festival', topic: 'Ready for the festival?', do: [
        { id: 'kitchen.grandma.ready-for-the-festival.l-ready-since-five', say: ['grandma', 'Ready since five! But the lights are out, Lou says. The fuse box ate a cable.'] },
        { choice: [
          { id: 'kitchen.grandma.ready-for-the-festival.c-where-are-the', text: 'Where are the spare cables?', do: [{ set: 'knows_cellar' }, { id: 'kitchen.grandma.ready-for-the-festival.c-where-are-the.l-in-the-cellar', say: ['grandma', 'In the cellar. But the cellar key... flew over the market fence. Long story.'] }] },
          { id: 'kitchen.grandma.ready-for-the-festival.c-can-i-help', text: 'Can I help?', do: [{ id: 'kitchen.grandma.ready-for-the-festival.c-can-i-help.l-you-can-stay', say: ['grandma', 'You can stay away from my matches. That helps.'] }] },
        ] },
      ] },
      { id: 'kitchen.grandma.where-did-the-cellar-key', topic: 'Where did the cellar key go?', if: { all: ['knows_cellar', '!key_found'] }, do: [{ id: 'kitchen.grandma.where-did-the-cellar-key.l-over-the-market', say: ['grandma', 'Over the market fence, in the side alley. Only a very flexible cat could get it. A sleepy one, maybe.'] }] },
      { id: 'kitchen.grandma.do-you-know-the-password', topic: 'Do you know the festival password?', do: [
        { id: 'kitchen.grandma.do-you-know-the-password.l-lou-s-riddle', say: ['grandma', 'Lou\'s password is a riddle: "{hint:festival-password}" Count them in order, fluffball.'] },
      ] },
      { id: 'kitchen.grandma.the-cellar-is-dark', topic: 'The cellar is dark.', if: 'cellar_open', do: [
        { id: 'kitchen.grandma.the-cellar-is-dark.l-take-a-lamp', say: ['grandma', 'Take a lamp, fluffball. The old one is on the garden wall. Oil at the market.'] },
      ] },
    ],
  },
  hints: [
    { id: 'kitchen.hint', until: 'token_found', lines: [{ id: 'kitchen.hint.l-search-grandma-s', text: 'Search Grandma\'s armchair.' }] },
    { id: 'kitchen.hint-2', until: 'matches_taken', lines: [{ id: 'kitchen.hint-2.l-grandma-dances', text: 'Grandma dances when the radio plays. Then nobody guards the cupboard.' }] },
    { id: 'kitchen.hint-3', until: 'cellar_open', lines: [{ id: 'kitchen.hint-3.l-the-cellar-key', text: 'The cellar key is behind the market fence. Biscuit fits under it.' }] },
  ],
});
