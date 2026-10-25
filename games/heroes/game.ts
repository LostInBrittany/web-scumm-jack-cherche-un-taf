import { defineGame } from '@engine/core/define';
import { game as demo } from '../demo/game';
import { characters } from './cast';
import garden from './rooms/garden';

// "Who Am I Today?": the playable example of choosing the hero (4.3.0 "Hero Choice", 4.4.0; ADR 0022). Three heroes
// on portrait cards at New Game, the same puzzle for each (the gate key under the watering can), their names in the
// lines (`{hero}`), the words Grandma uses for each one (`{form?…}`), English and French (locales/fr.json, where
// French adds its own agreements), Grandma's lines voiced per hero (`<id>~form=<value>` in `audio.voices` and
// `audio.voicesByLang.fr`); a save keeps the hero. The sample game's art and interface (D13). Its e2e: e2e.mjs.
export const game = defineGame({
  id: 'heroes',
  title: 'Who Am I Today?',
  lang: 'en',
  schemaVersion: 3,
  saveVersion: 1,
  hero: 'hero',
  verbs: demo.verbs.filter((v) => ['open', 'take', 'look', 'talk', 'use'].includes(v.id)),
  characters,
  items: { key: { name: 'gate key', icon: 'items/r2c4', look: 'The gate key. Just the size of {form?gull=a beak|*=a paw}.' } },
  rooms: [garden],
  // The answers to anything else, worded for whoever the hero is.
  rules: {
    fallbacks: {
      look: [{ id: 'fallback.look.l-nothing', text: 'Nothing special.' }, { id: 'fallback.look.l-not-edible', text: '{form?gull=Not edible. Probably.|*=Not a sardine.}' }],
      talk: [{ id: 'fallback.talk.l-no-answer', text: 'No answer. Rude.' }, { id: 'fallback.talk.l-meow', text: '{form?gull=Squawk? No answer.|*=Meow? No answer.}' }],
      take: [{ id: 'fallback.take.l-too-heavy', text: '{form?gull=Too heavy for a beak.|biscuit=Too heavy. And I just woke up.|*=Too heavy for a kitten.}' }, { id: 'fallback.take.l-leave-it', text: 'I will leave it there.' }],
      open: [{ id: 'fallback.open.l-no', text: 'It does not open.' }],
      use: [{ id: 'fallback.use.l-nothing-happens', text: 'Nothing happens.' }, { id: 'fallback.use.l-does-nothing', text: 'That does nothing. Yet.' }],
      use2: [{ id: 'fallback.use2.l-not-together', text: 'These do not go together.' }],
    },
  },
  globalTalk: demo.globalTalk,
  start: {
    room: 'garden',
    // The intro runs before the room's arrival: the hero is chosen before anyone talks. With `img`, each answer is a
    // card with its portrait.
    intro: [
      { id: 'game.intro.l-who', say: ['hero', 'Who am I this morning?'] },
      {
        id: 'game.intro.c',
        choice: [
          { id: 'game.intro.c-pixel', text: 'Pixel', img: 'hero/r1c1', do: [{ set: ['form', 'pixel'] }] },
          { id: 'game.intro.c-biscuit', text: 'Biscuit', img: 'cat/r1c1', do: [{ set: ['form', 'biscuit'] }] },
          { id: 'game.intro.c-gull', text: 'Gaby', img: 'extras/r2c4', do: [{ set: ['form', 'gull'] }] },
        ],
      },
      { id: 'game.intro.l-me', say: ['hero', '{form?biscuit=Biscuit. Awake. Mostly.|gull=Gaby the gull. Squawk.|*=Pixel. Small, fluffy, ready.}'] },
    ],
  },
  // One ready state per hero, the key in the bag (?dev&at=<id>).
  checkpoints: {
    pixel_key: { room: 'garden', inventory: ['key'], flags: { form: 'pixel', key_found: true } },
    biscuit_key: { room: 'garden', inventory: ['key'], flags: { form: 'biscuit', key_found: true } },
    gull_key: { room: 'garden', inventory: ['key'], flags: { form: 'gull', key_found: true } },
  },
  // The dust line is recorded once per hero (`<id>~form=<value>`), in English and in French; the farewell has one
  // English clip (`{hero}` alone is not a switch), while French agrees it with the gull (`sain{form?gull=e|*=}`):
  // a clip for her, the plain one for the cats. The clips are stand-ins (a babble per hero, provenance.json).
  audio: {
    voices: {
      'garden.dust~form=pixel': 'heroes-dust-pixel.mp3',
      'garden.dust~form=biscuit': 'heroes-dust-biscuit.mp3',
      'garden.dust~form=gull': 'heroes-dust-gull.mp3',
      'garden.bye': 'heroes-bye.mp3',
    },
    voicesByLang: {
      fr: {
        'garden.dust~form=pixel': 'heroes-fr-dust-pixel.mp3',
        'garden.dust~form=biscuit': 'heroes-fr-dust-biscuit.mp3',
        'garden.dust~form=gull': 'heroes-fr-dust-gull.mp3',
        'garden.bye~form=gull': 'heroes-fr-bye-gull.mp3',
        'garden.bye': 'heroes-fr-bye.mp3',
      },
    },
  },
  skin: { ...demo.skin, sounds: {} },
  titleScreen: { decor: 'decor/backyard', footer: "Three heroes, one gate. A quest'n'click example." },
  credits: ['WHO AM I TODAY?', '', "An example of quest'n'click: choosing the hero", '', "Art: the sample game's (CC BY 4.0)", '', 'Thanks for playing!'],
  // The heroes' names are the same in French.
  i18n: {
    same: [
      ...(demo.i18n?.same?.filter((p) => p.startsWith('ui/')) ?? []),
      'char:hero/name',
      'char:hero/variants[0].name',
      'char:hero/variants[1].name',
      ...['pixel', 'biscuit', 'gull'].map((h) => `start/intro[1].choice.game.intro.c-${h}.text`),
    ],
  },
  ui: demo.ui,
});
