import { defineRoom } from '@engine/core/define';

// The side alley: the seller's stall (when he is here: he walks between the alley and the market until the lights
// come back) and a gap under the fence only Biscuit fits through.
export default defineRoom({
  id: 'alley',
  name: 'The side alley',
  decor: 'decor/market',
  description: 'A narrow market alley: spice stalls, lanterns, and at the back a wooden fence with a gap at the bottom',
  renderer: 'canvas',
  stage: {
    lights: [{ id: 'dark', kind: 'ambient', color: '#232a66', intensity: 0.55, blend: 'multiply', visible: '!lights_on' }],
    transition: 'fade',
  },
  actors: { seller: { char: 'seller', facing: 'right' } },
  hotspots: { spices: { name: 'spice cones' }, box: { name: 'honesty box' } },
  exits: {
    to_market: { name: 'back to the market', to: 'market', entry: 'from_alley' },
    fence_gap: { name: 'gap under the fence', to: 'backlot', entry: 'from_alley', if: { player: 'biscuit' }, locked: 'Too narrow for me. Biscuit, though... Biscuit is flexible when food is near.' },
  },
  look: {
    spices: 'Cones of spices. One sneeze and the alley turns orange.',
    seller: 'The seller, pacing to keep warm.',
    box: 'The seller\'s honesty box: one token, one bottle of lamp oil. Signed: the seller (trust me).',
    to_market: 'Back to the market.',
    fence_gap: 'A gap under the fence. Cat-sized. Big-cat-sized, even.',
  },
  on: [
    { id: 'alley.use-token-box', verb: 'use', a: 'token', b: 'box', if: '!oil_bought', do: [
      { lose: 'token' }, { gain: 'oil' }, { set: 'oil_bought' }, { sfx: 'coins', caption: '[The token drops into the box]' },
      { say: ['hero', 'Clink. One token in, one bottle of lamp oil out. Honest cat, me.'], id: 'alley.use-token-box.l-clink-one-token' },
    ] },
        { id: 'alley.give-token-seller', verb: 'give', a: 'token', b: 'seller', if: '!oil_bought', do: [{ id: 'alley.give-token-seller.l-put-it-in-the', say: ['seller', 'Put it in the honesty box at my stall in the alley, little cat. I trust cats. Mostly.'] }] },
    { id: 'alley.take-spices', verb: 'take', a: 'spices', do: [{ say: ['hero', 'Paws off the spices. I learnt that the hard way. Sneezing for an hour.'], id: 'alley.take-spices.l-paws-off-the' }] },
  ],
  talk: {
    seller: [
      { id: 'alley.seller.do-you-have-lamp-oil', topic: 'Do you have lamp oil?', if: '!oil_bought', do: [
        { id: 'alley.seller.do-you-have-lamp-oil.l-oil-for-one', say: ['seller', 'Oil? For one token, a bottle.'] },
        { choice: [
          { id: 'alley.seller.do-you-have-lamp-oil.c-i-will-find-a', text: 'I will find a token.', do: [{ id: 'alley.seller.do-you-have-lamp-oil.c-i-will-find-a.l-grandmas-always', say: ['seller', 'Grandmas always have tokens. In armchairs, mostly.'] }] },
          { id: 'alley.seller.do-you-have-lamp-oil.c-can-i-have-it', text: 'Can I have it for a purr?', do: [{ id: 'alley.seller.do-you-have-lamp-oil.c-can-i-have-it.l-a-purr-is', say: ['seller', 'A purr is priceless. That is the problem.'] }] },
        ] },
      ] },
      { id: 'alley.seller.good-night', topic: 'Good night!', do: [{ id: 'alley.seller.good-night.l-good-night-it-is', say: ['seller', 'Good night? It is too dark to tell.'] }] },
    ],
  },
  hints: [
    { id: 'alley.hint', until: 'oil_bought', lines: [{ id: 'alley.hint.l-the-seller-sells', text: 'The seller sells lamp oil for a token. Grandma\'s armchair hides things.' }] },
  ],
});
