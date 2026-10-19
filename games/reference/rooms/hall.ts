import { defineRoom } from '@engine/core/define';

// The festival office, behind the left blue door: Lou and his big map of the town. He gives the board once the lights
// are back.
export default defineRoom({
  id: 'hall',
  name: 'The festival office',
  decor: 'decor/map',
  description: 'A room papered with a huge old map; Lou\'s office for the festival',
  actors: { neighbor: { char: 'neighbor', facing: 'left' } },
  hotspots: { map: { name: 'big map' } },
  exits: { out: { name: 'back to the street', to: 'street', entry: 'from_hall' } },
  look: {
    map: 'A map of the whole world. Our street is not on it. Rude.',
    neighbor: 'Lou, festival organiser. He has a whistle and a clipboard.',
    out: 'Back to the street.',
  },
  on: [
    // The code wheel (4.1.15, docs/en/REMIX.md): an optional, playful pirate check before Lou lets Pixel near his map.
    // Its combination comes from the world's seed (the `copy-protection` stream); `parody`: three wrong answers and Lou
    // gives up. Not a protection of anything: a joke the player is in on.
    { id: 'hall.use-map', verb: ['use', 'push', 'open'], a: 'map', if: '!pirate_checked', do: [
      { id: 'hall.use-map.l-not-so-fast', say: ['neighbor', 'Not so fast! First, the Extremely Legitimate Pirate Check. Festival rules.'] },
      { minigame: 'code-wheel', params: {
        mode: 'parody', tries: 3,
        actors: [
          { id: 'pixel', label: 'Pixel', img: 'hero/r1c1' }, { id: 'biscuit', label: 'Biscuit', img: 'cat/r1c2' },
          { id: 'grandma', label: 'Grandma', img: 'grandma/r1c2' }, { id: 'lou', label: 'Lou', img: 'neighbor/r1c2' },
          { id: 'seller', label: 'the seller', img: 'seller/r1c2' },
        ],
        symbols: [
          { id: 'key', label: 'the key', img: 'items/r2c4' }, { id: 'token', label: 'the token', img: 'items/r2c2' },
          { id: 'oil', label: 'the oil', img: 'items/r2c3' }, { id: 'matches', label: 'the matches', img: 'items/r1c6' },
          { id: 'cable', label: 'the cable', img: 'items/r1c2' },
        ],
        answers: ['STREET', 'MARKET', 'ALLEY', 'YARD', 'CELLAR'],
        wrong: ['Arr. That is not what the wheel says.', 'Nope. Did you turn the small disc?', 'A pirate would never.'],
        pass: 'Fine. You look legitimate enough. Go on.',
        win: 'Legitimate! Welcome aboard the festival.',
      }, then: [
        { set: 'pirate_checked' },
        { id: 'hall.use-map.l-our-street-is', say: ['neighbor', 'Our street is not on the map either. I checked. Twice.'] },
      ] },
    ] },
  ],
  talk: {
    neighbor: [
      { id: 'hall.neighbor.what-does-the-festival', topic: 'What does the festival need?', do: [
        { id: 'hall.neighbor.what-does-the-festival.l-three-things', say: ['neighbor', 'Three things. Lights: the fuse box wants a new cable. A board on the stage. And a lit lamp on the big lamp post.'] },
        { choice: [
          { id: 'hall.neighbor.what-does-the-festival.c-where-is-a-cable', text: 'Where is a cable?', do: [{ id: 'hall.neighbor.what-does-the-festival.c-where-is-a-cable.l-spares-in', say: ['neighbor', 'Spares in Grandma\'s cellar. If she finds the key.'] }] },
          { id: 'hall.neighbor.what-does-the-festival.c-where-is-the', text: 'Where is the board?', do: [{ id: 'hall.neighbor.what-does-the-festival.c-where-is-the.l-here-you-get-it', say: ['neighbor', 'Here. You get it when the lights work. No light, no board. Rules.'] }] },
          { id: 'hall.neighbor.what-does-the-festival.c-where-is-a-lamp', text: 'Where is a lamp?', do: [{ id: 'hall.neighbor.what-does-the-festival.c-where-is-a-lamp.l-there-was-an-old', say: ['neighbor', 'There was an old one on Grandma\'s garden wall.'] }] },
        ] },
      ] },
      // Remix (4.1.15, `festival-order`): in a world where the board comes first, Lou hands it over before the lights.
      { id: 'hall.neighbor.can-i-have-the-board', topic: 'Can I have the board now?', if: { all: [{ flag: 'remix.festival-order.board', eq: 0 }, '!board_given'] }, do: [
        { id: 'hall.neighbor.can-i-have-the-board.l-board-first-this', say: ['neighbor', 'Board first this year! The lights can wait. Hang it behind the tiled booth.'] },
        { gain: 'board' }, { set: 'board_given' },
      ] },
      // Remix (`festival-password`): the password is Grandma's riddle; its answer and its riddle are drawn together.
      { id: 'hall.neighbor.i-know-the-password', topic: 'I know the festival password!', if: '!password_ok', do: [
        { id: 'hall.neighbor.i-know-the-password.l-go-on-then', say: ['neighbor', 'Go on then. Three digits.'] },
        { choice: [
          { id: 'hall.neighbor.i-know-the-password.c-317', text: '317', do: [{ if: { not: { any: [{ flag: 'remix.festival-password', eq: '542' }, { flag: 'remix.festival-password', eq: '868' }] } }, then: [{ set: 'password_ok' }] }] },
          { id: 'hall.neighbor.i-know-the-password.c-542', text: '542', do: [{ if: { flag: 'remix.festival-password', eq: '542' }, then: [{ set: 'password_ok' }] }] },
          { id: 'hall.neighbor.i-know-the-password.c-868', text: '868', do: [{ if: { flag: 'remix.festival-password', eq: '868' }, then: [{ set: 'password_ok' }] }] },
        ] },
        { if: 'password_ok', then: [
          { pose: ['neighbor', 'thumbs'] },
          { id: 'hall.neighbor.i-know-the-password.l-code-right', say: ['neighbor', '{code:festival-password}! Right. You are on the festival crew, Pixel.'] },
          { pose: ['neighbor', 'idle'] },
        ], else: [
          { id: 'hall.neighbor.i-know-the-password.l-not-that-one', say: ['neighbor', 'Not that one. Grandma knows my riddle.'] },
        ] },
      ] },
      { id: 'hall.neighbor.the-lights-are-back', topic: 'The lights are back!', if: { all: ['lights_on', '!board_given'] }, do: [
        { pose: ['neighbor', 'celebrate'] },
        { id: 'hall.neighbor.the-lights-are-back.l-i-saw-here-the', say: ['neighbor', 'I saw! Here, the board. Hang it on the stage, behind the tiled booth.'] },
        { gain: 'board' }, { set: 'board_given' }, { pose: ['neighbor', 'idle'] },
      ] },
    ],
  },
  hints: [{ id: 'hall.hint', until: 'board_given', lines: [{ id: 'hall.hint.l-lou-gives-the', text: 'Lou gives the board once the lights are back.' }] }],
});
