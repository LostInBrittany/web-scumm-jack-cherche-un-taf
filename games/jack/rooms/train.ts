import { defineRoom, type Cmd } from 'web-scumm/content';

// Dans le train fantôme (storyboard: train). Geometry in layout/train.json.

// Once both demands are met (the sheets and the light chains), the strike ends.
const FIN_GREVE: Cmd[] = [
  { if: { all: ['draps_ok', 'chaines_ok', '!greve_finie'] }, then: [
    { say: ['ginette', 'Camarades, nos revendications sont satisfaites. On reprend le travail !'] },
    { set: 'greve_finie' }, { prop: ['fantomes', 'travail'] },
    { say: ['ginette', 'Merci, la citrouille. Tu es un bon collègue. Pour un employé à l\'essai.'] },
    { say: ['bouh', 'Bouh !'] },
    { toast: 'La grève est finie !' },
  ] },
];

export default defineRoom({
  id: 'train',
  name: 'Le train fantôme',
  decor: 'decor/train',
  description: 'Inside a funfair ghost train: a dark arched tunnel with rails on the floor, cardboard coffins on both sides, cobwebs in the corners, a dusty chandelier hanging from the ceiling, an old electric panel on the wall, and the tunnel exit on the right, lit by a faint glow. Spooky but cosy, more funny than frightening',
  props: {
    fantomes: { name: 'fantômes', states: { greve: 'props/fantomes_greve', travail: 'props/fantomes_travail' }, initial: 'greve' },
    tableau: { name: 'tableau électrique', states: { eteint: 'props/tableau_eteint', allume: 'props/tableau_allume' }, initial: 'eteint' },
  },
  actors: {
    ginette: { char: 'ginette', facing: 'left' },
    bouh: { char: 'bouh', facing: 'left' },
    brigadier: { char: 'brigadier', facing: 'left', visible: { all: ['repetition', '!repetition_reussie'] }, interactive: false },
    maire: { char: 'maire', facing: 'left', visible: { all: ['repetition', '!repetition_reussie'] }, interactive: false },
    gloubi: { char: 'gloubi', visible: { all: ['repetition', '!repetition_reussie'] }, interactive: false },
  },
  hotspots: {
    cercueils: { name: 'cercueils' },
    lustre: { name: 'lustre' },
    rails: { name: 'rails' },
  },
  exits: {
    sortie: { name: 'sortie', to: 'foire', entry: 'train' },
  },
  look: {
    ginette: ['Ginette, la déléguée syndicale des fantômes. Elle a le poing levé. Sous le drap.', 'Elle me regarde comme un patron. Je ne suis même pas embauché.'],
    bouh: ['Bouh, le petit stagiaire. Il ne dit que « bouh ».', 'Il essaie de faire peur à une araignée. L\'araignée gagne.'],
    fantomes: ['Gaston et la banderole « GRÈVE ». Il fait cliqueter ses chaînes en rythme.', 'Ses chaînes ont l\'air très lourdes.'],
    tableau: ['Le tableau électrique. On dirait un plat de spaghettis.', 'Des fils partout. Rouge, bleu, vert, jaune. Et un qui fume.'],
    cercueils: ['Des cercueils en carton.', 'L\'un d\'eux porte une étiquette : « Ne pas ouvrir. Sauf si c\'est drôle. »', 'Encore des cercueils.', 'En carton. Le Comte Radinoff aurait trouvé ça trop cher.'],
    lustre: 'Un lustre plein de toiles d\'araignée. Mireille dit qu\'elle connaît la famille.',
    rails: 'Les rails du train. Ils filent tout droit dans la bouche de la citrouille.',
    sortie: 'La sortie, vers la fête foraine.',
    brigadier: 'Le Brigadier, dans le wagon. Sa lanterne tremble déjà.',
    maire: 'Le Maire, dans le wagon. Il a mis sa plus belle écharpe.',
    gloubi: 'Gloubi, dans le wagon. Il prend trois places.',
  },
  on: [
    { id: 'train.look-fantomes-travail', verb: 'look', a: 'fantomes', if: 'greve_finie', do: ['Gaston, enroulé dans des bandelettes neuves. Sa chaîne de vélo fait un joli cliquetis.'] },
    { id: 'train.look-tableau-ok', verb: 'look', a: 'tableau', if: 'courant_ok', do: ['Le tableau électrique. Tout est branché. Je suis électricien, maintenant.'] },
    { id: 'train.draps', verb: 'give', a: 'bandelettes', b: 'ginette', do: [
      { lose: 'bandelettes' }, { set: 'draps_ok' },
      { say: ['ginette', 'Du lin d\'Égypte ! Trois kilomètres ! On va pouvoir se faire des draps… et des rideaux.'] },
      'Les fantômes s\'enroulent dedans. Ils ressemblent à des momies. Ils adorent.',
      ...FIN_GREVE,
    ] },
    { id: 'train.chaines', verb: 'give', a: 'chaine', b: 'ginette', do: [
      { lose: 'chaine' }, { set: 'chaines_ok' },
      { say: ['ginette', 'Une chaîne de vélo ! Si légère ! Écoutez-moi ce petit cliquetis…'] },
      'Gaston la fait tinter. Bouh se met à pédaler dans le vide.',
      ...FIN_GREVE,
    ] },
    { id: 'train.chaussette-ginette', verb: 'give', a: 'chaussette', b: 'ginette', do: [{ say: ['ginette', 'Une chaussette ? On n\'a pas de pieds. Mais merci pour l\'intention.'] }] },
    { id: 'train.tableau-ok', verb: ['use', 'open', 'push', 'pull'], a: 'tableau', if: 'courant_ok', do: ['Tout marche. Je ne touche plus à rien.'] },
    { id: 'train.tableau', verb: ['use', 'open', 'push', 'pull'], a: 'tableau', do: [
      'Le tableau électrique. On dirait un plat de spaghettis.',
      { minigame: 'cables', params: {
        board: 'minigame/cables_board', knot: 'minigame/cables_noeud',
        plugs: { rouge: 'minigame/prise_rouge', bleu: 'minigame/prise_bleu', vert: 'minigame/prise_vert', jaune: 'minigame/prise_jaune' },
        sockets: ['jaune', 'rouge', 'bleu', 'vert'],
        tints: { rouge: '#dc3232', bleu: '#325adc', vert: '#3cb446', jaune: '#f0c828' },
        gags: ['lamp', 'windows'],
        lampOff: 'minigame/squelette_calme', lampOn: 'minigame/squelette_danse',
        windowsText: 'Le train fantôme a rencontré un problème et doit hanter de nouveau. Bouh.',
        intro: 'Suis chaque fil dans le nœud, Jack, et branche-le sur la prise de sa couleur.',
        win: 'La lumière revient !',
      }, then: [
        { prop: ['tableau', 'allume'] }, { set: 'courant_ok' },
        'Les lampes s\'allument, l\'orgue démarre, les yeux des tableaux s\'allument.',
        'Ça marche ! Je suis électricien, maintenant. Ça fait deux métiers en une soirée.',
      ] },
    ] },
    { id: 'train.prendre-cercueil', verb: ['take', 'open'], a: 'cercueils', do: ['Vide. Le locataire est parti en vacances. Il a laissé un mot : « Bouh. »'] },
    { id: 'train.prendre-lustre', verb: ['take', 'pull'], a: 'lustre', do: ['Si je tire dessus, il me tombe sur la citrouille. Non merci.'] },
  ],
  talk: {
    ginette: [
      { id: 'train.ginette.greve', topic: 'Bonjour ! C\'est quoi, cette banderole ?', if: '!greve_connue', do: [
        { say: ['ginette', 'Des draps propres, pas des draps sales ! Des chaînes légères, pas des chaînes de galère !'] },
        'Bonjour. Je suis le nouveau. À l\'essai.',
        { say: ['ginette', 'Un jaune ! Euh, un orange. Un briseur de grève à tête de citrouille !'] },
        'Non, non. Je suis de votre côté. Qu\'est-ce qu\'il vous faut ?',
        { say: ['ginette', 'Des draps neufs, les nôtres ont des trous. Et des chaînes légères : on a des bleus aux chevilles.'] },
        { say: ['ginette', 'Tant qu\'on n\'a pas les deux, on ne hante personne. Solidarité !'] },
        { set: 'greve_connue' },
      ] },
      { id: 'train.ginette.ou', topic: 'Où en sont vos revendications ?', if: { all: ['greve_connue', '!greve_finie'] }, do: [
        { if: 'draps_ok', then: [{ say: ['ginette', 'Les draps : obtenus !'] }], else: [{ say: ['ginette', 'Des draps neufs : toujours rien !'] }] },
        { if: 'chaines_ok', then: [{ say: ['ginette', 'Les chaînes : obtenues !'] }], else: [{ say: ['ginette', 'Des chaînes légères : toujours rien !'] }] },
      ] },
      { id: 'train.ginette.pourquoi', topic: 'Pourquoi vous faites grève ?', do: [
        { say: ['ginette', 'Trois cents ans à hanter dans des draps troués, avec des chaînes de bagnard. Ça suffit !'] },
      ] },
      { id: 'train.ginette.qui', topic: 'Qui sont les deux autres ?', do: [
        { say: ['ginette', 'Gaston, il fait les bruits de chaînes. Et le petit Bouh, c\'est un stagiaire. Il ne dit que « bouh ».'] },
      ] },
    ],
    bouh: [
      { id: 'train.bouh.bonjour', topic: 'Bonjour, petit fantôme.', do: [{ say: ['bouh', 'Bouh.'] }, 'Bouh à toi aussi.'] },
      { id: 'train.bouh.conseil', topic: 'Un conseil pour faire peur ?', do: [{ say: ['bouh', 'Bouh…'] }, { say: ['bouh', '…BOUH !'] }, 'Je vois. Tout est dans la nuance.'] },
    ],
  },
  hints: [
    { until: 'greve_connue', lines: ['Ginette mène la grève. Parle-lui.'] },
    { until: { any: ['draps_ok', { has: 'bandelettes' }] }, lines: ['Des draps neufs : Mme Bandelette, sur la place, a sûrement des bandelettes en trop.'] },
    { until: 'draps_ok', lines: ['DONNE les bandelettes à Ginette.'] },
    { until: { any: ['chaines_ok', { has: 'chaine' }] }, lines: ['Des chaînes légères : le vélo que Gloubi a recraché sur la place a une chaîne.'] },
    { until: 'chaines_ok', lines: ['DONNE la chaîne de vélo à Ginette.'] },
    { until: 'courant_ok', lines: ['Le tableau électrique, au fond. UTILISE-le.'] },
    { until: 'affiche_posee', lines: ['Il manque l\'affiche, dehors, sur le panneau devant le train.'] },
    { until: 'repetition', lines: ['Tout est prêt ! Va le dire à Wolfgang.'] },
  ],
  onEnter: [
    { id: 'train.arrivee', once: ['Il fait noir comme dans une citrouille. Heureusement, ma tête éclaire.'] },
    { if: { all: ['repetition', '!repetition_reussie'] }, then: [
      { cutscene: [
        'Le wagon entre. Le Brigadier, le Maire et Gloubi. Vite, une cachette !',
        { say: ['mireille', 'Cache-toi bien, Jack. Et surgis au bon endroit. Pas trop fort !'] },
      ] },
      { minigame: 'hide', params: {
        bg: 'minigame/cache_fond',
        spots: [
          { img: 'minigame/cache_cercueil', found: 'minigame/cache_cercueil_jack', x: 90, y: 330, h: 150 },
          { img: 'minigame/cache_lustre', x: 532, y: 128, h: 70, reply: 'Jack se suspend au lustre… qui se décroche. Bouh dit « bouh ». Personne n\'a peur.' },
          { img: 'minigame/cache_armoire', x: 560, y: 330, h: 160, reply: 'L\'armoire est déjà occupée : Gaston y range ses chaînes.' },
          { img: 'minigame/cache_tonneau', x: 178, y: 345, h: 80, reply: 'Jack sort du tonneau trop tôt. Gloubi croit que c\'est l\'apéritif.' },
        ],
        answer: 0,
        intro: 'Où te cacher pour surgir au bon moment ?',
        win: 'BOUH ! Juste ce qu\'il faut.',
      }, then: [
        { say: ['brigadier', 'AAAH ! Enfin, je vois des choses qui font peur ! C\'est merveilleux !'] },
        { say: ['maire', 'Mes boulons ont tremblé ! Je vote pour ! Je revote !'] },
        { say: ['gloubi', 'Gloubi a eu peur ! Gloubi n\'a même pas avalé le wagon ! Encore !'] },
        'Ils sortent en riant… et ils paient. Tous les trois. Deux fois.',
        { set: 'repetition_reussie' },
        { goto: 'foire', at: 'train' },
      ] },
    ] },
  ],
});

