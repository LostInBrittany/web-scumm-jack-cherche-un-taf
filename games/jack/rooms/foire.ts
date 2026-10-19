import { defineRoom } from 'web-scumm/content';

// La fête foraine (storyboard: foire). Geometry in layout/foire.json.
export default defineRoom({
  id: 'foire',
  name: 'La fête foraine',
  decor: 'decor/foire',
  description: 'A small night funfair under a starry purple sky with garlands of coloured bulbs. Left: a pink and white cotton candy stand. Centre: a little carousel with a red roof. Right: a dark ghost train with big eyes over its entrance and a red wagon',
  props: {
    pepite: { name: 'Pépite', states: { scared: 'props/pepite_peur', calm: 'props/pepite_calme' }, initial: 'scared' },
  },
  actors: {
    guimauve: { char: 'guimauve', facing: 'right' },
    carrousel: { char: 'carrousel', facing: 'left' },
    wolfgang: { char: 'wolfgang', facing: 'left' },
  },
  hotspots: {
    stand: { name: 'stand de barbe à papa' },
    manege: { name: 'manège' },
    train: { name: 'train fantôme' },
    wagon: { name: 'wagon' },
  },
  exits: {
    route_place: { name: 'route de la place', to: 'place', entry: 'foire' },
  },
  look: {
    guimauve: ['Mémé Guimauve. Une sorcière à la retraite qui fait de la barbe à papa.', 'Elle sent le sucre et le chaudron.'],
    carrousel: ['Mme Carrousel. Elle a l\'air inquiète.', 'Elle tourne en rond. Comme un manège. Mais pas le sien.'],
    wolfgang: ['Wolfgang, le patron du train fantôme. Un loup-garou à lunettes.', 'Il lit un livre de comptabilité. Pour se faire peur.'],
    pepite: ['Pépite, le petit dragon du manège. Il tremble.', 'Il se cache derrière sa queue. Elle est trop petite.'],
    stand: 'Le stand de barbe à papa. Ça sent la guimauve et le travail.',
    manege: 'Un manège. Il ne tourne pas. Il boude.',
    train: ['Le train fantôme. Fermé.', 'Il a des grands yeux. Ils me regardent.', 'Je crois qu\'il me trouve effrayant.', 'Un wagon vient de me faire un clin d\'œil. Je crois. Ou c\'est la rouille.'],
    wagon: 'Un wagon rouge. Il attend des passagers. Et des fantômes.',
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
        { prop: ['pepite', 'calm'] }, { set: 'pepite_calme' },
        'Pépite se calme… et éternue. Quelque chose vole jusqu\'à moi.',
        { gain: 'nez' },
        { say: ['carrousel', 'Un nez de clown ! Il l\'avait avalé l\'an dernier ! Garde-le, ça te va bien.'] },
        { say: ['carrousel', 'Par contre, le poste de dompteur… Pépite est calme. Il n\'a plus besoin de dompteur. Désolée !'] },
        'Troisième licenciement de la journée. Record personnel.',
      ] },
    ] },
    { id: 'foire.pepite-peur', verb: ['use', 'push', 'pull', 'take'], a: 'pepite', if: '!pepite_calme', do: [
      'Pépite crache une flammèche. Ouille.',
      'Je devrais d\'abord demander à la dame du manège.',
    ] },
    { id: 'foire.pepite-calme', verb: ['use', 'push', 'pull', 'take'], a: 'pepite', do: ['Il ronronne. Prrrt. Prrrrrrt.'] },
    { id: 'foire.chaussette-pepite', verb: 'give', a: 'chaussette', b: 'pepite', do: [
      'Pépite souffle dessus. Pfffff.',
      'La chaussette prend feu, puis s\'éteint. Trop gluante pour brûler.',
    ] },
    { id: 'foire.monter-wagon', verb: ['use', 'push', 'pull'], a: ['wagon', 'train'], do: [{ say: ['wolfgang', 'Ouaf. C\'est fermé. Mes fantômes sont en grève.'] }] },
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
          { gain: 'barbe' }, { set: 'barbe_gagnee' },
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
      { id: 'foire.wolfgang.train', topic: 'Vous embauchez au train fantôme ?', do: [
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
    { until: 'carrousel_connu', lines: ['La dame du manège a l\'air embêtée. Parle-lui.'] },
    { until: 'pepite_calme', lines: ['Pépite a peur. Il faut le caresser, tout doucement.', 'UTILISE Pépite pour le caresser.'] },
    { until: 'dossier_fini', lines: ['Tu as ce qu\'il faut. Retourne sur la place, Jack.'] },
  ],
  onEnter: [
    { id: 'foire.arrivee', once: ['Guirlandes, musique d\'orgue, odeur de sucre.', 'Ça sent le travail. Et la guimauve.'] },
  ],
});

export const checkpoints = {
  foire: { room: 'foire', unlocked: ['manoir', 'place', 'foire'], inventory: ['mireille', 'badge', 'chaussette'], flags: { casier_ouvert: true, lanterne_ok: true, manoir_quitte: true, dossier_connu: true, boulon_connu: true, barbe_connue: true, route_ouverte: true } },
  retour: { room: 'place', unlocked: ['manoir', 'place', 'foire'], inventory: ['mireille', 'badge', 'chaussette', 'barbe', 'nez'], flags: { casier_ouvert: true, lanterne_ok: true, manoir_quitte: true, dossier_connu: true, boulon_connu: true, barbe_connue: true, route_ouverte: true, barbe_gagnee: true, carrousel_connu: true, pepite_calme: true }, props: { 'foire.pepite': 'calm' } },
};
