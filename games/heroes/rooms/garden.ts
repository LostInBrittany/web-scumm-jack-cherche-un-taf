import { defineRoom } from '@engine/core/define';

// The one room: Grandma's garden. The gate is locked, the key is under the watering can, Grandma says so. The same
// puzzle for the three heroes; what changes is the hero's name (`{hero}`), the words Grandma uses for each one
// (`{form?…}`), one look that is a rule of its own for the gull (`if: { flag: 'form', eq: 'gull' }`), and the clips of
// the dust line, one per hero (game.ts `audio.voices`).
export default defineRoom({
  id: 'garden',
  name: 'The garden',
  decor: 'decor/backyard',
  description:
    'A sunny cottage garden behind the house: the stone house and its back door on the left, a bench, a watering can, a garden gnome, a green wooden gate and a cherry tree on the right',

  actors: { grandma: { char: 'grandma', facing: 'left' } },

  hotspots: {
    back_door: { name: 'back door' },
    gate: { name: 'garden gate' },
    bench: { name: 'bench' },
    gnome: { name: 'garden gnome' },
    tree: { name: 'cherry tree' },
    can: { name: 'watering can' },
  },

  look: {
    grandma: 'Grandma, watering the daisies. With a cup. The can is busy being a hiding place.',
    back_door: 'The back door. Breakfast is over. Adventure is outside.',
    gate: 'The garden gate. Locked. The world is on the other side.',
    bench: 'A bench. {form?biscuit=A perfect bed.|gull=A perfect perch.|*=Warm from the sun.}',
    gnome: 'A garden gnome. He has seen things.',
    tree: 'A cherry tree. Birds up there! ...Focus, {hero}.',
    can: 'A green watering can. Upside down. Suspicious.',
  },

  talk: {
    grandma: [
      {
        id: 'garden.grandma.good-morning',
        topic: 'Good morning, Grandma!',
        do: [
          {
            id: 'garden.hello',
            say: ['grandma', 'Good morning, {hero}! Ready, my {form?biscuit=big sleepyhead|gull=noisy seagull|*=little fluffball}?'],
          },
          { id: 'garden.ready', say: ['hero', '{form?biscuit=Ready. After a nap.|gull=Squawk! Ready!|*=Ready!}'] },
        ],
      },
      {
        id: 'garden.grandma.where-is-the-key',
        topic: 'Where is the gate key?',
        do: [
          {
            id: 'garden.dust',
            say: ['grandma', 'Under the watering can. Mind the dust: it tickles {form?pixel=your whiskers|biscuit=your big nose|gull=your beak}.'],
          },
        ],
      },
    ],
  },

  on: [
    // Logic that differs by hero is a rule with its condition: the gull looks at the tree as family.
    { id: 'garden.look-tree-gull', verb: 'look', a: 'tree', if: { flag: 'form', eq: 'gull' }, do: [{ id: 'garden.look-tree-gull.l', say: ['hero', 'A cherry tree. My cousins live up there. Loud cousins.'] }] },
    {
      id: 'garden.take-can', verb: ['take', 'use', 'open'], a: 'can', if: '!key_found',
      do: [{ gain: 'key' }, { set: 'key_found' }, { id: 'garden.take-can.l', say: ['hero', '{form?gull=Key. Shiny. Mine.|*=A key! Under the can, as promised.}'] }],
    },
    { id: 'garden.take-can-2', verb: ['take', 'use', 'open'], a: 'can', do: [{ id: 'garden.take-can-2.l', say: ['hero', 'Just dust now. Atchoo.'] }] },
    {
      id: 'garden.open-gate', verb: ['open', 'use'], a: 'gate', if: { not: { has: 'key' } },
      do: [{ id: 'garden.open-gate.l', say: ['hero', 'Locked. {form?gull=I could fly over it. Grandma wants it opened, though.|*=Too high to jump. Even for me.}'] }] },
    {
      id: 'garden.use-key-gate', verb: ['use', 'open'], a: 'key', b: 'gate',
      do: [
        { used: 'key' },
        { id: 'garden.bye', say: ['grandma', 'Off you go, {hero}. Come back safe!'] },
        { end: true },
      ],
    },
    { id: 'garden.open-gate-key', verb: ['open', 'use'], a: 'gate', do: [{ id: 'garden.open-gate-key.l', say: ['hero', 'The key goes in the lock. Use the key with the gate.'] }] },
    { id: 'garden.open-door', verb: ['open', 'use'], a: 'back_door', do: [{ id: 'garden.open-door.l', say: ['hero', 'Not back inside. Today is a gate day.'] }] },
  ],

  hints: [
    { id: 'garden.hint', until: 'key_found', lines: [{ id: 'garden.hint.l', text: 'Grandma knows where the key is.' }] },
    { id: 'garden.hint-2', until: { not: { has: 'key' } }, lines: [{ id: 'garden.hint-2.l', text: 'The key. The gate. Together.' }] },
  ],
});
