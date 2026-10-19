import { defineGame } from '@engine/core/define';
import { characters } from './cast';
import { items } from './items';
import { rules } from './rules';
import idsMigration from './ids.migration.json';
import house from './rooms/house';
import garden from './rooms/garden';
import market from './rooms/market';

// "The Pantry Key": the sample game. Pixel the cat wants the sardines; Grandma lost the pantry key.
// Design: STORY.md. Every line: storyboard.json.
const ALL = ['house', 'garden', 'market'];

export const game = defineGame({
  id: 'demo',
  title: 'The Pantry Key',
  lang: 'en',
  schemaVersion: 3,
  saveVersion: 2,
  // v1 saves (positional keys) follow the stable ids: `npm run ids -- --map` wrote this step.
  migrations: [idsMigration],
  hero: 'hero',
  // Two playable cats: Pixel first; Biscuit (asleep at home) can be switched to at any time. He has his own inventory.
  players: { ids: ['hero', 'biscuit'], start: { biscuit: { room: 'house' } }, give: 'Here, {nom}. The {objet}. Do not eat it.' },
  // Talking to the shell phone gives the room's hints, in Grandma's voice (an offscreen character).
  hintItem: 'shell_phone',
  hintVoice: 'grandma_voice',
  verbs: [
    { id: 'give', label: 'Give', color: '#ff8fa3', join: 'to' },
    { id: 'open', label: 'Open', color: '#8fd3ff' },
    { id: 'close', label: 'Close', color: '#8fd3ff' },
    { id: 'take', label: 'Pick up', color: '#ffe08f' },
    { id: 'look', label: 'Look at', color: '#b8ff8f' },
    { id: 'talk', label: 'Talk to', color: '#c9a3ff' },
    { id: 'use', label: 'Use', color: '#ffb36b', join: 'with' },
    { id: 'push', label: 'Push', color: '#9ff' },
    { id: 'pull', label: 'Pull', color: '#9ff' },
  ],
  characters,
  items,
  rooms: [house, garden, market],
  map: {
    start: 'world',
    regions: { world: { name: 'World', image: 'decor/map' } },
    places: {
      house: { name: 'Grandma\'s house', room: 'house', region: 'world', pos: [13, 70], portrait: 'grandma/r1c2', news: { all: [{ has: 'key' }, '!pantry_open'] } },
      garden: { name: 'The garden', room: 'garden', region: 'world', pos: [21, 79], portrait: 'grandpa/r1c2', vehicle: 'car', news: '!tank_drained' },
      market: { name: 'The market', room: 'market', region: 'world', pos: [47, 41], portrait: 'seller/r1c2', vehicle: 'plane', news: { not: { has: 'key' } } },
    },
    vehicles: { car: 'ui/r2c2', plane: 'ui/r2c1', pin: 'ui/r1c6', news: 'ui/r2c4' },
  },
  rules,
  // `tea_drunk` (Biscuit and the teacup) is a decorative flag on purpose: the puzzle graph's example of a dead flag
  // (tests/puzzle.test.ts), set but never read.
  lint: { ignore: ['flag-never-read:tea_drunk'] },
  // The world reacts on its own: when the key is found (market), Grandpa goes home for the finale.
  events: [
    { id: 'game.on-key-found', on: 'key_found', once: true, do: [{ moveActor: ['grandpa', 'house'] }, { id: 'game.on-key-found.l-grandpa-went', toast: 'Grandpa went home. With the armchair.' }] },
  ],
  globalTalk: { hug: 'Can I have a cuddle?', bye: 'Bye!', byeLine: 'Bye bye.' },
  start: {
    room: 'house',
    unlocked: ['house'],
    // Opening: the player's guess (judged on the sealed ending's card), then the guided tutorial.
    intro: [
      { id: 'game.intro.l-pixel-bad-news', say: ['grandma', 'Pixel! Bad news. The sardines are locked in the pantry...'] },
      { id: 'game.intro.l-and-i-lost-the', say: ['grandma', '...and I lost the key.'] },
      { say: ['hero', 'Wait. What is really in that pantry?'], id: 'game.intro.l-wait-what-is' },
      { choice: [
        { id: 'game.intro.c-sardines-obvious', text: 'Sardines. Obviously.', do: [{ set: ['guess', 'sardines'] }] },
        { id: 'game.intro.c-a-mouse-a-big', text: 'A mouse. A big one.', do: [{ set: ['guess', 'mouse'] }] },
        { id: 'game.intro.c-nothing-at-all', text: 'Nothing at all. It is a trap.', do: [{ set: ['guess', 'nothing'] }] },
      ] },
      { id: 'game.intro.l-we-will-see-when', say: ['grandma', 'We will see when it is open, fluffball.'] },
      { id: 'game.intro.l-first-look-at', guide: { verb: 'look', target: 'pantry', say: 'First, LOOK AT the pantry cupboard.' } },
      { id: 'game.intro.l-now-talk-to', guide: { verb: 'talk', target: 'grandma', say: 'Now TALK TO Grandma. Ask about the key.' } },
      { if: { not: { unlocked: 'garden' } }, then: [
        { id: 'game.intro.l-oh-and-the-key', say: ['grandma', 'Oh, and the key: Grandpa had it last. He is in the garden.'] }, { unlock: 'garden' },
      ] },
      { id: 'game.intro.l-take-my-shell', say: ['grandma', 'Take my shell phone. Talk into it if you get stuck.'] },
      { id: 'game.intro.l-pick-up-the', guide: { verb: 'take', target: 'shell', say: 'PICK UP the shell phone on the table.' } },
      { say: ['hero', 'Garden. Grandpa. Key. Sardines. Easy.'], id: 'game.intro.l-garden-grandpa' },
    ],
  },
  // One ready state per room (?dev&at=<id>, npm run solve -- --from=<id>). Each one also ends a chapter: its `goals` are
  // what the previous chapter must reach (npm run solve -- --chapters proves each chapter on its own).
  checkpoints: {
    house: { room: 'house', inventory: ['shell_phone'], unlocked: ['house', 'garden'], flags: { guess: 'sardines' }, goals: [{ has: 'shell_phone' }, { unlocked: 'garden' }] },
    garden: { room: 'garden', inventory: ['shell_phone', 'token'], unlocked: ['house', 'garden'], flags: { guess: 'sardines' }, props: { 'house.armchair': 'searched' }, goals: [{ has: 'token' }] },
    market: {
      room: 'market', inventory: ['shell_phone', 'token'], unlocked: ALL,
      flags: { guess: 'sardines', pipe_taken: true, tank_drained: true, lou_has_key: true },
      props: { 'house.armchair': 'searched', 'garden.tank': 'draining' },
      // Biscuit stayed in the garden with the pipe (used on the tank) and the shell phone: a reachable boundary state.
      players: { biscuit: { room: 'garden', inventory: ['pipe', 'shell_phone'], used: ['pipe'] } },
      goals: ['tank_drained', 'lou_has_key', { unlocked: 'market' }],
    },
    finale: {
      // Where the key is found (the chapter's goal holds there): a reachable boundary state.
      room: 'market', inventory: ['shell_phone', 'key'], unlocked: ALL,
      flags: { guess: 'sardines', pipe_taken: true, tank_drained: true, lou_has_key: true, deposit_known: true, flowers_done: true, bouquet_given: true },
      props: { 'house.armchair': 'searched', 'garden.tank': 'draining' },
      where: { grandpa: 'house' },
      players: { biscuit: { room: 'garden', inventory: ['pipe', 'shell_phone'], used: ['pipe'] } },
      // The key was found: the once-listener that sent Grandpa home has fired (a reachable boundary state names it).
      seen: { 'event.game.on-key-found': 1 },
      goals: [{ has: 'key' }],
    },
  },
  // Must never become true: Pixel's token gone before the flowers are done (the solver reports the path if it happens).
  // Scoped to Pixel: Biscuit's bag is his own (the CI caught this one when Biscuit became playable).
  invariants: [{ all: [{ player: 'hero' }, { prop: ['house.armchair', 'searched'] }, { not: { has: 'token' } }, '!flowers_done'] }],
  // The quest journal of the pause menu (4.1.12, ADR 0014): each is completed once, the first time its condition holds;
  // npm run solve -- --goal=100% reaches every one that is not optional. Flags set once read best (they stay true).
  objectives: {
    guess: { title: 'Guess what is in the pantry', done: 'guess', optional: true },
    key: { title: 'Find the pantry key', done: { any: [{ has: 'key' }, 'pantry_open'] } },
    tank: { title: 'Drain the water tank', done: 'tank_drained', parent: 'key' },
    lou: { title: 'Find out who borrowed the key', done: 'lou_has_key', parent: 'key' },
    pantry: { title: 'Open the pantry', done: 'pantry_open' },
  },
  // Three manual save slots in the pause menu (export / import as a file too), and a Settings entry.
  // Remix (4.1.15, docs/en/REMIX.md): where the seller leaves the pantry key, and how Pixel turns the oranges down.
  // Both modes are catalogues (D25): three logical worlds, each proved by `npm run verify:variants`.
  remix: {
    schema: 1,
    algorithm: 'web-scumm-remix-1',
    modes: [
      { id: 'story', strategy: 'catalogue', dimensions: [] },
      { id: 'remix', strategy: 'catalogue', dimensions: ['key-spot', 'oranges-line'] },
    ],
    dimensions: [
      {
        id: 'key-spot', kind: 'item-placement', item: 'key', logical: true,
        anchors: [{ room: 'market', anchor: 'stall' }, { room: 'market', anchor: 'oranges' }, { room: 'market', anchor: 'lantern' }],
        story: { room: 'market', anchor: 'stall' },
      },
      {
        id: 'oranges-line', kind: 'presentation', target: 'line:market.take-oranges.l-oranges-are-not', logical: false, story: 0,
        values: [
          { en: 'Oranges are not sardines. Nice try, oranges.', fr: 'Les oranges ne sont pas des sardines. Bien essayé, les oranges.' },
          { en: 'An orange. Round, bright, and tragically not a fish.', fr: 'Une orange. Ronde, vive, et tragiquement pas un poisson.' },
        ],
      },
    ],
    constraints: [{ kind: 'not-behind', item: 'key', action: 'house.use-key-pantry' }],
  },
  saves: { slots: 3 },
  // What a phone downloads (npm run weight, measured 4 Oct 2026: 2.0 MB before the first room, 2.4 MB for the market,
  // 3.7 MB for a chapter since the map opens every room), with about 20% of headroom. Since 3.6: the theme's stems
  // downloaded in the background (2.5 MB since 3.7's own theme), the full offline warm-up (6.9 MB), the theme decoded
  // (79 MB).
  assetBudgets: { initialKB: 2500, roomKB: 3000, chapterKB: 4500, backgroundScoreKB: 3500, offlineTotalKB: 9000, decodedAudioMB: 128, initialJsKB: 140 },
  // Texts that stay the same in French on purpose: names, ▲ ▼, OK, words French borrowed (`npm run i18n -- status`).
  i18n: { same: ['room:market/props.oranges.name', 'room:market/props.bouquet.name', 'item:bouquet/name', 'char:hero/name', 'char:biscuit/name', 'char:neighbor/name', 'ui/pause', 'ui/remix', 'ui/zoomIn', 'ui/ok', 'ui/jump', 'ui/duck', 'ui/normal', 'ui/speedrun'] },
  settings: true,
  // The music and the sound effects are Mega Drive renders built by `npm run audio` (docs/en/AUDIO.md): the theme is
  // the oboe theme of Tchaikovsky's Swan Lake (public domain) written out for the project (audio/projects/swan-theme),
  // the effects come from games/demo/audio/sfx.json.
  audio: {
    music: { theme: 'swan_theme.mp3' },
    // The theme in stems for the music director (3.5, `npm run audio -- stems`): the whole orchestra in the house and
    // the market, no melody in the garden, only the harp and the bass while Biscuit tiptoes about. The mix changes on
    // the next bar; the single mix plays where the director does not (Save-Data, a low-end device).
    scores: {
      theme: {
        stems: { melody: 'swan-theme-stems/melody.mp3', strings: 'swan-theme-stems/strings.mp3', harp: 'swan-theme-stems/harp.mp3', bass: 'swan-theme-stems/bass.mp3' },
        bpm: 80, beatsPerBar: 4,
        // 54 s × 48 kHz × 2 channels × 4 bytes × 4 stems, decoded (npm run audio -- stems).
        pcmBytes: 82944032,
        states: [
          { if: { player: 'biscuit' }, stems: ['harp', 'bass'] },
          { if: { room: 'garden' }, stems: ['strings', 'harp', 'bass'] },
        ],
      },
    },
    sfx: {
      door_open: 'door_open.mp3', door_close: 'door_close.mp3', latch: 'latch.mp3', coins: 'coins.mp3', cloth: 'cloth.mp3',
      paper: 'paper.mp3', click: 'click.mp3', success: 'success.mp3', error: 'error.mp3', ring: 'ring.mp3', drop: 'drop.mp3',
      bell: 'bell.mp3', glass: 'glass.mp3', metal: 'metal.mp3', shuffle: 'shuffle.mp3', chips: 'chips.mp3', pluck: 'pluck.mp3',
      select: 'select.mp3', bong: 'bong.mp3',
    },
  },
  skin: {
    icons: {
      map: 'ui/r1c5', pause: 'ui/r3c5', music: 'ui/r3c6', spark: 'ui/r3c4',
      pin: 'ui/r1c6', news: 'ui/r2c4', plane: 'ui/r2c1', car: 'ui/r2c2',
      confetti: ['ui/r4c1', 'ui/r4c2'], cardFallback: 'ui/r2c5',
    },
    sounds: { phone: 'ring', confetti: 'success' },
    heights: { actor: 115, hero: 36 },
  },
  // The sealed ending: ticket and card texts are encrypted in public/data/dossier.bin (npm run seal), never in the bundle.
  ending: {
    file: 'data/dossier.bin',
    password: { given: 'sardines-for-everyone' },
    guess: {
      flag: 'guess',
      labels: { sardines: 'sardines', mouse: 'a mouse', nothing: 'nothing at all' },
      right: 'You guessed {guess}. Right! Have a sardine.',
      wrong: 'You guessed {guess}. Nope! Nice try, detective.',
      none: 'You guessed {guess}. The pantry keeps its secret.',
    },
    scratch: { ticket: 'items/r4c1', sfx: 'shuffle' },
    card: { accent: '#e8a33d' },
  },
  titleScreen: { decor: 'decor/dining', music: 'theme', footer: 'A tiny point-and-click. Turn your phone sideways.' },
  credits: [
    'THE PANTRY KEY', '', 'A web-scumm sample game', '',
    'Pixel ........ the grey cat', 'Biscuit ...... the sleepy cat', 'Grandma ...... the key loser', 'Grandpa ...... the pipe expert',
    'Lou .......... the borrower', 'The seller ... the forgetful husband', '',
    'Sound effects: generated by web-scumm (CC BY 4.0)', 'Music: Swan Lake theme, after Tchaikovsky, arranged by Wano (CC BY 4.0)',
    'Art: CC BY 4.0, see CREDITS.md', '', 'Thanks for playing!',
  ],
  ui: {
    walkTo: 'Walk to', newGame: 'New game', continue: 'Continue', confirmErase: 'Erase the saved game?', yes: 'Yes', no: 'No',
    pause: 'Pause', resume: 'Resume', music: 'Music', sfx: 'Sounds', autosave: 'Autosave', credits: 'Credits', restart: 'Restart',
    skip: 'Skip', rotate: 'Rotate your phone', rotateSub: 'This game plays in landscape.', mapTitle: 'Where to?',
    mapLocked: 'Not yet!', mapBack: 'Back', world: 'World', zoomIn: 'Zoom', arrival: 'Arrival:', pickUp: 'Pick up', hangUp: 'Hang up',
    calling: 'calling…', loading: 'Loading…', on: 'on', off: 'off', giveWhat: 'Pick an item from the bag first.', replay: 'Play again',
    miniGame: 'Mini-game', tapToContinue: '▼ tap to continue', ok: 'OK', password: 'Password?',
    save: 'Save', load: 'Load', slot: 'Slot {n}', emptySlot: 'empty', exportSave: 'Export to a file', importSave: 'Import a file', confirmOverwrite: 'Overwrite this slot?', saveFailed: 'Save failed', advance: 'Continue', shareSession: 'Share session',
    saveAdjusted: 'Save adjusted for this version',
    updateAvailable: 'A new version is ready.', updateNow: 'Save and update',
    offlineStatus: 'Offline', offlineComplete: 'whole game cached', offlineRetry: 'tap to retry',
    verbs: 'Verbs', jump: '▲', duck: '▼', exportSession: 'Export session',
    remix: 'Remix', remixTitle: 'Which world?', remixStory: 'Story', remixRandom: 'A new world', remixSeed: 'Type a seed', remixDaily: 'Daily challenge', remixMystery: 'Mystery world',
    remixPlay: 'Play', remixInvalid: 'Not a seed code', remixWorld: 'World', remixHidden: 'hidden until the end', remixCopied: 'Copied', remixNoBridge: 'needs the Bridge',
    remixConflict: 'Your saved game lives in another world', remixKeepSaved: 'Continue the saved game', remixStartLinked: 'Start the link\'s world (replaces it)',
    settings: 'Settings', textSpeed: 'Text speed', textSize: 'Text size', reduceMotion: 'Reduce motion', readableFont: 'Readable font', captions: 'Sound captions',
    volumeMusic: 'Music volume', volumeSfx: 'Sound volume', volumeVoice: 'Voice volume', slow: 'slow', normal: 'normal', fast: 'fast', large: 'large',
    language: 'Language', fingerprint: 'Build', objectives: 'Objectives',
    speedrun: 'Speedrun', exportRun: 'Export run', abandonRun: 'Abandon run',
  },
});
