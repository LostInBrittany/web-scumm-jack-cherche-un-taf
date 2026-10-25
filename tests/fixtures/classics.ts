// Micro-games for the classic adventure mechanics (wiki/en/create.classics.md): each one is a famous puzzle shape written
// with the DSL as is, one or two rooms, no art. tests/classics.test.ts proves them with the engine and the solver.
import type { Cmd, GameDef, Layout } from '@engine/core/types';

const verbs: GameDef['verbs'] = [
  { id: 'look', label: 'Look', color: '#fff' },
  { id: 'take', label: 'Take', color: '#fff' },
  { id: 'use', label: 'Use', color: '#fff', join: 'with' },
  { id: 'give', label: 'Give', color: '#fff', join: 'to' },
  { id: 'talk', label: 'Talk', color: '#fff' },
];
const fallbacks = { look: ['Nothing.'], take: ['No.'], use: ['No.'], give: ['No.'], talk: ['...'], use2: ['No.'] };
const skin: GameDef['skin'] = { icons: { map: 'ui/map', pause: 'ui/pause', music: 'ui/music' } };
const ui = {} as GameDef['ui'];
const hero = { name: 'Hero', color: '#fff', sprites: { idle: ['h/1'] } };

/** Insult sword fighting: insults are learnt from a thug (flags), the duel is a topic whose choices depend on them. */
export function insults(): GameDef {
  return {
    id: 'insults',
    title: 'Insults',
    saveVersion: 1,
    hero: 'hero',
    verbs,
    skin,
    ui,
    characters: {
      hero,
      thug: { name: 'Thug', color: '#f00', sprites: { idle: ['t/1'] } },
      master: { name: 'Sword Master', color: '#0f0', sprites: { idle: ['m/1'] } },
    },
    items: {},
    rooms: [
      {
        id: 'dock',
        name: 'Dock',
        decor: 'd/dock',
        actors: { thug: { char: 'thug' }, master: { char: 'master' } },
        look: { thug: 'A thug.', master: 'The Sword Master.' },
        talk: {
          thug: [
            {
              topic: 'Fight me!',
              if: '!learned_farmer',
              do: [{ say: ['thug', 'You fight like a dairy farmer!'] }, { set: 'learned_farmer' }, 'Noted.'],
            },
            {
              topic: 'Fight me again!',
              if: { all: ['learned_farmer', '!learned_dog'] },
              do: [{ say: ['thug', 'I once owned a dog smarter than you.'] }, { set: 'learned_dog' }, 'Noted.'],
            },
          ],
          master: [
            {
              topic: 'I challenge you!',
              do: [
                { say: ['master', 'You fight like a dairy farmer!'] },
                {
                  choice: [
                    { text: 'How appropriate. You fight like a cow.', if: 'learned_farmer', do: [{ inc: 'wins' }] },
                    { text: 'Oh yeah?', do: [{ say: ['master', 'Pathetic.'] }] },
                  ],
                },
                { say: ['master', 'I once owned a dog smarter than you.'] },
                {
                  choice: [
                    { text: 'He must have taught you everything you know.', if: 'learned_dog', do: [{ inc: 'wins' }] },
                    { text: 'Oh yeah?', do: [{ say: ['master', 'Pathetic.'] }] },
                  ],
                },
                {
                  if: { flag: 'wins', gte: 2 },
                  then: [{ say: ['master', 'You win.'] }, { set: 'master_beaten' }, { end: true }],
                  else: [{ set: ['wins', 0] }, { say: ['master', 'Come back when you can insult.'] }],
                },
              ],
            },
          ],
        },
      },
    ],
    rules: { fallbacks },
    start: { room: 'dock' },
  };
}
export const insultsLayouts: Record<string, Layout> = {
  dock: {
    entries: { default: [320, 360] },
    actors: { thug: { x: 150, y: 330, h: 100 }, master: { x: 500, y: 330, h: 100 } },
  },
};

