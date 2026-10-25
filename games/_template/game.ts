import { defineGame } from '@quest-n-click/engine/content';
import { characters } from './cast';
import { items } from './items';
import { rules } from './rules';
import start, { checkpoints as startCp } from './rooms/start';

export const game = defineGame({
  schemaVersion: 3,
  id: '__ID__',
  title: '__TITLE__',
  saveVersion: 1,
  hero: 'hero',
  // Talking to this inventory item gives the room's hints, spoken by `hintVoice` (an offscreen character) or the hero.
  hintItem: 'note',
  verbs: [
    { id: 'give', label: 'Give', color: '#ff8fa3', join: 'to' },
    { id: 'open', label: 'Open', color: '#8fd3ff' },
    { id: 'close', label: 'Close', color: '#8fd3ff' },
    { id: 'take', label: 'Take', color: '#ffe08f' },
    { id: 'look', label: 'Look', color: '#b8ff8f' },
    { id: 'talk', label: 'Talk', color: '#c9a3ff' },
    { id: 'use', label: 'Use', color: '#ffb36b', join: 'with' },
    { id: 'push', label: 'Push', color: '#9ff' },
    { id: 'pull', label: 'Pull', color: '#9ff' },
  ],
  characters,
  items,
  rooms: [start],
  rules,
  globalTalk: { hug: 'Hug?', bye: 'Bye.', byeLine: 'See you.' },
  start: { room: 'start', inventory: ['note'] },
  checkpoints: { ...startCp },
  audio: { music: {}, sfx: {} },
  // Interface icons and engine sounds come from the game (see wiki/en/create.skin-fonts.md#skin).
  skin: {
    icons: { map: 'starter/ui/map', pause: 'starter/ui/pause', music: 'starter/ui/music', spark: 'starter/ui/spark', pin: 'starter/ui/pin', news: 'starter/ui/news', plane: 'starter/ui/plane', car: 'starter/ui/car', confetti: ['starter/ui/confetti1', 'starter/ui/confetti2'] },
    sounds: {},
  },
  titleScreen: { decor: 'starter/decor/backyard', footer: '__TITLE__' },
  credits: ['__TITLE__', '', "Made with quest'n'click"],
  ui: {
    walkTo: 'Walk to', newGame: 'New game', continue: 'Continue', confirmErase: 'Erase the saved game?', yes: 'Yes', no: 'No',
    pause: 'Pause', resume: 'Resume', music: 'Music', sfx: 'Sounds', autosave: 'Autosave', credits: 'Credits', restart: 'Restart',
    skip: 'Skip', rotate: 'Rotate your phone', rotateSub: 'This game plays in landscape.', mapTitle: 'Where to?', mapBack: 'Back',
    world: 'World', zoomIn: 'Zoom', arrival: 'Arrival:', pickUp: 'Pick up', calling: 'calling…', loading: 'Loading…', on: 'on', off: 'off',
    giveWhat: 'Pick an item from the bag first.', replay: 'Play again', miniGame: 'Mini-game', tapToContinue: '▼ tap to continue', ok: 'OK',
  },
});
