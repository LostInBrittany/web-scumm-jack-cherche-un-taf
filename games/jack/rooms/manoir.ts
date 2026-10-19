import { defineRoom } from 'web-scumm/content';

// Le bureau du Comte Radinoff (storyboard: manoir). Geometry in layout/manoir.json.
export default defineRoom({
  id: 'manoir',
  name: 'Le Manoir Frissonnant',
  decor: 'decor/manoir',
  music: 'manoir',
  description: 'The stingy vampire count\'s office in a haunted manor: purple striped wallpaper, cobwebs in the corners, a big window with the full moon, an old wooden desk with a single candle, a heavy iron safe on the right, the count\'s portrait above it, the front door on the left',
  props: {
    casier: { name: 'casier', states: { ferme: 'props/casier_ferme', ouvert: 'props/casier_ouvert' }, initial: 'ferme' },
  },
  actors: {
    radinoff: { char: 'radinoff', facing: 'right' },
  },
  hotspots: {
    bureau: { name: 'bureau' },
    bougie: { name: 'bougie' },
    coffre: { name: 'coffre-fort' },
    portrait_comte: { name: 'portrait' },
    fenetre: { name: 'fenêtre' },
  },
  exits: {
    porte: { name: 'porte', to: 'place', entry: 'manoir', if: { all: ['casier_ouvert', 'lanterne_ok'] },
      locked: 'Je ne pars pas sans mes affaires.' },
  },
  look: {
    radinoff: ['Le Comte Radinoff. Mon patron. Mon ex-patron.', 'Il compte ses dents. Pour vérifier qu\'il n\'en a pas perdu une.'],
    casier: ['Mon casier. Douze ans de bons et loyaux frissons.', 'Il est coincé. Comme toujours. Il faut un bon coup.'],
    bureau: 'Le bureau du Comte. Il y a une calculatrice. Elle ne sait faire que des soustractions.',
    bougie: ['Une seule bougie. Les bougies coûtent cher.', 'Elle est allumée depuis 1847. Économie.'],
    coffre: [
      'Le coffre du Comte. Il dort dedans, paraît-il. Avec ses pièces.',
      'Un gros coffre. Bien fermé.',
      'Toujours le coffre. Il fait « tic-tac ». Non, c\'est le Comte qui compte.',
      'Je crois qu\'il vient de me compter les côtes à travers la porte.',
    ],
    portrait_comte: 'Le Comte, peint en 1650. Il n\'a pas changé. Même pas de chemise.',
    fenetre: 'La pleine lune. Trois jours avant Halloween. Et moi, sans travail.',
    porte: 'La sortie. La place du village est juste derrière.',
  },
  on: [
    { id: 'manoir.look-casier-ouvert', verb: 'look', a: 'casier', if: { prop: ['casier', 'ouvert'] }, do: ['Vide. Il reste une odeur de citrouille. C\'est moi.'] },
    { id: 'manoir.ouvrir-casier', verb: ['use', 'open', 'push'], a: 'casier', if: { prop: ['casier', 'ferme'] }, do: [
      { anim: ['hero', 'use'], ms: 500 },
      { sfx: 'locker_open' }, { prop: ['casier', 'ouvert'] }, { shake: 300 }, { set: 'casier_ouvert' },
      { gain: 'lanterne' }, { gain: 'badge' }, { gain: 'chaussette' },
      'Ma lanterne, mon badge d\'employé du mois…',
      '…et une chaussette. Je n\'ai pas de pieds en tissu. Mystère.',
      { say: ['radinoff', 'Et n\'oubliez pas : la lanterne appartient au manoir !'] },
    ] },
    { id: 'manoir.tirer-casier', verb: 'pull', a: 'casier', if: { prop: ['casier', 'ferme'] }, do: ['Coincé. Il faudrait plutôt un bon coup de pied osseux.'] },
    { id: 'manoir.casier-vide', verb: ['use', 'open', 'push', 'pull'], a: 'casier', do: ['Il est vide. J\'ai tout pris. Douze ans dans trois poches.'] },
    { id: 'manoir.prendre-bougie', verb: ['take', 'use'], a: 'bougie', do: [{ say: ['radinoff', 'TOUCHEZ PAS À LA BOUGIE. Elle a coûté douze centimes.'], shout: true }] },
    { id: 'manoir.ouvrir-coffre', verb: ['open', 'use'], a: 'coffre', do: [{ say: ['radinoff', 'Pas touche ! Il y a toutes mes économies. Et mon lit.'] }] },
    { id: 'manoir.porte-sans-lanterne', verb: ['use', 'open', 'push', 'pull'], a: 'porte', if: { all: ['casier_ouvert', '!lanterne_ok'] }, do: [
      { say: ['radinoff', 'Une minute, Jack ! Et la lanterne ? Elle appartient au manoir !'] },
      'Il faut que je lui parle de cette lanterne.',
    ] },
    { id: 'manoir.sortie', verb: ['use', 'open', 'push', 'pull'], a: 'porte', if: { all: ['casier_ouvert', 'lanterne_ok', '!manoir_quitte'] }, do: [
      { sfx: 'creak' }, { set: 'manoir_quitte' }, { unlock: 'place' },
      'Adieu, manoir. Adieu, toiles d\'araignée. Je ne vous oublierai jamais.',
      { say: ['radinoff', 'Fermez la porte ! On chauffe pas la rue !'] },
      { goto: 'place', at: 'manoir' },
    ] },
    { id: 'manoir.donner-lanterne', verb: 'give', a: 'lanterne', b: 'radinoff', do: [
      'Tenez, votre lanterne.',
      { say: ['radinoff', 'Hmm. Finalement, gardez-la. Elle consomme trop de bougie.'] }, { set: 'lanterne_ok' },
    ] },
    { id: 'manoir.donner-badge', verb: 'give', a: 'badge', b: 'radinoff', do: [{ say: ['radinoff', 'Gardez-le. Il est en plastique, il ne vaut rien.'] }] },
    { id: 'manoir.donner-chaussette', verb: 'give', a: 'chaussette', b: 'radinoff', do: [{ say: ['radinoff', 'Ce n\'est pas à moi. Je dors en chaussettes noires. Dans un coffre.'] }] },
  ],
  talk: {
    radinoff: [
      { id: 'manoir.radinoff.pourquoi', topic: 'Pourquoi moi ?', do: [
        { say: ['radinoff', 'Un bon fantôme fait peur, Jack. Pas TROP peur.'] },
        { say: ['radinoff', 'Les clients qui s\'évanouissent n\'achètent pas de souvenirs.'] },
      ] },
      { id: 'manoir.radinoff.indemnite', topic: 'Et mon indemnité ?', do: [
        { say: ['radinoff', 'Votre quoi ? Je ne connais pas ce mot. Il n\'existe pas en transylvanien.'] },
      ] },
      { id: 'manoir.radinoff.lanterne', topic: 'La lanterne, c\'est la mienne.', if: { all: ['casier_ouvert', '!lanterne_ok'] }, do: [
        { say: ['radinoff', 'Avec VOS sous ? Que je vous ai versés ? Donc ce sont MES sous.'] },
        'C\'est moi qui l\'ai achetée. Avec mes sous.',
        { say: ['radinoff', 'Bon. Gardez-la. Mais je retiens la bougie sur votre dernier salaire.'] },
        { set: 'lanterne_ok' },
      ] },
      { id: 'manoir.radinoff.conseil', topic: 'Un conseil pour trouver du travail ?', do: [
        { say: ['radinoff', 'Allez à Pôle Frousse, sur la place. Ils trouvent du travail à tout le monde.'] },
        { say: ['radinoff', 'Même aux loups-garous végétariens.'] },
      ] },
    ],
  },
  hints: [
    { until: 'casier_ouvert', lines: ['Tes affaires sont dans ton casier, Jack.', 'Il est coincé. UTILISE-le, un bon coup de pied osseux.'] },
    { until: 'lanterne_ok', lines: ['Le Comte veut la lanterne. Parle-lui-en.', 'PARLER au Comte : « La lanterne, c\'est la mienne. »'] },
    { until: 'manoir_quitte', lines: ['La porte, à gauche. Pôle Frousse t\'attend sur la place.'] },
  ],
});

export const checkpoints = {
  manoir: { room: 'manoir', inventory: ['mireille'], unlocked: ['manoir'] },
};