/** The mug of grog that melts: a world script turns the item into another one while the player walks. */
export function grog(): GameDef {
  return {
    id: 'grog',
    title: 'Grog',
    saveVersion: 1,
    hero: 'hero',
    verbs,
    skin,
    ui,
    characters: { hero },
    items: {
      mug_grog: { name: 'mug of grog', icon: 'i/mug', look: 'It fizzes… and the mug melts.' },
      mug_holey: { name: 'holey mug', icon: 'i/mug2', look: 'Empty and holey.' },
    },
    rooms: [
      {
        id: 'bar',
        name: 'Bar',
        decor: 'd/bar',
        hotspots: { barrel: { name: 'barrel' }, door: { name: 'door' } },
        look: { barrel: 'Grog.', door: 'To the street.' },
        on: [
          {
            verb: 'use',
            a: 'barrel',
            if: { not: { any: [{ has: 'mug_grog' }, { has: 'mug_holey' }] } },
            do: [{ gain: 'mug_grog' }, 'A mug of grog.'],
          },
          { verb: 'use', a: 'mug_holey', b: 'barrel', do: [{ lose: 'mug_holey' }, { gain: 'mug_grog' }, 'Refilled.'] },
          { verb: 'use', a: 'door', do: [{ goto: 'street' }] },
        ],
      },
      {
        id: 'street',
        name: 'Street',
        decor: 'd/street',
        hotspots: { bar: { name: 'bar' }, jail: { name: 'jail' } },
        look: { bar: 'The bar.', jail: 'The jail.' },
        on: [
          { verb: 'use', a: 'bar', do: [{ goto: 'bar' }] },
          { verb: 'use', a: 'jail', do: [{ goto: 'jail' }] },
        ],
      },
      {
        id: 'jail',
        name: 'Jail',
        decor: 'd/jail',
        hotspots: { lock: { name: 'lock' }, street: { name: 'street' } },
        look: { lock: 'A lock.', street: 'Back.' },
        on: [
          {
            verb: 'use',
            a: 'mug_grog',
            b: 'lock',
            do: [{ lose: 'mug_grog' }, 'The grog eats the lock.', { set: 'free' }, { end: true }],
          },
          { verb: 'use', a: 'mug_holey', b: 'lock', do: ['Nothing left in it.'] },
          { verb: 'use', a: 'street', do: [{ goto: 'street' }] },
        ],
      },
    ],
    scripts: [
      {
        id: 'mug_melts',
        loop: true,
        while: { has: 'mug_grog' },
        do: [{ wait: 8000 }, { gain: 'mug_holey' }, { lose: 'mug_grog' }, { toast: 'The mug melted.' }],
      },
    ],
    rules: { fallbacks },
    start: { room: 'bar' },
  };
}
export const grogLayouts: Record<string, Layout> = {
  bar: {
    entries: { default: [320, 360] },
    hotspots: { barrel: { rect: [10, 10, 50, 50] }, door: { rect: [100, 10, 50, 50] } },
  },
  street: {
    entries: { default: [320, 360] },
    hotspots: { bar: { rect: [10, 10, 50, 50] }, jail: { rect: [100, 10, 50, 50] } },
  },
  jail: {
    entries: { default: [320, 360] },
    hotspots: { lock: { rect: [10, 10, 50, 50] }, street: { rect: [100, 10, 50, 50] } },
  },
};

