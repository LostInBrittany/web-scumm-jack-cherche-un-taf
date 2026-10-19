import { defineGame } from 'web-scumm/content';
import { characters } from './cast';
import { items } from './items';
import { rules } from './rules';
import manoir, { checkpoints as manoirCp } from './rooms/manoir';
import place, { checkpoints as placeCp } from './rooms/place';
import foire, { checkpoints as foireCp } from './rooms/foire';
import train, { checkpoints as trainCp } from './rooms/train';

export const game = defineGame({
  schemaVersion: 3,
  id: 'jack',
  title: 'Jack cherche un taf',
  lang: 'fr',
  saveVersion: 1,
  hero: 'hero',
  // Parler à Mireille (l'araignée qui vit dans la tête de Jack) donne les indices de la salle.
  hintItem: 'mireille',
  hintVoice: 'mireille',
  // Un seul toucher sur une sortie : Jack y va et passe dans le lieu suivant, comme dans les LucasArts.
  input: { exitOnTap: true },
  verbs: [
    { id: 'give', label: 'Donner', color: '#ff8fa3', join: 'à' },
    { id: 'open', label: 'Ouvrir', color: '#8fd3ff' },
    { id: 'close', label: 'Fermer', color: '#8fd3ff' },
    { id: 'take', label: 'Prendre', color: '#ffe08f' },
    { id: 'look', label: 'Regarder', color: '#b8ff8f' },
    { id: 'talk', label: 'Parler', color: '#c9a3ff' },
    { id: 'use', label: 'Utiliser', color: '#ffb36b', join: 'avec' },
    { id: 'push', label: 'Pousser', color: '#9ff' },
    { id: 'pull', label: 'Tirer', color: '#9ff' },
  ],
  characters,
  items,
  rooms: [manoir, place, foire, train],
  // La carte du village (bouton en bas à gauche) : un toucher pour aller d'un lieu à l'autre.
  map: {
    start: 'village',
    regions: { village: { name: 'Le village', image: 'decor/carte' } },
    places: {
      manoir: { name: 'Le Manoir Frissonnant', room: 'manoir', region: 'village', pos: [20, 30], portrait: 'radinoff/r1c2' },
      place: { name: 'La place du village', room: 'place', region: 'village', pos: [50, 60], portrait: 'bandelette/r1c2',
        news: { any: [{ has: 'barbe' }, { has: 'nez' }, { all: [{ has: 'photo' }, { has: 'lettre' }] }, { all: ['greve_connue', '!draps_ok', { not: { has: 'bandelettes' } }] }, { all: ['greve_connue', '!chaine_prise'] }] } },
      foire: { name: 'La fête foraine', room: 'foire', region: 'village', pos: [82, 48], portrait: 'guimauve/r1c2',
        news: { any: ['!barbe_gagnee', '!pepite_calme', { has: 'fiche_poste' }, { has: 'bandelettes' }, { has: 'chaine' }, { has: 'photo_ratee' }] } },
    },
    vehicles: { pin: 'starter/ui/pin', news: 'starter/ui/news' },
  },
  rules,
  lint: { ignore: ['flag-never-read:chaussette_rendue'] },
  globalTalk: { hug: 'Un câlin ?', bye: 'Au revoir.', byeLine: 'À plus tard !' },
  start: {
    room: 'manoir',
    inventory: ['mireille'],
    unlocked: ['manoir'],
    intro: [
      { cutscene: [
        { face: 'radinoff' },
        { id: 'game.intro.l1', say: ['radinoff', 'Jack, mon petit. Asseyez-vous. Ah non, pas sur la chaise, elle est neuve.'] },
        { id: 'game.intro.l2', say: ['radinoff', 'Hier, vous avez fait peur à un car entier de touristes.'] },
        { id: 'game.intro.l3', say: ['hero', 'Merci patron ! C\'est mon métier.'] },
        { id: 'game.intro.l4', say: ['radinoff', 'Ils sont partis en courant. SANS PAYER. Vous êtes viré.'], shout: true },
        { sfx: 'thunder' },
        { id: 'game.intro.l5', say: ['hero', 'Viré ? À trois jours d\'Halloween ?'] },
        { id: 'game.intro.l6', say: ['radinoff', 'Videz votre casier. Et rendez la lanterne, elle appartient au manoir.'] },
      ] },
      { id: 'game.intro.guide-look', guide: { verb: 'look', target: 'casier', say: 'D\'abord, REGARDER mon casier.' } },
    ],
  },
  checkpoints: { ...manoirCp, ...placeCp, ...foireCp, ...trainCp },
  // Mega Drive renders built by `npm run audio` (docs/en/AUDIO.md, audio/projects/*/compose.py writes each score):
  // the manor is Bach's Toccata in D minor and the ghost train Grieg's Mountain King (public domain, written out for
  // the game), the square, the fair and the ending jingle are original. The effects come from audio/sfx.json.
  audio: {
    music: { manoir: 'manoir.mp3', place: 'place.mp3', foire: 'foire.mp3', train: 'train.mp3', fin: 'fin.mp3' },
    sfx: { click: 'click.mp3', select: 'select.mp3', success: 'success.mp3', error: 'error.mp3', door_open: 'door_open.mp3', door_close: 'door_close.mp3', latch: 'latch.mp3', coins: 'coins.mp3', cloth: 'cloth.mp3', paper: 'paper.mp3', ring: 'ring.mp3', drop: 'drop.mp3', bell: 'bell.mp3', glass: 'glass.mp3', metal: 'metal.mp3', shuffle: 'shuffle.mp3', chips: 'chips.mp3', pluck: 'pluck.mp3', bong: 'bong.mp3', burp: 'burp.mp3', light_on: 'light_on.mp3', locker_open: 'locker_open.mp3', flash: 'flash.mp3', zap: 'zap.mp3', bouh: 'bouh.mp3', creak: 'creak.mp3', thunder: 'thunder.mp3', chains: 'chains.mp3' },
  },
  skin: {
    icons: { map: 'starter/ui/map', pause: 'starter/ui/pause', music: 'starter/ui/music', spark: 'starter/ui/spark', pin: 'starter/ui/pin', news: 'starter/ui/news', plane: 'starter/ui/plane', car: 'starter/ui/car', confetti: ['starter/ui/confetti1', 'starter/ui/confetti2'] },
    sounds: { end: 'fin', confetti: 'success' },
    pixelArt: true,
  },
  titleScreen: { decor: 'decor/place', music: 'manoir', footer: 'Jack cherche un taf' },
  credits: ['Jack cherche un taf', '', 'Une histoire d\'Anna et Horacio', '',
    'Musique façon Mega Drive : Bach (Toccata en ré mineur) et Grieg (Dans l\'antre du roi de la montagne), arrangés pour le jeu, et trois airs originaux', '',
    'Bruitages : en partie de Wano, projet web-scumm (CC BY 4.0)', '', 'Fait avec web-scumm'],
  ui: {
    walkTo: 'Aller à', newGame: 'Nouvelle partie', continue: 'Continuer', confirmErase: 'Effacer la partie sauvegardée ?', yes: 'Oui', no: 'Non',
    pause: 'Pause', resume: 'Reprendre', music: 'Musique', sfx: 'Sons', autosave: 'Sauvegarde auto', credits: 'Crédits', restart: 'Recommencer',
    skip: 'Passer', rotate: 'Tourne ton téléphone', rotateSub: 'Ce jeu se joue à l\'horizontale.', mapTitle: 'Où aller ?', mapBack: 'Retour',
    world: 'Monde', zoomIn: 'Zoom', arrival: 'Arrivée :', pickUp: 'Décrocher', calling: 'appel…', loading: 'Chargement…', on: 'oui', off: 'non',
    giveWhat: 'Choisis d\'abord un objet dans le sac.', replay: 'Rejouer', miniGame: 'Mini-jeu', tapToContinue: '▼ touche pour continuer', ok: 'OK',
  },
});
