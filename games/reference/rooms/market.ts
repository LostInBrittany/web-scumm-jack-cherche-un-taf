import { defineRoom } from '@engine/core/define';

// The night market: the reference chapter's staged scene (3.4). A wide room drawn by the canvas painter with six
// layers (the backdrop, three stalls among the people, two plants in front moving faster than the street), three
// occluders (a pillar, the middle stall's own shape, an archway), lights (the night, then the lamps), particles, and
// two floors: the cobbles and the stage behind the tiled booth, joined by steps. Here the festival begins.
export default defineRoom({
  id: 'market',
  name: 'The night market',
  decor: 'decor/market_wide',
  // Its own score since 3.7 (game.ts `audio.transitions`): the theme hands over on its next phrase, after a bridge.
  music: 'market',
  description: 'The market street seen down its length at night, the stalls, the tiled booth with its little stage',
  renderer: 'canvas',
  stage: {
    layers: [
      { id: 'stall_left', image: 'furniture_market/etal_gauche', role: 'scenery' },
      { id: 'stall_mid', image: 'furniture_market/etal_milieu', role: 'scenery' },
      { id: 'stall_right', image: 'furniture_market/etal_droit', role: 'scenery' },
      { id: 'bush', image: 'home2/r1c6', role: 'foreground' },
      { id: 'chair', image: 'furniture_dining/chaise2', role: 'foreground' },
    ],
    lights: [
      { id: 'dark', kind: 'ambient', color: '#232a66', intensity: 0.6, blend: 'multiply', visible: '!lights_on' },
      { id: 'lamps', kind: 'radial', color: '#ffc861', intensity: 0.75, visible: 'lights_on' },
      { id: 'stage_light', kind: 'radial', color: '#ff9fd0', intensity: 0.5, visible: 'board_hung' },
    ],
    emitters: [
      { id: 'dust', kind: 'dust', color: '#ffe6b0' },
      { id: 'sparks', kind: 'sparks', color: '#ffd27a', visible: 'festival' },
    ],
    transition: 'fade',
  },
  props: {
    lamppost: { name: 'lamp post', img: 'world/r3c4' },
    board_up: { img: 'home2/r4c4', visible: 'board_hung' },
    confetti: { img: 'ui/r4c1', visible: 'festival' },
  },
  actors: {
    seller: { char: 'seller', facing: 'left' },
    neighbor: { char: 'neighbor', facing: 'left' },
  },
  hotspots: {
    booth: { name: 'tiled booth' },
    far_alley: { name: 'far alley' },
  },
  exits: {
    to_street: { name: 'back to the street', to: 'street', entry: 'from_market' },
    to_alley: { name: 'side alley', to: 'alley', entry: 'from_market' },
  },
  look: {
    lamppost: [{ id: 'market.look-lamppost.l-the-big-lamp', text: 'The big lamp post. Its lamp is missing: the festival needs one, lit.' }, { id: 'market.look-lamppost.l-an-empty-lamp', text: 'An empty lamp post. Sad.' }],
    booth: 'The tiled booth, with a little stage behind. The festival board goes up there.',
    far_alley: 'The market goes on and on. Lanterns as far as the minaret.',
    seller: 'The seller, pacing in the dark. He hums to keep warm.',
    neighbor: 'Lou, very proud of his festival.',
    to_street: 'Back to the street.',
    to_alley: 'The side alley, where the seller walks.',
  },
  on: [
        { id: 'market.give-token-seller', verb: 'give', a: 'token', b: 'seller', if: '!oil_bought', do: [{ id: 'market.give-token-seller.l-put-it-in-the', say: ['seller', 'Put it in the honesty box at my stall in the alley, little cat. I trust cats. Mostly.'] }] },
    { id: 'market.use-board-booth', verb: 'use', a: 'board', b: 'booth', if: '!board_hung', do: [
      { lose: 'board' }, { set: 'board_hung' }, { sfx: 'latch' },
      { id: 'market.use-board-booth.l-welcome-up-it', say: ['hero', 'WELCOME. Up it goes. A bit crooked. Like Lou\'s chalk.'] },
    ] },
    { id: 'market.use-lit-lamp-lamppost', verb: 'use', a: 'lit_lamp', b: 'lamppost', if: { all: ['lights_on', 'board_hung'] }, do: [
      { cutscene: [
        { lose: 'lit_lamp' }, { set: 'festival' }, { sfx: 'bell', caption: '[The festival bell rings]' },
        { parallel: [
          [{ id: 'market.use-lit-lamp-lamppost.l-the-lamp-is-up', say: ['hero', 'The lamp is up. Let the festival begin!'] }],
          [{ spring: { target: 'lamppost', axis: 'rot', amplitude: 8, frequency: 2 } }],
        ] },
        { moveActor: ['neighbor', 'market'] },
        { launch: { target: 'confetti', from: [420, 380], to: [520, 120], rotate: 540, ms: 1200 } },
        { id: 'market.use-lit-lamp-lamppost.l-lights-board', say: ['neighbor', 'Lights, board, lamp. Pixel, you are hired.'] },
        { id: 'market.use-lit-lamp-lamppost.l-free-tokens-for', say: ['seller', 'Free tokens for every cat tonight!'] },
        { wait: 600 },
        { id: 'market.use-lit-lamp-lamppost.l-and-biscuit', say: ['hero', 'And Biscuit slept through all of it. Classic.'] },
        { end: true },
      ] },
    ] },
    { id: 'market.use-lit-lamp-lamppost-2', verb: 'use', a: 'lit_lamp', b: 'lamppost', do: [{ say: ['hero', 'Not yet: the lights first, and the board on the stage.'], id: 'market.use-lit-lamp-lamppost-2.l-not-yet-the' }] },
    { id: 'market.use-lamp-lamppost', verb: 'use', a: 'lamp', b: 'lamppost', do: [{ say: ['hero', 'A cold lamp on a lamp post? It needs oil and a flame first.'], id: 'market.use-lamp-lamppost.l-a-cold-lamp-on-a' }] },
    { id: 'market.use-full-lamp-lamppost', verb: 'use', a: 'full_lamp', b: 'lamppost', do: [{ say: ['hero', 'It is full, but not lit. Matches!'], id: 'market.use-full-lamp-lamppost.l-it-is-full-but' }] },
  ],
  talk: {
    neighbor: [
      { id: 'market.neighbor.happy-festival-lou', topic: 'Happy festival, Lou!', do: [{ id: 'market.neighbor.happy-festival-lou.l-happy-festival', say: ['neighbor', 'Happy festival, Pixel. Next year, you organise it.'] }] },
    ],
    seller: [
      { id: 'market.seller.why-are-you-walking', topic: 'Why are you walking around?', do: [
        { id: 'market.seller.why-are-you-walking.l-no-light-no', say: ['seller', 'No light, no customers. I walk my stall up and down the alley to keep warm.'] },
      ] },
      { id: 'market.seller.do-you-have-lamp-oil', topic: 'Do you have lamp oil?', if: '!oil_bought', do: [
        { id: 'market.seller.do-you-have-lamp-oil.l-oil-for-one', say: ['seller', 'Oil? For one token, a bottle. Best oil in the market.'] },
      ] },
    ],
  },
  hints: [
    { id: 'market.hint', until: 'board_hung', lines: [{ id: 'market.hint.l-the-festival', text: 'The festival board goes on the stage behind the tiled booth.' }] },
    { id: 'market.hint-2', until: 'festival', lines: [{ id: 'market.hint-2.l-a-lit-lamp-on', text: 'A lit lamp on the big lamp post, once the lights are on.' }] },
  ],
});