/** The tree planted in the past: one playable character changes the world another one sees; an item travels between them. */
export function dott(): GameDef {
  return {
    id: 'dott',
    title: 'Dott',
    saveVersion: 1,
    hero: 'hoagie',
    verbs,
    skin,
    ui,
    players: { ids: ['hoagie', 'laverne'], start: { laverne: { room: 'future' } } },
    characters: {
      hoagie: { name: 'Hoagie', color: '#fff', sprites: { idle: ['h/1'] } },
      laverne: { name: 'Laverne', color: '#0ff', sprites: { idle: ['l/1'] } },
      oldman: { name: 'Old man', color: '#ff0', sprites: { idle: ['o/1'] } },
    },
    items: {
      seed: { name: 'seed', icon: 'i/seed', look: 'A seed.' },
      fruit: { name: 'fruit', icon: 'i/fruit', look: 'A fruit from the future.' },
    },
    rooms: [
      {
        id: 'past',
        name: 'Past',
        decor: 'd/past',
        hotspots: { ground: { name: 'ground' }, chron: { name: 'Chron-O-John' } },
        actors: { oldman: { char: 'oldman' } },
        look: { ground: 'Bare ground.', chron: 'A portable toilet through time.', oldman: 'He looks hungry.' },
        on: [
          { verb: 'use', a: 'seed', b: 'ground', do: [{ lose: 'seed' }, { set: 'tree_planted' }, 'Planted.'] },
          {
            verb: 'give',
            a: 'fruit',
            b: 'oldman',
            do: [{ lose: 'fruit' }, { say: ['oldman', 'Delicious!'] }, { end: true }],
          },
        ],
      },
      {
        id: 'future',
        name: 'Future',
        decor: 'd/future',
        hotspots: {
          tree: { name: 'huge tree', visible: 'tree_planted' },
          stump: { name: 'bare ground', visible: '!tree_planted' },
          chron: { name: 'Chron-O-John' },
        },
        look: { tree: 'Two hundred years of growth.', stump: 'Nothing grows here.', chron: 'Flush to send.' },
        on: [
          { verb: 'take', a: 'tree', if: '!fruit_taken', do: [{ gain: 'fruit' }, { set: 'fruit_taken' }, 'A fruit.'] },
          { verb: 'use', a: 'fruit', b: 'chron', do: [{ transfer: ['fruit', 'hoagie'] }, 'Flushed to the past.'] },
        ],
      },
    ],
    rules: { fallbacks },
    start: { room: 'past', inventory: ['seed'] },
  };
}
export const dottLayouts: Record<string, Layout> = {
  past: {
    entries: { default: [320, 360] },
    hotspots: { ground: { rect: [10, 10, 50, 50] }, chron: { rect: [100, 10, 50, 50] } },
    actors: { oldman: { x: 500, y: 330, h: 100 } },
  },
  future: {
    entries: { default: [320, 360] },
    hotspots: {
      tree: { rect: [10, 10, 50, 50] },
      stump: { rect: [10, 10, 50, 50] },
      chron: { rect: [100, 10, 50, 50] },
    },
  },
};

/** The patrolling nurse: a moving NPC catches the hero in the wrong room at the wrong time. Turn by turn, not real time. */
export function mansion(): GameDef {
  const caught: Cmd[] = [{ say: ['edna', 'Got you!'] }, { goto: 'dungeon' }];
  return {
    id: 'mansion',
    title: 'Mansion',
    saveVersion: 1,
    hero: 'hero',
    verbs,
    skin,
    ui,
    characters: { hero, edna: { name: 'Edna', color: '#f0f', room: 'kitchen', sprites: { idle: ['e/1'] } } },
    items: { key: { name: 'key', icon: 'i/key', look: 'The key.' } },
    rooms: [
      {
        id: 'hall',
        name: 'Hall',
        decor: 'd/hall',
        actors: { edna: { char: 'edna' } },
        hotspots: {
          kitchen: { name: 'kitchen door' },
          library: { name: 'library door' },
          exit: { name: 'front door' },
        },
        look: { kitchen: 'The kitchen.', library: 'The library.', exit: 'Locked.', edna: 'Edna.' },
        onEnter: [{ if: { actorIn: ['edna', 'hall'] }, then: caught }],
        on: [
          { verb: 'use', a: 'kitchen', do: [{ goto: 'kitchen' }] },
          { verb: 'use', a: 'library', do: [{ goto: 'library' }] },
          { verb: 'use', a: 'key', b: 'exit', do: ['Free!', { end: true }] },
        ],
      },
      {
        id: 'kitchen',
        name: 'Kitchen',
        decor: 'd/kitchen',
        actors: { edna: { char: 'edna' } },
        hotspots: { hall: { name: 'hall door' }, library: { name: 'library door' }, drawer: { name: 'drawer' } },
        look: { hall: 'The hall.', library: 'The library.', drawer: 'A drawer.', edna: 'Edna.' },
        onEnter: [{ if: { actorIn: ['edna', 'kitchen'] }, then: caught }],
        on: [
          { verb: 'use', a: 'hall', do: [{ goto: 'hall' }] },
          { verb: 'use', a: 'library', do: [{ goto: 'library' }] },
          { verb: 'take', a: 'drawer', if: '!key_taken', do: [{ gain: 'key' }, { set: 'key_taken' }] },
        ],
      },
      {
        id: 'library',
        name: 'Library',
        decor: 'd/library',
        hotspots: { hall: { name: 'hall door' }, kitchen: { name: 'kitchen door' } },
        look: { hall: 'The hall.', kitchen: 'The kitchen.' },
        on: [
          { verb: 'use', a: 'hall', do: [{ goto: 'hall' }] },
          { verb: 'use', a: 'kitchen', do: [{ goto: 'kitchen' }] },
        ],
      },
      {
        id: 'dungeon',
        name: 'Dungeon',
        decor: 'd/dungeon',
        hotspots: { brick: { name: 'loose brick' } },
        look: { brick: 'Loose.' },
        on: [{ verb: 'use', a: 'brick', do: [{ goto: 'hall' }] }],
      },
    ],
    scripts: [
      {
        id: 'edna_patrols',
        loop: true,
        do: [
          { wait: 6000 },
          { moveActor: ['edna', 'hall'] },
          { emit: 'edna_moved' },
          { wait: 6000 },
          { moveActor: ['edna', 'kitchen'] },
          { emit: 'edna_moved' },
        ],
      },
    ],
    events: [
      {
        on: 'edna_moved',
        if: {
          any: [
            { all: [{ room: 'hall' }, { actorIn: ['edna', 'hall'] }] },
            { all: [{ room: 'kitchen' }, { actorIn: ['edna', 'kitchen'] }] },
          ],
        },
        do: caught,
      },
    ],
    rules: { fallbacks },
    start: { room: 'hall' },
  };
}
export const mansionLayouts: Record<string, Layout> = {
  hall: {
    entries: { default: [320, 360] },
    actors: { edna: { x: 200, y: 330, h: 100 } },
    hotspots: {
      kitchen: { rect: [10, 10, 50, 50] },
      library: { rect: [200, 10, 50, 50] },
      exit: { rect: [100, 10, 50, 50] },
    },
  },
  kitchen: {
    entries: { default: [320, 360] },
    actors: { edna: { x: 200, y: 330, h: 100 } },
    hotspots: {
      hall: { rect: [10, 10, 50, 50] },
      library: { rect: [200, 10, 50, 50] },
      drawer: { rect: [100, 10, 50, 50] },
    },
  },
  library: {
    entries: { default: [320, 360] },
    hotspots: { hall: { rect: [10, 10, 50, 50] }, kitchen: { rect: [100, 10, 50, 50] } },
  },
  dungeon: { entries: { default: [320, 360] }, hotspots: { brick: { rect: [10, 10, 50, 50] } } },
};

