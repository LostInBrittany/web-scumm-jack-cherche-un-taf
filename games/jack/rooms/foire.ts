import { defineRoom, type Cmd } from 'web-scumm/content';

// La fête foraine (storyboard: foire, final). Geometry in layout/foire.json.

// Count Radinoff's revenge, after the rehearsal (storyboard: final).
const EMBAUCHE: Cmd[] = [
  { sfx: 'paper' }, { lose: 'fiche_poste' }, { set: 'essai' },
  { say: ['wolfgang', 'Un dossier de Pôle Frousse ! En règle ! Ouaf !'] },
  { say: ['wolfgang', 'Bon. Tu es pris à l\'essai. Ce soir, c\'est Halloween : si le train rouvre et que les clients ressortent contents…'] },
  { say: ['wolfgang', '…ET en payant. Surtout en payant. Alors le poste est à toi.'] },
  'Et qu\'est-ce qui ne va pas, dans le train ?',
  { say: ['wolfgang', 'Tout. Les fantômes sont en grève, le courant est coupé, et personne ne sait qu\'on rouvre.'] },
  { say: ['wolfgang', 'Monte dans le wagon, le tunnel est derrière.'] },
];

const FINALE: Cmd[] = [
  { cutscene: [
    // Jack comes back from the train, on Wolfgang's right: they face each other.
    { face: 'wolfgang' }, { face: 'right', who: 'wolfgang' },
    { say: ['wolfgang', 'Ils ont payé. TOUS. Deux fois. Ouaf !'] },
    { say: ['wolfgang', 'Jack, tu n\'es plus à l\'essai. Tu es la vedette du train fantôme.'] },
    'Engagé. Pour faire peur. Juste ce qu\'il faut.',
    { say: ['mireille', 'Bravo, Jack ! Je savais que tu trouverais.'] },
    { wait: 800 },
    { set: 'comte_arrive' }, { show: 'radinoff', fade: 900 }, { face: 'radinoff' },
    { say: ['radinoff', 'Jack ! Mon petit Jack ! Mon manoir est vide. Les touristes n\'ont plus peur. Ils pique-niquent dans la crypte !'] },
    { say: ['radinoff', 'Revenez. Je vous réembauche. Au double du salaire !'] },
    'Le double de quoi ?',
    { say: ['radinoff', '…Le double de l\'ancien. Moins la bougie.'] },
  ] },
  { choice: [
    { id: 'foire.finale.euros', text: 'Non merci, j\'ai trouvé un patron qui paie en vrais euros.', do: [] },
    { id: 'foire.finale.chaise', text: 'Ça dépend. Je peux garder la chaise neuve ?', do: [{ say: ['radinoff', 'Jamais !'] }, 'Alors non.'] },
    { id: 'foire.finale.oui', text: 'Oui !', do: [{ say: ['radinoff', 'Vraiment ?!'] }, '…Non, je plaisante.'] },
  ] },
  { cutscene: [
    { say: ['radinoff', 'Vous refusez ? Moi qui étais prêt à vous offrir… un ticket de bus. Usagé.'] },
    { face: 'radinoff', who: 'wolfgang' },
    { say: ['wolfgang', 'Monsieur le Comte, un tour de train fantôme ? Deux euros.'] },
    { say: ['radinoff', 'Deux euros ?! …Bon. Pour voir ce qu\'il a de si spécial.'] },
    { hide: 'radinoff', fade: 600 },
    { wait: 1500 },
    { say: ['radinoff', 'AAAAAAAAH !'], shout: true },
    { shake: 600 },
    { wait: 800 },
    { show: 'radinoff', fade: 400 },
    { say: ['radinoff', 'C\'était… TERRIFIANT. J\'en reprends un. Tenez, quatre euros.'] },
    { sfx: 'coins' },
    'Le Comte Radinoff qui paie. Deux fois. Ça, c\'est le vrai miracle d\'Halloween.',
    { set: 'fin' },
  ] },
  { end: true },
];
export default defineRoom({
  id: 'foire',
  name: 'La fête foraine',
  decor: 'decor/foire',
  music: 'foire',
  description: 'A small night funfair under a starry purple sky with garlands of coloured bulbs. Left: a pink and white cotton candy stand. Centre: a little carousel with a red roof. Right: a dark ghost train with big eyes over its entrance and a red wagon',
  props: {
    panneau: { name: 'panneau', states: { vide: 'props/panneau_vide', affiche: 'props/panneau_affiche' }, initial: 'vide' },
    pepite: { name: 'Pépite', states: { scared: 'props/pepite_peur', calm: 'props/pepite_calme' }, initial: 'scared' },
  },
  actors: {
    guimauve: { char: 'guimauve', facing: 'right' },
    carrousel: { char: 'carrousel', facing: 'left' },
    wolfgang: { char: 'wolfgang', facing: 'left' },
    radinoff: { char: 'radinoff', facing: 'right', visible: 'comte_arrive', interactive: false },
  },
  hotspots: {
    stand: { name: 'stand de barbe à papa' },
    manege: { name: 'manège' },
    train: { name: 'train fantôme' },
  },
  exits: {
    route_place: { name: 'route de la place', to: 'place', entry: 'foire' },
    wagon: { name: 'wagon', to: 'train', entry: 'foire', if: 'essai', locked: 'Le train fantôme est fermé. Les fantômes sont en grève.' },
  },
  look: {
    guimauve: ['Mémé Guimauve. Une sorcière à la retraite qui fait de la barbe à papa.', 'Elle sent le sucre et le chaudron.'],
    carrousel: ['M. Carrousel. Il a l\'air inquiet.', 'Il tourne en rond. Comme un manège. Mais pas le sien.'],
    wolfgang: ['Wolfgang, le patron du train fantôme. Un loup-garou à lunettes.', 'Il lit un livre de comptabilité. Pour se faire peur.'],
    pepite: ['Pépite, le petit dragon du manège. Il tremble.', 'Il se cache derrière sa queue. Elle est trop petite.'],
    stand: 'Le stand de barbe à papa. Ça sent la guimauve et le travail.',
    manege: 'Un manège. Il ne tourne pas. Il boude.',
    train: ['Le train fantôme. Fermé.', 'Il a des grands yeux. Ils me regardent.', 'Je crois qu\'il me trouve effrayant.', 'Un wagon vient de me faire un clin d\'œil. Je crois. Ou c\'est la rouille.'],
    wagon: 'Un wagon rouge. Il attend des passagers. Et des fantômes.',
    panneau: ['Le panneau du train fantôme. Vide. Personne ne sait qu\'on rouvre.', 'Il faudrait une affiche qui fait vraiment peur.'],
    radinoff: 'Le Comte Radinoff. À la fête foraine. Il a dû perdre un pari.',
    route_place: 'La route de la place du village.',
  },
  on: [
    // Pépite
    { id: 'foire.caresser-pepite', verb: ['use', 'push', 'pull', 'take'], a: 'pepite', if: { all: ['carrousel_connu', '!pepite_calme'] }, do: [
      { minigame: 'stroke', params: {
        target: 'minigame/pepite_big', hand: 'minigame/main',
        intro: 'Doucement, Jack. Tout doucement.', tooFast: 'Trop vite ! Il crache une petite flamme.',
        win: 'Il ronronne !',
      }, then: [
        { sfx: 'success' }, { prop: ['pepite', 'calm'] }, { set: 'pepite_calme' },
        'Pépite se calme… et éternue. Quelque chose vole jusqu\'à moi.',
        { gain: 'nez' },
        { say: ['carrousel', 'Un nez de clown ! Il l\'avait avalé l\'an dernier ! Garde-le, ça te va bien.'] },
        { say: ['carrousel', 'Par contre, le poste de dompteur… Pépite est calme. Il n\'a plus besoin de dompteur. Désolé !'] },
        'Troisième licenciement de la journée. Record personnel.',
      ] },
    ] },
    { id: 'foire.pepite-peur', verb: ['use', 'push', 'pull', 'take'], a: 'pepite', if: '!pepite_calme', do: [
      'Pépite crache une flammèche. Ouille.',
      'Je devrais d\'abord demander au patron du manège.',
    ] },
    { id: 'foire.pepite-calme', verb: ['use', 'push', 'pull', 'take'], a: 'pepite', do: ['Il ronronne. Prrrt. Prrrrrrt.'] },
    { id: 'foire.chaussette-pepite', verb: 'give', a: 'chaussette', b: 'pepite', do: [
      'Pépite souffle dessus. Pfffff.',
      'La chaussette prend feu, puis s\'éteint. Trop gluante pour brûler.',
    ] },
    { id: 'foire.look-panneau-affiche', verb: 'look', a: 'panneau', if: { prop: ['panneau', 'affiche'] }, do: ['Mon affiche. Les passants frissonnent. Les plus courageux font la queue.'] },
    { id: 'foire.affiche', verb: 'use', a: 'photo_ratee', b: 'panneau', if: 'essai', do: [
      'Ma photo ratée. Celle qui a fait peur au photomaton.',
      { sfx: 'paper' }, { lose: 'photo_ratee' }, { prop: ['panneau', 'affiche'] }, { set: 'affiche_posee' },
      { say: ['wolfgang', 'Ouaf ! Rien qu\'en la regardant, j\'ai perdu des poils. Je l\'agrandis en poster géant. C\'est PARFAIT.'] },
      'Des passants s\'arrêtent, frissonnent… et font la queue.',
    ] },
    { id: 'foire.affiche-tot', verb: 'use', a: 'photo_ratee', b: 'panneau', do: ['Coller ma photo ici ? Je ne travaille pas encore pour le train fantôme.'] },
    { id: 'foire.affiche-wolfgang', verb: 'give', a: 'photo_ratee', b: 'wolfgang', if: 'essai', do: [{ say: ['wolfgang', 'Brr. Colle-la plutôt sur le panneau, devant le train. Qu\'elle fasse peur aux passants, pas à moi.'] }] },
    { id: 'foire.fiche-wolfgang', verb: 'give', a: 'fiche_poste', b: 'wolfgang', do: EMBAUCHE },
    { id: 'foire.monter-wagon', verb: ['use', 'push', 'pull'], a: 'train', if: '!essai', do: [{ say: ['wolfgang', 'Ouaf. C\'est fermé. Mes fantômes sont en grève.'] }] },
    { id: 'foire.prendre-barbe-stand', verb: 'take', a: 'stand', do: [{ say: ['guimauve', 'Pas touche, mon chou ! Ici, la barbe à papa, ça se mérite.'] }] },
  ],
  talk: {
    guimauve: [
      { id: 'foire.guimauve.embauche', topic: 'Vous embauchez ?', if: '!barbe_gagnee', do: [
        { say: ['guimauve', 'Un vendeur ! Enfin ! Mon dos de sorcière n\'en peut plus.'] },
        { say: ['guimauve', 'Les clients demandent une couleur, tu sers la bonne. Facile, mon chou.'] },
        'Facile. Je suis né pour ça. Enfin, mort pour ça.',
        { minigame: 'pick', params: {
          rounds: [
            { prompt: 'Un petit fantôme voudrait une barbe à papa ROSE.', options: ['minigame/barbe_bleue', 'minigame/barbe_rose', 'minigame/barbe_verte'], answer: 1 },
            { prompt: 'Une sorcière veut la VERTE. Comme son nez.', options: ['minigame/barbe_verte', 'minigame/barbe_jaune', 'minigame/barbe_araignee'], answer: 0 },
            { prompt: 'Un vampire demande la BLEUE. « Pas la rouge, je suis au régime. »', options: ['minigame/barbe_jaune', 'minigame/barbe_rose', 'minigame/barbe_bleue'], answer: 2 },
          ],
          decoy: 'minigame/barbe_araignee', decoyLine: 'Barbe à papa à la toile d\'araignée ! Le client s\'enfuit en hurlant… puis revient, il n\'a pas payé.',
          wrongLine: 'Pas celle-là ! Le client fait une drôle de tête.',
          intro: 'Écoute bien ce que veut le client, Jack.', win: 'Trois clients servis !',
        }, then: [
          { say: ['guimauve', 'Tu sers très bien, mon chou. Mais les enfants ont peur de ta tête. Ils mangent en tremblant.'] },
          { say: ['guimauve', 'Tiens, ta paie : une barbe à papa. Et bonne chance pour la suite !'] },
          { sfx: 'success' }, { gain: 'barbe' }, { set: 'barbe_gagnee' },
          'Deuxième licenciement de la journée. Je progresse.',
        ] },
      ] },
      { id: 'foire.guimauve.encore', topic: 'Je peux retravailler ?', if: 'barbe_gagnee', do: [
        { say: ['guimauve', 'Non, mon chou. Les enfants tremblent encore. Regarde, il y en a un qui fait des glaçons.'] },
      ] },
      { id: 'foire.guimauve.sorciere', topic: 'Vous êtes une vraie sorcière ?', do: [
        { say: ['guimauve', 'À la retraite. Maintenant, je fais du sucre. C\'est de la magie qui colle.'] },
      ] },
    ],
    carrousel: [
      { id: 'foire.carrousel.manege', topic: 'Votre manège ne tourne pas ?', if: '!pepite_calme', do: [
        { say: ['carrousel', 'Mon manège est en panne ! Pépite, mon petit dragon, a peur des enfants. Il ne veut plus tourner.'] },
        'Un dragon qui a peur ? Je connais un peu le sujet. Dans l\'autre sens.',
        { say: ['carrousel', 'Si tu le calmes, le poste de dompteur est à toi. Il faut le caresser, tout doucement.'] },
        { set: 'carrousel_connu' },
      ] },
      { id: 'foire.carrousel.pourquoi', topic: 'Pourquoi Pépite a peur ?', do: [
        { say: ['carrousel', 'Un enfant lui a dit qu\'il ressemblait à un lézard. Il ne s\'en est jamais remis.'] },
      ] },
    ],
    wolfgang: [
      { id: 'foire.wolfgang.dossier', topic: 'J\'ai mon dossier de Pôle Frousse !', if: { has: 'fiche_poste' }, do: EMBAUCHE },
      { id: 'foire.wolfgang.pret', topic: 'Tout est prêt !', if: { all: ['greve_finie', 'courant_ok', 'affiche_posee', '!repetition'] }, do: [
        { say: ['wolfgang', 'Les fantômes travaillent, le train roule, il y a une queue. Je n\'en reviens pas.'] },
        { say: ['wolfgang', 'Place à la répétition générale. Les premiers clients arrivent ! File te cacher dans le train !'] },
        { set: 'repetition' },
        { goto: 'train', at: 'foire' },
      ] },
      { id: 'foire.wolfgang.ou', topic: 'Où on en est ?', if: { all: ['essai', '!repetition'] }, do: [
        { if: 'greve_finie', then: [{ say: ['wolfgang', 'Les fantômes ont repris le travail. Bravo.'] }], else: [{ say: ['wolfgang', 'Les fantômes font toujours grève. Va voir Ginette, dans le train.'] }] },
        { if: 'courant_ok', then: [{ say: ['wolfgang', 'Le courant marche.'] }], else: [{ say: ['wolfgang', 'Toujours pas de courant. Le tableau électrique est au fond du tunnel.'] }] },
        { if: 'affiche_posee', then: [{ say: ['wolfgang', 'L\'affiche fait un malheur.'] }], else: [{ say: ['wolfgang', 'Et personne ne sait qu\'on rouvre. Il faudrait une affiche qui fait peur, sur le panneau.'] }] },
      ] },
      { id: 'foire.wolfgang.travail', topic: 'C\'est quoi, le travail ?', if: 'essai', do: [
        { say: ['wolfgang', 'Tu te caches dans le noir, et quand le wagon passe, BOUH. Mais pas trop fort. Il faut qu\'ils paient à la sortie.'] },
      ] },
      { id: 'foire.wolfgang.train', topic: 'Vous embauchez au train fantôme ?', if: { all: ['!essai', { not: { has: 'fiche_poste' } }] }, do: [
        { say: ['wolfgang', 'Ouaf. Désolé, mon train fantôme est fermé. Mes fantômes sont en grève.'] },
        'Je fais peur. Très peur. Trop peur, même. Engagez-moi !',
        { say: ['wolfgang', 'Faut un dossier de Pôle Frousse. C\'est la loi. Reviens avec, on verra.'] },
      ] },
      { id: 'foire.wolfgang.greve', topic: 'Pourquoi vos fantômes font grève ?', do: [
        { say: ['wolfgang', 'Ils veulent des draps neufs. Et des chaînes moins lourdes. Je les comprends.'] },
      ] },
      { id: 'foire.wolfgang.loup', topic: 'Vous êtes un loup-garou ?', do: [
        { say: ['wolfgang', 'Seulement les soirs de pleine lune. Le reste du temps, je suis comptable.'] },
      ] },
    ],
  },
  hints: [
    { until: { any: ['barbe_gagnee', 'gloubi_rot'] }, lines: ['Ici, on embauche. Mémé Guimauve cherche un vendeur.', 'PARLE à Mémé Guimauve. Elle paie en barbe à papa.'] },
    { until: 'carrousel_connu', lines: ['Le patron du manège a l\'air embêté. Parle-lui.'] },
    { until: 'pepite_calme', lines: ['Pépite a peur. Il faut le caresser, tout doucement.', 'UTILISE Pépite pour le caresser.'] },
    { until: 'dossier_fini', lines: ['Tu as ce qu\'il faut. Retourne sur la place, Jack.'] },
    { until: 'essai', lines: ['Wolfgang voulait un dossier de Pôle Frousse. DONNE-lui la fiche de poste.'] },
    { until: { any: ['greve_connue', 'greve_finie'] }, lines: ['Le train fantôme est derrière le wagon. Va voir ce qui s\'y passe.'] },
    { until: { any: ['affiche_posee', { has: 'photo_ratee' }] }, lines: ['L\'affiche : il faut une image qui fait vraiment peur. Ta photo ratée du photomaton ?', 'Tu ne l\'as plus ? Le photomaton, sur la place, sans le nez de clown.'] },
    { until: 'affiche_posee', lines: ['UTILISE la photo ratée avec le panneau, devant le train.'] },
    { until: { all: ['greve_finie', 'courant_ok'] }, lines: ['Il reste du travail dans le train fantôme.'] },
    { until: 'repetition', lines: ['Tout est prêt ? Dis-le à Wolfgang.'] },
  ],
  onEnter: [
    { if: { all: ['repetition_reussie', '!fin'] }, then: FINALE },
    { id: 'foire.arrivee', once: ['Guirlandes, musique d\'orgue, odeur de sucre.', 'Ça sent le travail. Et la guimauve.'] },
  ],
});

export const checkpoints = {
  foire: { room: 'foire', unlocked: ['manoir', 'place', 'foire'], inventory: ['mireille', 'badge', 'chaussette'], flags: { casier_ouvert: true, lanterne_ok: true, manoir_quitte: true, dossier_connu: true, boulon_connu: true, barbe_connue: true, route_ouverte: true } },
  retour: { room: 'place', unlocked: ['manoir', 'place', 'foire'], inventory: ['mireille', 'badge', 'chaussette', 'barbe', 'nez'], flags: { casier_ouvert: true, lanterne_ok: true, manoir_quitte: true, dossier_connu: true, boulon_connu: true, barbe_connue: true, route_ouverte: true, barbe_gagnee: true, carrousel_connu: true, pepite_calme: true }, props: { 'foire.pepite': 'calm' } },
};