export const checkpoints = {
  train: { room: 'train', unlocked: ['manoir', 'place', 'foire'], inventory: ['mireille', 'badge', 'chaussette'],
    flags: { casier_ouvert: true, lanterne_ok: true, manoir_quitte: true, dossier_connu: true, boulon_connu: true, barbe_connue: true, route_ouverte: true,
      barbe_gagnee: true, carrousel_connu: true, pepite_calme: true, gloubi_rot: true, lettre_ok: true, photo_ok: true, photo_ratee_faite: true, dossier_fini: true, essai: true },
    props: { 'foire.pepite': 'calm' } },
  repetition: { room: 'foire', unlocked: ['manoir', 'place', 'foire'], inventory: ['mireille', 'badge', 'chaussette'],
    flags: { casier_ouvert: true, lanterne_ok: true, manoir_quitte: true, dossier_connu: true, boulon_connu: true, barbe_connue: true, route_ouverte: true,
      barbe_gagnee: true, carrousel_connu: true, pepite_calme: true, gloubi_rot: true, lettre_ok: true, photo_ok: true, photo_ratee_faite: true, dossier_fini: true, essai: true,
      greve_connue: true, draps_ok: true, chaines_ok: true, chaine_prise: true, greve_finie: true, courant_ok: true, affiche_posee: true },
    props: { 'foire.pepite': 'calm', 'foire.panneau': 'affiche', 'train.fantomes': 'travail', 'train.tableau': 'allume' } },
};