/** Haggling with a used-ship salesman: a numeric flag goes down, a topic opens below a threshold. */
export function stan(): GameDef {
  return {
    id: 'stan',
    title: 'Stan',
    saveVersion: 1,
    hero: 'hero',
    verbs,
    skin,
    ui,
    characters: { hero, stan: { name: 'Stan', color: '#ff0', sprites: { idle: ['s/1'] } } },
    items: { coins: { name: 'coins', icon: 'i/coins', look: 'Five thousand pieces of eight.' } },
    rooms: [
      {
        id: 'yard',
        name: 'Yard',
        decor: 'd/yard',
        actors: { stan: { char: 'stan' } },
        look: { stan: "Stan, of Stan's Previously Owned Vessels." },
        talk: {
          stan: [
            {
              topic: 'How much for the Sea Monkey?',
              if: '!asked',
              do: [{ set: 'asked' }, { say: ['stan', 'Ten thousand. But for you, 8000!'] }],
            },
            {
              topic: 'That is too much.',
              if: { all: ['asked', { flag: 'price', gte: 6000 }] },
              do: [{ inc: 'price', by: -1000 }, { say: ['stan', 'Fine, 1000 less!'] }],
            },
            {
              topic: 'That is too much.',
              if: { all: ['asked', { flag: 'price', lt: 6000 }] },
              do: [{ say: ['stan', 'Not a coin less than 5000!'] }],
            },
            {
              topic: 'Deal.',
              if: { all: ['asked', { flag: 'price', lt: 5001 }, { has: 'coins' }] },
              do: [{ lose: 'coins' }, { set: 'ship_bought' }, { say: ['stan', 'Sold!'] }, { end: true }],
            },
          ],
        },
      },
    ],
    rules: { fallbacks },
    start: { room: 'yard', inventory: ['coins'], flags: { price: 8000 } },
  };
}
export const stanLayouts: Record<string, Layout> = {
  yard: { entries: { default: [320, 360] }, actors: { stan: { x: 400, y: 330, h: 100 } } },
};
