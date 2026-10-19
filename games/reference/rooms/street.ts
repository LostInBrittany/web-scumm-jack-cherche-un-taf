import { defineRoom } from '@engine/core/define';

// The street, at night, before the festival: the lights are out. The fuse box behind the left door wants a new cable
// (the cables minigame); then the whole market lights up (`lights_on`, the `lights` event).
export default defineRoom({
  id: 'street',
  name: 'The street',
  decor: 'decor/street',
  music: 'theme',
  description: 'A market street at night: two blue doors under stone arches, closed stalls, unlit lanterns',
  renderer: 'canvas',
  stage: {
    lights: [
      { id: 'dark', kind: 'ambient', color: '#2a3070', intensity: 0.55, blend: 'multiply', visible: '!lights_on' },
      { id: 'glow', kind: 'radial', color: '#ffcc66', intensity: 0.7, visible: 'lights_on' },
    ],
    transition: 'fade',
  },
  hotspots: {
    fusebox: { name: 'fuse box' },
    stalls: { name: 'closed stalls' },
  },
  exits: {
    hall_door: { name: 'left blue door', to: 'hall', entry: 'from_street' },
    kitchen_door: { name: 'right blue door', to: 'kitchen', entry: 'from_street' },
    to_market: { name: 'way to the market', to: 'market', entry: 'from_street' },
    to_yard: { name: 'way to the garden', to: 'yard', entry: 'from_street' },
  },
  look: {
    fusebox: [{ id: 'street.look-fusebox.l-the-fuse-box-one', text: 'The fuse box. One cable is burnt black. Lou needs a new one.' }, { id: 'street.look-fusebox.l-still-the-fuse', text: 'Still the fuse box. Still burnt.' }],
    stalls: 'Closed stalls. They open when the lights come back.',
    hall_door: 'The left blue door: Lou\'s festival office.',
    kitchen_door: 'The right blue door: Grandma\'s kitchen. It smells of soup.',
    to_market: 'The market, down the street. Dark as a cupboard.',
    to_yard: 'The way round to Grandma\'s garden.',
  },
  on: [
    { id: 'street.use-cable-fusebox', verb: 'use', a: 'cable', b: 'fusebox', if: '!lights_on', do: [
      { id: 'street.use-cable-fusebox.l-new-cable-right', say: ['hero', 'New cable. Right colour, right hole. How hard can it be?'] },
      { minigame: 'cables', params: {
        board: 'cables/panneau', knot: 'cables/noeud',
        plugs: { red: 'cables/fiche_rouge', blue: 'cables/fiche_bleu', yellow: 'cables/fiche_jaune', green: 'cables/fiche_vert' },
        lampOn: 'cables/lampe_on', lampOff: 'cables/lampe_off', gags: ['lamp'], sfx: { ring: 'ring', stamp: 'click' },
        intro: 'Plug each cable into its socket.',
      } },
      { lose: 'cable' },
      { set: 'lights_on' },
      { sfx: 'success', caption: '[The whole street hums: the lights are back]' },
      { emit: 'lights' },
      { id: 'street.use-cable-fusebox.l-light-the-market', say: ['hero', 'LIGHT! The market wakes up. Now the board and the lamp.'] },
    ] },
    { id: 'street.open-fusebox', verb: 'open', a: 'fusebox', if: '!lights_on', do: [{ say: ['hero', 'It is open. And burnt. I need a spare cable.'], id: 'street.open-fusebox.l-it-is-open-and' }] },
    { id: 'street.open-fusebox-2', verb: 'open', a: 'fusebox', do: [{ say: ['hero', 'It hums. I leave it alone now.'], id: 'street.open-fusebox-2.l-it-hums-i-leave' }] },
  ],
  hints: [
    { id: 'street.hint', until: 'lights_on', lines: [{ id: 'street.hint.l-the-fuse-box', text: 'The fuse box needs a cable. Lou keeps spares in the cellar, under Grandma\'s kitchen.' }] },
  ],
});
