import { defineRoom, type Cmd } from 'web-scumm/content';

// La place du village (storyboard: place). Wide room (960). Geometry in layout/place.json.

// Shared by "use photomaton" (with the nose in the bag) and "use nose with photomaton".
const PHOTO_REUSSIE: Cmd[] = [
  'Nez rouge en place. Sourire en place. Enfin, sourire de citrouille.',
  { lose: 'nez' }, { sfx: 'flash' }, { shake: 200 },
  'FLASH. La machine hésite… puis elle rigole. Une jolie photo sort.',
  { gain: 'photo' }, { set: 'photo_ok' },
  'J\'ai l\'air d\'un comptable qui aime les ballons. Parfait.',
];
export default defineRoom({
  id: 'place',
  name: 'La place du village',
  decor: 'decor/place',
  music: 'place',
  description: 'A cobbled village square at dusk, pumpkins everywhere. Left: the job agency "Pôle Frousse" with a counter window. Centre: the town hall with columns, steps and a flag. Right: a road sign to the funfair. A photo booth between them',
  props: {
    photomaton: { name: 'photomaton', img: 'props/photomaton' },
    tas: { name: 'tas d\'objets', img: 'props/tas', visible: 'gloubi_rot' },
  },
  actors: {
    bandelette: { char: 'bandelette', facing: 'right' },
    maire: { char: 'maire', facing: 'left' },
    gloubi: { char: 'gloubi' },
    brigadier: { char: 'brigadier', facing: 'left' },
  },
  hotspots: {
    pole_frousse: { name: 'Pôle Frousse' },
    mairie: { name: 'mairie' },
    citrouilles: { name: 'citrouilles' },
  },
  exits: {
    chemin_manoir: { name: 'chemin du manoir', to: 'manoir', entry: 'place' },
    route_foire: { name: 'route de la fête foraine', to: 'foire', entry: 'place', if: 'route_ouverte',
      locked: 'Le Brigadier me barre la route.' },
  },
  look: {
    bandelette: ['Mme Bandelette, de Pôle Frousse. Elle tape à un doigt. Très lentement.', 'Elle vient de cligner des yeux. Ça a pris dix secondes.'],
    maire: ['Monsieur le Maire. Il serre des mains. Parfois, ce sont les siennes.', 'Sa tête penche. Il lui manque quelque chose au cou.'],
    gloubi: ['Gloubi, l\'éboueur. Il avale tout ce qui traîne.', 'Il vient d\'avaler une poubelle. Avec le couvercle.', 'Je garde mes distances. J\'ai des os, il aime peut-être les os.', 'Il me sourit. J\'espère que c\'est de l\'amitié.'],
    brigadier: ['Le Brigadier Sans-Tête. Il surveille la route. Sans yeux.', 'Il a un képi. Il ne sait pas où le mettre.'],
    photomaton: ['Un photomaton. Quatre photos pour deux euros.', 'Il me regarde de travers.', 'Il a encore un peu de fumée qui sort.', 'Je crois qu\'il a peur que je revienne.'],
    tas: 'Un parapluie, un vélo d\'enfant, un dentier… Tout ce que Gloubi avait avalé.',
    pole_frousse: '« Pôle Frousse, agence pour l\'emploi des créatures. » C\'est là que je dois aller.',
    mairie: 'La mairie. Le drapeau est bleu, blanc, et un peu vert. À cause du Maire.',
    citrouilles: ['Des citrouilles. Des cousines, peut-être.', 'Bonjour, tata.'],
    chemin_manoir: 'Le chemin du manoir. Je n\'y travaille plus.',
    route_foire: 'La route de la fête foraine. On y entend de la musique d\'orgue.',
  },
  on: [
    // Le photomaton
    { id: 'place.photo-nez', verb: 'use', a: 'nez', b: 'photomaton', if: '!photo_ok', do: PHOTO_REUSSIE },
    { id: 'place.photo-reussie', verb: 'use', a: 'photomaton', if: { all: [{ has: 'nez' }, '!photo_ok'] }, do: PHOTO_REUSSIE },
    { id: 'place.photo-affiche', verb: 'use', a: 'photomaton', if: { all: ['photo_ok', 'essai', '!affiche_posee', { not: { has: 'photo_ratee' } }] }, do: [
      'Sans le nez, cette fois. Pour la science.',
      { sfx: 'flash' }, { shake: 600 },
      'FLASH. La machine hurle et crache une photo terrifiante.',
      { gain: 'photo_ratee' },
      'Parfait. Enfin, parfaitement horrible.',
    ] },
    { id: 'place.photo-deja', verb: 'use', a: 'photomaton', if: 'photo_ok', do: ['J\'ai déjà ma photo. Je ne vais pas abuser.'] },
    { id: 'place.photo-ratee', verb: 'use', a: 'photomaton', if: '!photo_ratee_faite', do: [
      { sfx: 'flash' }, { shake: 600 },
      'Clic. Flash. Hmm. La machine tremble.',
      'Elle tousse de la fumée… et crache une photo.',
      { gain: 'photo_ratee' }, { set: 'photo_ratee_faite' },
      'Elle est réussie, non ?',
      { say: ['bandelette', 'D\'iciii, je vous le dis : refusééée. On ne recrute pas les gens qui font peur aux photos.'] },
      'Il me faudrait une tête plus… sympa. Une tête de fête.',
    ] },
    { id: 'place.photo-pause', verb: 'use', a: 'photomaton', do: ['Il affiche : « EN PAUSE CAFÉ. REVENEZ AVEC UNE AUTRE TÊTE. »'] },

    // Mme Bandelette et le dossier
    { id: 'place.dossier-complet', verb: 'give', a: ['photo', 'lettre'], b: 'bandelette', if: { all: [{ has: 'photo' }, { has: 'lettre' }] }, do: [
      { cutscene: [
        { lose: 'photo' }, { lose: 'lettre' }, { set: 'dossier_fini' },
        { say: ['bandelette', 'Photooo, ok. Lettre du Maiiire, ok. Dossier compleeet.'] },
        { say: ['bandelette', 'Bon. Alors, pour un squelette qui fait très peur, j\'ai…'] },
        { wait: 1200 },
        { say: ['bandelette', '…une seule offre. Mais elle est bizarre. Même pour ici.'] },
        'Bizarre, c\'est mon deuxième prénom.',
        { say: ['bandelette', '« Train fantôme cherche employé effrayant. Période d\'essai : la nuit d\'Halloween. » Chez M. Wolfgang.'] },
        { gain: 'fiche_poste' },
        { toast: 'FIN DE L\'ÉPISODE 1 : Jack a un dossier. Épisode 2 : la période d\'essai !' },
        'Le train fantôme ! À la fête foraine. Wolfgang m\'attend.',
      ] },
    ] },
    { id: 'place.dossier-photo-seule', verb: 'give', a: 'photo', b: 'bandelette', do: [{ say: ['bandelette', 'Jolie photooo. Il me manque encore la lettre du Maiiire.'] }] },
    { id: 'place.dossier-lettre-seule', verb: 'give', a: 'lettre', b: 'bandelette', do: [{ say: ['bandelette', 'Belle lettre. Il me manque encore une photooo.'] }] },
    { id: 'place.photo-ratee-bandelette', verb: 'give', a: 'photo_ratee', b: 'bandelette', do: [
      { say: ['bandelette', 'Aaaah !'], shout: true },
      { say: ['bandelette', 'Pardon. Refusééée. Il me faut une photo qui ne fait pas peur.'] },
    ] },

    // Gloubi
    { id: 'place.barbe-gloubi', verb: 'give', a: 'barbe', b: 'gloubi', do: [
      { lose: 'barbe' },
      { say: ['gloubi', 'BARBE À PAPA ! Gloubi heureux ! Gloubi trèèès heureux !'] },
      { sfx: 'burp' }, { shake: 700 }, { set: 'gloubi_rot' }, { show: 'tas' },
      { say: ['gloubi', 'BUUUUURP.'], shout: true },
      'Un parapluie, un vélo d\'enfant, un dentier… et un boulon !',
      { say: ['gloubi', 'Pardon. Gloubi poli d\'habitude.'] },
      { gain: 'boulon' },
      'Je prends juste le boulon. Le dentier, je te le laisse.',
    ] },
    { id: 'place.chaussette-gloubi', verb: 'give', a: 'chaussette', b: 'gloubi', do: [
      { lose: 'chaussette' }, { set: 'chaussette_rendue' },
      { say: ['gloubi', 'Blorp ! Chaussette perdue ! Gloubi cherchait depuis Pâques. Merci ami.'] },
      { say: ['gloubi', 'Gloubi ému. Mais pas assez pour roter. Barbe à papa, oui.'] },
    ] },
    { id: 'place.lanterne-gloubi', verb: 'give', a: 'lanterne', b: 'gloubi', do: [{ say: ['gloubi', 'Gloubi pas manger lumière. Après, ventre qui brille la nuit.'] }] },

    // Le Maire
    { id: 'place.look-maire-ok', verb: 'look', a: 'maire', if: 'lettre_ok', do: [{ id: 'place.look-maire-ok.cycle', cycle: [['Le Maire, tête bien droite. Il serre des mains deux fois plus vite.'], ['Il a l\'air plus grand. Et plus content. Surtout plus grand.']] }] },
    { id: 'place.boulon-maire', verb: 'give', a: 'boulon', b: 'maire', do: [
      { lose: 'boulon' }, { set: 'lettre_ok' },
      { say: ['maire', 'Mon boulon !'] },
      'Il le visse. Sa tête se redresse. Il a grandi de dix centimètres.',
      { say: ['maire', 'Ah ! Je vois de nouveau mes électeurs dans les yeux !'] },
      { say: ['maire', 'Tenez, Jack. « Jack est honnête, travailleur, et il a rendu un boulon. » Signé : le Maire.'] },
      { gain: 'lettre' },
    ] },
    { id: 'place.lanterne-maire', verb: 'give', a: 'lanterne', b: 'maire', do: [{ say: ['maire', 'Merci, mais j\'ai déjà un éclairage public. Il s\'appelle « la foudre ».'] }] },

    // Le Brigadier
    { id: 'place.lanterne-brigadier', verb: 'give', a: 'lanterne', b: 'brigadier', do: [
      { lose: 'lanterne' }, { set: 'route_ouverte' }, { sfx: 'light_on' },
      'Il pose la lanterne sur son col. Elle s\'allume.',
      { say: ['brigadier', 'Oh ! OH ! Je vois ! Il y a un ciel ! Il est ORANGE ?'] },
      'Non, ça c\'est la lanterne. Le ciel est violet.',
      { say: ['brigadier', 'Je vous vois, citoyen. Vous pouvez passer. Bonne fête foraine !'] },
      { unlock: 'foire' },
      { toast: 'Nouveau sur la carte : la fête foraine' },
      'Je peux y aller par la route, à droite, ou avec la carte, en bas à gauche.',
    ] },
    { id: 'place.route-fermee', verb: ['use', 'open', 'push', 'pull'], a: 'route_foire', if: '!route_ouverte', do: [
      { say: ['brigadier', 'HALTE ! Personne ne passe sans que je le voie !'], shout: true },
      'Il ne voit personne. Donc personne ne passe. Logique de brigadier.',
    ] },
    { id: 'place.prendre-citrouille', verb: 'take', a: 'citrouilles', do: ['Prendre une citrouille ? C\'est comme prendre un cousin. Non.'] },
    { id: 'place.prendre-chaine', verb: ['take', 'use'], a: 'tas', if: { all: ['greve_connue', '!chaine_prise'] }, do: [
      'Le vélo d\'enfant que Gloubi a recraché. Sa chaîne est toute légère.',
      { set: 'chaine_prise' }, { gain: 'chaine' },
      { say: ['gloubi', 'Gloubi pas besoin vélo. Gloubi roule tout seul. Blorp.'] },
    ] },
    { id: 'place.prendre-tas', verb: 'take', a: 'tas', do: ['Le dentier ? Non merci. J\'ai déjà toutes mes dents. Elles sont en citrouille.'] },
  ],
  talk: {
    bandelette: [
      { id: 'place.bandelette.travail', topic: 'Je cherche du travail.', if: '!dossier_connu', do: [
        { say: ['bandelette', 'Bienveeenue à Pôle Frouuusse. Numéroooo ?'] },
        'Il n\'y a personne d\'autre.',
        { say: ['bandelette', 'Ça n\'empêche paaas. Prenez un numérooo.'] },
        'Je prends le ticket numéro 1.',
        { wait: 1500 },
        { say: ['bandelette', 'Numérooo… uuun.'] },
        'C\'est moi.',
        { say: ['bandelette', 'Pour un dossier, il me faut une photo d\'identitééé et une lettre de recommandatiooon.'] },
        { say: ['bandelette', 'Les lettres, c\'est le Maiiire qui les signe.'] },
        { set: 'dossier_connu' },
      ] },
      { id: 'place.bandelette.quoi', topic: 'Il vous faut quoi, déjà ?', if: 'dossier_connu', do: [
        { say: ['bandelette', 'Une photooo. Une lettre du Maiiire. Et de la patieeence.'] },
      ] },
      { id: 'place.bandelette.draps', topic: 'Vous auriez des bandelettes en trop ?', if: { all: ['greve_connue', '!draps_ok', { not: { has: 'bandelettes' } }] }, do: [
        { say: ['bandelette', 'Des bandelettes ? Pour des fantômes ? Quelle idéeee.'] },
        { say: ['bandelette', 'Bon. J\'en ai trois kilomètres en réserve. On ne sait jamais, avec l\'âge.'] },
        'Elle se déroule un peu, et me tend un gros rouleau.',
        { gain: 'bandelettes' },
        'Du lin d\'Égypte. Ginette va adorer.',
      ] },
      { id: 'place.bandelette.longtemps', topic: 'Vous êtes là depuis longtemps ?', do: [
        { say: ['bandelette', 'Quatre mille aaans. Je suis en période d\'essaaai.'] },
      ] },
    ],
    maire: [
      { id: 'place.maire.tete', topic: 'Monsieur le Maire, votre tête…', if: '!lettre_ok', do: [
        { say: ['maire', 'Bonjour, citoyen ! Franck Enstein, maire de la commune. Votez pour moi.'] },
        { say: ['maire', 'Ma tête ? J\'ai perdu un boulon. Celui du cou. Gloubi l\'a avalé ce matin en nettoyant.'] },
        { say: ['maire', 'Rendez-moi mon boulon, et je vous écris la plus belle lettre de recommandation du pays.'] },
        { set: 'boulon_connu' },
      ] },
      { id: 'place.maire.mieux', topic: 'Ça va mieux, la tête ?', if: 'lettre_ok', do: [
        { say: ['maire', 'Comme un charme ! Je vois enfin les deux côtés de chaque problème.'] },
        { say: ['maire', 'Avant, je ne voyais que le gauche. On m\'a accusé de faire de la politique.'] },
        'Et moi, je ne vois que le travail que je n\'ai pas.',
        { say: ['maire', 'Courage, citoyen ! Avec ma lettre, Mme Bandelette vous trouvera quelque chose.'] },
      ] },
      { id: 'place.maire.fait', topic: 'Vous êtes fait de quoi ?', do: [
        { say: ['maire', 'De plusieurs anciens maires. C\'est ça, la continuité.'] },
      ] },
      { id: 'place.maire.travail', topic: 'Vous avez un travail pour moi ?', do: [
        { say: ['maire', 'Demandez à Pôle Frousse. Moi, je ne fais que serrer des mains. Parfois elles se détachent.'] },
      ] },
    ],
    gloubi: [
      { id: 'place.gloubi.bonjour', topic: 'Bonjour ! Tu fais quoi ?', do: [
        { say: ['gloubi', 'Blorp ! Moi, Gloubi. Moi nettoyer. Moi avaler tout.'] },
      ] },
      { id: 'place.gloubi.boulon', topic: 'Tu n\'aurais pas avalé un boulon ?', if: { all: ['boulon_connu', '!gloubi_rot'] }, do: [
        { say: ['gloubi', 'Gloubi jamais rendre. Ce qui rentre dans Gloubi reste dans Gloubi.'] },
        { say: ['gloubi', 'Sauf si Gloubi trop content. Quand Gloubi content, Gloubi fait un rot.'] },
        'Et qu\'est-ce qui te rend content ?',
        { say: ['gloubi', 'Barbe à papa. Gloubi rêve barbe à papa.'] },
        { say: ['gloubi', 'Mais fête foraine, interdite aux éboueurs. Bloorp.'] },
        { set: 'barbe_connue' },
      ] },
      { id: 'place.gloubi.mange', topic: 'Tu as mangé quoi aujourd\'hui ?', do: [
        { say: ['gloubi', 'Deux poubelles, un banc, un pigeon. Pigeon ressorti. Pigeon vexé.'] },
      ] },
    ],
    brigadier: [
      { id: 'place.brigadier.passer', topic: 'Je peux passer ?', if: '!route_ouverte', do: [
        { say: ['brigadier', 'HALTE ! Personne ne passe sans que je le voie !'] },
        'Mais… vous n\'avez pas de tête.',
        { say: ['brigadier', 'Exactement. Donc je ne vois personne. Donc personne ne passe. C\'est le règlement.'] },
        { say: ['brigadier', 'Ça fait trois cents ans que la route est bien gardée.'] },
      ] },
      { id: 'place.brigadier.tete', topic: 'Où est votre tête ?', do: [
        { say: ['brigadier', 'Si je le savais, je ne serais pas brigadier. Je serais détective.'] },
      ] },
      { id: 'place.brigadier.foire', topic: 'Il se passe quoi à la fête foraine ?', do: [
        { say: ['brigadier', 'On y embauche, paraît-il. Pour Halloween. Mais je n\'ai rien vu. Forcément.'] },
      ] },
      { id: 'place.brigadier.vue', topic: 'Alors, cette vue ?', if: 'route_ouverte', do: [
        { say: ['brigadier', 'Magnifique. Je vois des choses que je n\'aurais jamais voulu voir. Comme le Maire en pyjama.'] },
      ] },
    ],
  },
  hints: [
    { until: 'dossier_connu', lines: ['Pôle Frousse, à gauche. Parle à la momie du guichet.'] },
    { until: { any: ['boulon_connu', 'lettre_ok'] }, lines: ['Il te faut une lettre du Maire. Va lui parler.'] },
    { until: { any: ['barbe_connue', 'gloubi_rot'] }, lines: ['Le boulon du Maire est dans le ventre de Gloubi. Parle à Gloubi.'] },
    { until: { any: ['route_ouverte', 'gloubi_rot'] }, lines: ['La barbe à papa, c\'est à la fête foraine. Mais le Brigadier ne voit personne passer.', 'Il lui faudrait une tête qui éclaire… Ta lanterne ?', 'DONNE la lanterne au Brigadier.'] },
    { until: 'gloubi_rot', lines: ['Mémé Guimauve, à la fête foraine, paie en barbe à papa.', 'DONNE la barbe à papa à Gloubi.'] },
    { until: 'lettre_ok', lines: ['DONNE le boulon au Maire.'] },
    { until: 'photo_ok', lines: ['Pour la photo, il te faut une tête de fête.', 'Un nez de clown, peut-être ? À la fête foraine, le petit dragon du manège.', 'Avec le nez de clown, UTILISE le photomaton.'] },
    { until: 'dossier_fini', lines: ['DONNE la photo et la lettre à Mme Bandelette.'] },
    { until: 'essai', lines: ['Wolfgang t\'attend à la fête foraine. Donne-lui la fiche de poste.'] },
    { until: { any: ['greve_connue', 'greve_finie'] }, lines: ['Il se passe des choses dans le train fantôme. Va voir à la fête foraine.'] },
    { until: { any: ['draps_ok', { has: 'bandelettes' }] }, lines: ['Des draps neufs pour les fantômes… Mme Bandelette a sûrement des bandelettes en trop.', 'PARLE à Mme Bandelette.'] },
    { until: { any: ['chaines_ok', 'chaine_prise'] }, lines: ['Des chaînes légères… Le tas d\'objets que Gloubi a recraché, il y a un vélo.', 'PRENDS le tas d\'objets : la chaîne du vélo.'] },
    { until: { any: ['affiche_posee', { has: 'photo_ratee' }] }, lines: ['Pour l\'affiche, il te faut une photo qui fait vraiment peur.', 'UTILISE le photomaton, sans le nez de clown.'] },
    { until: 'fin', lines: ['Tout se passe à la fête foraine, maintenant.'] },
  ],
  onEnter: [
    { id: 'place.arrivee', once: ['La place du village. Pôle Frousse, c\'est à gauche.', 'Mireille, ma petite araignée, me souffle les indices si je lui parle.'] },
  ],
});

export const checkpoints = {
  place: { room: 'place', inventory: ['mireille', 'lanterne', 'badge', 'chaussette'], unlocked: ['manoir', 'place'], flags: { casier_ouvert: true, lanterne_ok: true, manoir_quitte: true } },
};
