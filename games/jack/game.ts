import { defineGame } from 'web-scumm/content';
import { characters } from './cast';
import { items } from './items';
import { rules } from './rules';
import manoir, { checkpoints as manoirCp } from './rooms/manoir';
import place, { checkpoints as placeCp } from './rooms/place';
import foire, { checkpoints as foireCp } from './rooms/foire';

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
  rooms: [manoir, place, foire],
  // La carte du village (bouton en bas à gauche) : un toucher pour aller d'un lieu à l'autre.
  map: {
    start: 'village',
    regions: { village: { name: 'Le village', image: 'decor/carte' } },
    places: {
      manoir: { name: 'Le Manoir Frissonnant', room: 'manoir', region: 'village', pos: [20, 30], portrait: 'radinoff/r1c2' },
      place: { name: 'La place du village', room: 'place', region: 'village', pos: [50, 60], portrait: 'bandelette/r1c2',
        news: { any: [{ has: 'barbe' }, { has: 'nez' }, { all: [{ has: 'photo' }, { has: 'lettre' }] }] } },
      foire: { name: 'La fête foraine', room: 'foire', region: 'village', pos: [82, 48], portrait: 'guimauve/r1c2',
        news: { any: ['!barbe_gagnee', '!pepite_calme'] } },
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
        { id: 'game.intro.l1', say: ['radinoff', 'Jack, mon petit. Asseyez-vous. Ah non, pas sur la chaise, elle est neuve.'] },
        { id: 'game.intro.l2', say: ['radinoff', 'Hier, vous avez fait peur à un car entier de touristes.'] },
        { id: 'game.intro.l3', say: ['hero', 'Merci patron ! C\'est mon métier.'] },
        { id: 'game.intro.l4', say: ['radinoff', 'Ils sont partis en courant. SANS PAYER. Vous êtes viré.'], shout: true },
        { id: 'game.intro.l5', say: ['hero', 'Viré ? À trois jours d\'Halloween ?'] },
        { id: 'game.intro.l6', say: ['radinoff', 'Videz votre casier. Et rendez la lanterne, elle appartient au manoir.'] },
      ] },
      { id: 'game.intro.guide-look', guide: { verb: 'look', target: 'casier', say: 'D\'abord, REGARDER mon casier.' } },
    ],
  },
  checkpoints: { ...manoirCp, ...placeCp, ...foireCp },
  audio: { music: {}, sfx: {} },
  skin: {
    icons: { map: 'starter/ui/map', pause: 'starter/ui/pause', music: 'starter/ui/music', spark: 'starter/ui/spark', pin: 'starter/ui/pin', news: 'starter/ui/news', plane: 'starter/ui/plane', car: 'starter/ui/car', confetti: ['starter/ui/confetti1', 'starter/ui/confetti2'] },
    sounds: {},
    pixelArt: true,
  },
  titleScreen: { decor: 'decor/place', footer: 'Jack cherche un taf' },
  credits: ['Jack cherche un taf', '', 'Une histoire d\'Anna et Horacio', '', 'Fait avec web-scumm'],
  ui: {
    walkTo: 'Aller à', newGame: 'Nouvelle partie', continue: 'Continuer', confirmErase: 'Effacer la partie sauvegardée ?', yes: 'Oui', no: 'Non',
    pause: 'Pause', resume: 'Reprendre', music: 'Musique', sfx: 'Sons', autosave: 'Sauvegarde auto', credits: 'Crédits', restart: 'Recommencer',
    skip: 'Passer', rotate: 'Tourne ton téléphone', rotateSub: 'Ce jeu se joue à l\'horizontale.', mapTitle: 'Où aller ?', mapBack: 'Retour',
    world: 'Monde', zoomIn: 'Zoom', arrival: 'Arrivée :', pickUp: 'Décrocher', calling: 'appel…', loading: 'Chargement…', on: 'oui', off: 'non',
    giveWhat: 'Choisis d\'abord un objet dans le sac.', replay: 'Rejouer', miniGame: 'Mini-jeu', tapToContinue: '▼ touche pour continuer', ok: 'OK',
  },
});
