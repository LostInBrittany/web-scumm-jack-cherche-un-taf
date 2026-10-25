// Three heroes chosen at New Game (4.3.0 "Hero Choice", PLAN-4.3-HERO-CHOICE §6 step 5; tests/hero-choice.test.ts).
// One hero character, `kid`: its written look and name are the robot's, and two variants, read from the flag `form`,
// make it the knight or the witch, each with its own name. The intro asks with portraits; Grandma's lines switch on
// `form` and name the hero with `{hero}`; a French table translates some lines, its own words inside the braces.
// Grandma's line about the dust is voiced once per hero. The puzzle: take the key under the rug, open the door with it.
import type { GameDef, Layout } from '@engine/core/types';

export function heroes(): GameDef {
  return {
    id: 'heroes',
    title: 'Heroes',
    lang: 'en',
    saveVersion: 1,
    hero: 'kid',
    verbs: [
      { id: 'look', label: 'Look', color: '#fff' },
      { id: 'talk', label: 'Talk', color: '#fff' },
      { id: 'take', label: 'Take', color: '#fff' },
      { id: 'use', label: 'Use', color: '#fff', join: 'with' },
    ],
    characters: {
      kid: {
        name: 'Robo',
        color: '#fff',
        sprites: { idle: ['kid/robot'] },
        portrait: 'kid/robot_face',
        variants: [
          {
            if: { flag: 'form', eq: 'knight' },
            name: 'Sir Lance',
            sprites: { idle: ['kid/knight'] },
            portrait: 'kid/knight_face',
          },
          {
            if: { flag: 'form', eq: 'witch' },
            name: 'Morwen',
            sprites: { idle: ['kid/witch'] },
            portrait: 'kid/witch_face',
          },
        ],
      },
      grandma: { name: 'Grandma', color: '#f9c', sprites: { idle: ['grandma/idle'] } },
    },
    items: { key: { name: 'key', icon: 'items/key', look: 'A brass key, just the size of {hero}’s hand.' } },
    rooms: [
      {
        id: 'hall',
        name: 'Hall',
        decor: 'hall',
        hotspots: { door: { name: 'door' }, rug: { name: 'rug' } },
        actors: { grandma: { char: 'grandma' } },
        look: {
          door: 'The front door. Locked.',
          rug: 'A rug with a bump in the middle.',
          grandma:
            'Grandma, knitting {form?knight=a scarf for my helmet|witch=a sock for my broom|robot=a cosy for my antenna}.',
        },
        talk: {
          grandma: [
            {
              topic: 'Good morning, Grandma!',
              do: [
                {
                  say: [
                    'grandma',
                    'Good morning, {hero}! Ready, my {form?knight=brave knight|witch=clever witch|*=shiny robot}?',
                  ],
                },
                'Ready.',
              ],
            },
            {
              topic: 'Where is the key?',
              do: [
                {
                  say: [
                    'grandma',
                    'Under the rug. Mind the dust: it makes {form?robot=it|witch=her|knight=him} sneeze.',
                  ],
                  id: 'sneeze',
                },
              ],
            },
          ],
        },
        on: [
          {
            verb: 'take',
            a: 'rug',
            if: '!key_found',
            do: [{ gain: 'key' }, { set: 'key_found' }, '{form?robot=Key acquired.|*=Got it!}'],
          },
          { verb: 'take', a: 'rug', do: ['Just dust now.'] },
          {
            verb: 'use',
            a: 'key',
            b: 'door',
            do: [{ used: 'key' }, { say: ['grandma', 'Off you go, {hero}. Come back safe!'] }, { end: true }],
          },
        ],
        hints: [{ until: 'key_found', lines: ['Grandma knows where the key is.'] }],
      },
    ],
    rules: {
      fallbacks: { look: ['Nothing special.'], talk: ['…'], take: ['No.'], use: ['No.'], use2: ['That does nothing.'] },
    },
    start: {
      room: 'hall',
      intro: [
        'Who am I this morning?',
        {
          choice: [
            { text: 'Sir Lance', img: 'kid/knight_face', do: [{ set: ['form', 'knight'] }] },
            { text: 'Morwen', img: 'kid/witch_face', do: [{ set: ['form', 'witch'] }] },
            { text: 'Robo', img: 'kid/robot_face', do: [{ set: ['form', 'robot'] }] },
          ],
        },
      ],
    },
    // One clip per hero for Grandma's switched line (`<id>~form=<value>`); the files are the author's to name.
    audio: {
      voices: {
        'sneeze~form=knight': 'grandma/sneeze-him.mp3',
        'sneeze~form=witch': 'grandma/sneeze-her.mp3',
        'sneeze~form=robot': 'grandma/sneeze-it.mp3',
      },
    },
    checkpoints: {
      knight_key: { room: 'hall', inventory: ['key'], flags: { form: 'knight', key_found: true } },
      witch_key: { room: 'hall', inventory: ['key'], flags: { form: 'witch', key_found: true } },
      robot_key: { room: 'hall', inventory: ['key'], flags: { form: 'robot', key_found: true } },
    },
    skin: { icons: { map: 'ui/map', pause: 'ui/pause', music: 'ui/music' } },
    ui: {} as GameDef['ui'],
  };
}

export const heroesLayouts: Record<string, Layout> = {
  hall: {
    entries: { default: [320, 360] },
    hotspots: { door: { rect: [500, 120, 80, 200] }, rug: { rect: [260, 330, 120, 30] } },
    actors: { grandma: { x: 140, y: 340, h: 110 } },
  },
};

/** The image manifest the validator checks ids against (`npm run assets` writes the real one). */
export const heroesImages: Record<string, [number, number]> = Object.fromEntries(
  [
    'hall',
    'kid/robot',
    'kid/knight',
    'kid/witch',
    'kid/robot_face',
    'kid/knight_face',
    'kid/witch_face',
    'grandma/idle',
    'items/key',
    'ui/map',
    'ui/pause',
    'ui/music',
  ].map((k) => [k, [10, 10] as [number, number]]),
);
