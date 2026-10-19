# Écrire le contenu du jeu

Ce guide s'adresse à qui écrit le scénario : les lieux, les répliques, les énigmes. Il décrit le format que le moteur lit.
Tu n'as jamais besoin de toucher au moteur (`src/engine/`). Tout le jeu vit dans `games/<jeu>/` (ici `games/demo/`).

Les types complets, avec leurs commentaires, sont dans `src/engine/core/types.ts`. Ton éditeur les propose en autocomplétion.

## Les principes

1. **Du contenu, pas du code.** Le contenu est fait de données : des objets, des listes, des textes. Aucune fonction.
   C'est ce qui permet au moteur de vérifier le jeu tout seul (`npm run validate`) et de prouver qu'il se finit (`npm run solve`).
2. **La logique d'un côté, la géométrie de l'autre.** Tu écris *ce qui se passe* dans `rooms/<lieu>.ts`.
   *Où sont les choses* (rectangles cliquables, position des personnages, zone où l'on marche) vit dans
   `layout/<lieu>.json`, placé à la souris dans l'éditeur (`npm run dev`, puis `?edit=<lieu>`). Tu n'écris jamais de coordonnées à la main,
   sauf pour un déplacement scripté ponctuel.
3. **Rien n'est bloquant.** Toute action a une réponse. Sans réaction écrite, le moteur répond avec les réponses de repli du jeu.
4. **Coordonnées logiques.** Un décor mesure 640 × 400, origine en haut à gauche. Un personnage est placé par ses pieds.

## Le contrat d'identité v3

Un nouveau jeu pose `schemaVersion: 3` dans `game.ts`. Tout ce dont la position d'exécution survit dans une sauvegarde
porte un id explicite et unique : chaque `Rule`, `TalkTopic`, `Choice`, `EventRule`, ainsi que chaque bloc `once`, `nth`,
`cycle` ou `random`. Un `ScriptDef` a déjà son id et ajoute une entrée `stepIds` par commande de premier niveau. Le
validateur refuse un jeu v3 avec des ids absents ou dupliqués. Réordonner le contenu ou traduire un texte ne change donc
plus le sens d'une sauvegarde.

```ts
schemaVersion: 3,
// …
{ id: 'ouvrir.garde_manger', verb: 'open', a: 'garde_manger', do: […] }
{ id: 'demander.cle', topic: 'Où est la clé ?', do: […] }
{ once: […], id: 'arrivee.premiere' }
{ id: 'horloge', stepIds: ['attendre', 'sonner'], do: [{ wait: 1000 }, { sfx: 'carillon' }] }
```

`npm run ids -- --write --map` écrit ces ids dans un jeu existant et l'étape de migration que ses sauvegardes
demandent (`docs/fr/UPGRADING.md` §2). `compileGame(source)` clone et normalise la source une seule fois ; sa sortie v3 est figée en développement. Moteur,
validateur, solveur, replay et outils de puzzle consomment la même représentation compilée. Lire
[UPGRADING.md](UPGRADING.md) avant de convertir un jeu existant.

## Les fichiers

```
games/<jeu>/
  index.ts         point d'entrée : export { game, layouts, manifest, minigames?, extraImages? }
  game.ts          le jeu : verbes, personnages, objets, carte, règles globales, début de partie, habillage (skin), fin (ending), textes d'interface
  rules.ts         réponses de repli, réactions par sorte (« on ne tire pas un chat »)
  rooms/maison.ts  un fichier par lieu (logique)
  layout/maison.json un fichier par lieu (géométrie, écrit par l'éditeur)
  assets.gen.json  manifeste des images et sons (écrit par npm run assets)
  sources.json     d'où viennent les sources d'assets (facultatif, voir TOOLS.md)
  site.json        titre de la page, description, couleur, style graphique (voir plus bas)
```

`site.json` : `{ "lang": "fr", "title": "…", "shortName": "…", "description": "…", "themeColor": "#0a0a12",
"artStyle": "cel" }`. `title`, `description` et `themeColor` vont dans `index.html` et le manifeste PWA. `artStyle`
vaut `"cel"` (défaut : dessin animé peint) ou `"pixel"` (pixel art rétro) : il change les prompts d'images
(`npm run prompts`), le découpage (`tools/cut-sheet.py`) et `npm run assets` (WebP sans perte, redimensionnement au
plus proche voisin) ; voir [PROMPTS.md](PROMPTS.md). Pour `pixel`, mettre aussi `skin: { pixelArt: true }` dans `game.ts`.
`sheetBackground` (facultatif) est le fond sur lequel les planches de sprites sont générées : `"transparent"` ou une
couleur `"#RRGGBB"`, `#2B2E45` en son absence ; il change les prompts d'images, et le découpage suit la planche qu'on
lui donne (PROMPTS.md, « Choisir le fond des planches »).

## Un lieu, pas à pas

```ts
import { defineRoom } from '@engine/core/define';

export default defineRoom({
  id: 'maison',
  name: 'La maison de grand-mère',
  decor: 'decor/maison',          // image de fond (voir « Les images »)
  music: 'maison',

  // Accessoires : des images posées sur le décor, qui peuvent changer d'état.
  props: {
    lampe:    { name: 'lampe', states: { off: 'maison/r1c1', on: 'maison/r1c2' } },
    fauteuil: { name: 'fauteuil', states: { plein: 'maison/fauteuil_plein', vide: 'maison/fauteuil' } },
    table:    { img: 'maison/table_appoint', name: 'table d’appoint' },
    tabouret: { name: 'tabouret', states: { etagere: 'maison/r1c5', tire: 'maison/r1c6' } },
    talkie:   { name: 'talkie-walkie', img: 'items/r1c1', visible: { not: { has: 'talkie' } } },
  },

  // Personnages présents.
  actors: {
    grandmere: { char: 'grandmere', facing: 'left' },
    chat: { char: 'chat', pose: 'sleep', visible: '!chat_reveille' },
  },

  // Zones cliquables du décor lui-même (rien n'est dessiné, seul le rectangle compte).
  hotspots: {
    etagere: { name: 'étagère' },
    placard: { name: 'placard' },
    porte:   { name: 'porte du jardin' },
  },

  // Regarder. Une liste = une phrase différente à chaque fois, en boucle.
  look: {
    etagere: 'L’étagère. Trop haute sans marchepied.',
    placard: ['Un vieux placard.', 'Toujours un vieux placard.', 'Un jour, je regarderai ce qu’il y a dedans.'],
  },

  // Réactions écrites. Voir « Les réactions ».
  on: [
    { id: 'tirer.tabouret', verb: 'pull', a: 'tabouret', if: { prop: ['tabouret', 'etagere'] }, do: [
      { prop: ['tabouret', 'tire'] }, 'Et voilà. Un marchepied.',
    ] },
    { id: 'nouer.corde', verb: 'use', a: 'corde', b: ['crochet', 'seau'], do: [
      { lose: 'corde' }, { set: 'attache' },
      'Attachée. Un bout au crochet, l’autre au seau.',
      { id: 'maison.ouvrir-porte.l-fais-attention', say: ['grandmere', 'Fais attention avec ce seau, ma chérie.'] },   // l'id : traductions et clip de voix le suivent (UPGRADING §9)
    ] },
  ],

  // Sujets de conversation (2 ou 3). « Un câlin ? » et « Au revoir » sont ajoutés tout seuls.
  talk: {
    grandmere: [
      { id: 'demander.panier', topic: 'Grand-mère, c’est quoi dans le panier ?', do: [{ say: ['grandmere', 'Une surprise pour tout le monde.'] }] },
      { id: 'demander.marche', topic: 'Je peux aller au marché toute seule ?', do: [
        { say: ['grandmere', 'Toute seule ?! Avec ton écharpe, ton bonnet, ta gourde…'] },
        { say: ['grandmere', '… Bon. De retour à dix heures.'] },
      ] },
    ],
  },

  // Indices du talkie-walkie : le premier dont la condition `until` est encore fausse est donné.
  hints: [
    { until: { has: 'corde' }, lines: ['Khhh… le fauteuil… il avale tout.', 'Khhh… regarde… sur le côté du fauteuil.'] },
    { until: 'attache', lines: ['Khhh… une corde… ça s’attache.'] },
  ],

  // À chaque entrée dans le lieu.
  onEnter: [
    { once: [ 'Le salon. La base de toute aventure.' ], id: 'arrivee.premiere' },
  ],
});
```

## Les réactions

Une réaction dit : « quand on fait VERBE sur A (avec ou à B), si CONDITION, alors ces commandes ».

| Champ | Sens |
|---|---|
| `verb` | `give` Donner, `open` Ouvrir, `close` Fermer, `take` Prendre, `look` Regarder, `talk` Parler, `use` Utiliser, `push` Pousser, `pull` Tirer. Une liste accepte plusieurs verbes. |
| `a` | L'objet visé. Pour Utiliser/Donner avec deux termes, c'est l'objet du sac. Une liste = n'importe lequel. |
| `b` | La cible de « Utiliser A avec B » ou « Donner A à B ». Absent = action à un seul terme. |
| `if` | Condition facultative. La première règle dont la condition est vraie gagne : mets les cas particuliers d'abord. |
| `do` | Les commandes à jouer. |

Deux objets du sac se combinent dans les deux sens : une règle `a: 'moitie1', b: 'moitie2'` marche aussi pour « Utiliser moitié 2 avec moitié 1 ».
Les règles valables partout (combiner deux objets, par exemple) vont dans `rules.on` du jeu, pas dans un lieu.

### Quand rien n'est écrit

Le moteur cherche la réponse dans cet ordre, et s'arrête à la première trouvée :

1. une règle du lieu (`on`), puis une règle globale du jeu (`rules.on`) ;
2. Regarder : le texte de `look` du lieu, ou le `look` de l'objet si c'est un objet du sac ;
3. Parler : à l'objet d'indices (le talkie-walkie), ce sont les indices ; à un acteur qui a des sujets, c'est le menu de conversation ;
4. une réaction par sorte (`rules.kinds`), d'abord celles qui visent une cible précise (`target`), puis celles par sorte (`kind`) ;
5. Donner à un personnage : sa phrase de refus (`refuse` dans sa fiche) ;
6. une réponse de repli du verbe (`rules.fallbacks`), tirée au sort, jamais deux fois de suite la même.

Dans les textes de repli et de sorte, `{item}` est remplacé par le nom de l'objet, `{target}` par la cible, `{name}` par le nom de ce qu'on vise.
`{objet}`, `{cible}` et `{nom}` sont les trois mêmes sous leurs noms de la 4.0 : tout jeu écrit avec eux continue de
marcher, et le jeu d'exemple les utilise encore.

**`once`, quatre fois.** Le mot nomme une idée, un effet qui n'arrive qu'une fois par partie, sur quatre choses : la
commande `{ once: […], id }` n'exécute sa liste que la première fois ; `once: true` sur une option d'un `choice` ne la
montre qu'une fois ; `once: true` sur un écouteur (`events`) ne le déclenche qu'une fois ; un signal du monde extérieur
s'applique une fois par défaut (`once: false` le répète à chaque nouvelle livraison). Le moteur retient chacun dans
`GameState.seen` sous l'id stable de la chose.

```ts
// rules.ts
export const rules = {
  fallbacks: {
    look: ['Hmm. {objet}. Rien de suspect. Pour l’instant.'],
    take: ['C’est pas à moi.', 'Trop lourd. Même pour moi.'],
    use2: ['{objet} avec {cible} ? Ça ne marche pas. Mais c’était bien essayé.'],
    // … un tableau par verbe : give, open, close, take, look, talk, use, push, pull, use2
  },
  kinds: [
    { verb: 'pull', kind: 'chat', say: 'Non ! On ne tire jamais la queue d’un chat.' },
    { verb: 'take', target: 'grandmere', say: 'Grand-mère a déjà bien assez à porter.' },   // cible précise : prioritaire
    { verb: 'take', kind: 'person', say: 'Je ne peux pas porter {nom}. Par contre, {nom} peut me porter, moi.' },
    { verb: 'use', item: 'fromage_qui_pue', kind: 'person', say: 'Non. Même moi, je ne suis pas aussi méchante.' },
  ],
  on: [
    { verb: 'use', a: 'moitie_gauche', b: 'moitie_droite', do: [{ lose: 'moitie_gauche' }, { lose: 'moitie_droite' }, { gain: 'carte_postale' }] },
  ],
};
```

### Un double tap : le verbe que le joueur veut dire (4.0)

Un tap marche jusqu'à une chose ; un double tap agit dessus sans choisir de verbe : une sortie est franchie (son premier
verbe), un personnage reçoit la parole, tout le reste est regardé. Quand ce n'est pas le bon, la chose nomme le sien :
`hotspots: { cupboard: { name: 'placard', defaultVerb: 'open' } }` (aussi sur un accessoire, un acteur, une sortie). Un
objet pris dans le sac sans verbe est donné à un personnage et utilisé sur tout le reste ; la ligne de phrase dit lequel
avant le tap. Un verbe que le jeu n'a pas n'est jamais choisi (`src/engine/core/default-verb.ts`).

## Les commandes

Une commande seule, sous forme de texte, fait parler le héros : `'Et voilà. Un marchepied.'`.

### Parole

| Commande | Effet |
|---|---|
| `'texte'` | Le héros dit la phrase. |
| `{ say: ['grandmere', 'texte'] }` | Un personnage parle. `'hero'` désigne toujours le héros. Un personnage `offscreen` (narrateur, talkie-walkie) parle dans un cadre en haut de l'écran. |
| `{ say: ['grandmere', 'ATTENTION !'], shout: true }` | Un cri : plus gros, et le texte tremble. |

Une réplique reste à l'écran le temps de la lire, ou jusqu'à un tap.

### Déplacements et poses

| Commande | Effet |
|---|---|
| `{ walk: 'etagere' }` | Le héros marche jusqu'au point d'approche de l'étagère (défini dans le layout). |
| `{ walk: [300, 350], who: 'grandpere' }` | Grand-père marche jusqu'à ce point (n'importe quel acteur du lieu ; sans pose `walk`, il glisse dans sa pose actuelle). |
| `{ face: 'left' }`, `{ face: 'grandmere' }` | Se tourner vers la gauche, ou vers quelqu'un ou quelque chose. |
| `{ pose: ['chat', 'sleep'] }` | Pose durable (jusqu'à la prochaine). Poses du personnage : voir sa fiche `sprites`. |
| `{ anim: ['hero', 'use'], ms: 600 }` | Pose le temps indiqué, puis retour à la normale. Marche pour tout acteur du lieu, y compris un acteur en `pose: 'front'` : `{ anim: ['grandpere', 'surprise'], ms: 900 }` joue la pose `surprise` de sa fiche (`sprites: { …, surprise: ['grandpere_assis/r2c3'] }`), puis il revient en `front`. |
| `{ place: ['grandpere', [420, 360]], face: 'left' }` | Téléporte un personnage. |
| `{ launch: { target: 'vase', to: [420, 310], height: 60, rotate: 360, ms: 900 } }` | Physique de scène (3.4) : un vol balistique d'un accessoire ou d'un personnage depuis là où il est (ou `from`) jusqu'à `to`, un point ou une chose. Calculé, jamais simulé : le même vol sur tous les appareils. Un personnage reste où il atterrit ; un accessoire jusqu'à ce qu'on entre de nouveau dans le lieu : faites suivre ce que cela signifie (`{ hide: 'vase' }`, `{ prop: ['vase', 'casse'] }`). |
| `{ spring: { target: 'lampe', axis: 'rot', amplitude: 12, frequency: 3, damping: 0.25 } }` | Un balancement ou une secousse amortis autour de sa place (`axis` x, y ou rot). |
| `{ path: { target: 'chauve_souris', points: [[80, 120], [300, 60], [560, 140]], orient: true } }` | Le long d'une courbe lisse passant par les points, tourné selon elle. |
| `{ follow: { target: 'perroquet', leader: 'hero', offset: [10, -70], ms: 3000 } }` | Garde l'un à un décalage d'un autre pendant un temps. En mouvement réduit, chaque mouvement saute à sa fin. |
| `{ wait: 500 }` | Pause, en millisecondes. |
| `{ parallel: [[…], […]] }` | Joue plusieurs listes en même temps (ex. deux personnes qui marchent). |

### Le monde

| Commande | Effet |
|---|---|
| `{ prop: ['lampe', 'on'] }` | Change l'état d'un accessoire. `'lieu.accessoire'` vise un autre lieu. |
| `{ show: 'ghost', fade: 1200 }`, `{ hide: 'ghost', fade: 1500 }` | Fait apparaître ou disparaître un acteur ou un accessoire, avec fondu facultatif. |
| `{ gain: 'corde' }`, `{ lose: 'corde' }` | Ajoute ou retire un objet du sac. `gain` d'un objet marqué `used` le réactive. |
| `{ used: 'corde' }`, `{ used: ['corde', 'badge'] }` | L'objet a servi : il reste dans le sac, **grisé**, et ne peut plus être choisi pour Utiliser / Donner (Regarder marche toujours). Il redevient actif là où une règle du lieu ou du jeu le vise en `a` ou `b` et que sa condition `if` est vraie. Donc : garder la règle qui l'a consommé derrière un `if` (ex. `if: '!attache'`), sinon il reste actif dans ce lieu. Sauvegardé ; les anciennes sauvegardes se chargent sans. |
| `{ set: 'attache' }`, `{ set: ['essais', 3] }`, `{ unset: 'x' }`, `{ inc: 'essais' }` | Les flags : des cases à cocher et des compteurs, nommés comme tu veux. |
| `{ unlock: 'marche' }` | Débloque un lieu sur la carte. Un lieu verrouillé n'apparaît pas. |
| `{ goto: 'marche', at: 'porte' }` | Change de lieu (point d'entrée facultatif, défini dans le layout). |
| `{ map: true }` | Ouvre la carte. |
| `{ moveActor: ['grandpere', 'maison'], at?: 'porte' }` | Envoie un personnage dans un autre lieu : voir « Le monde vit » plus bas. |
| `{ emit: 'cloche' }` | Déclenche un événement : ses écouteurs s'exécutent ici même (voir « Le monde vit »). |

### Audio et effets

| Commande | Effet |
|---|---|
| `{ sfx: 'piece' }` | Bruitage. |
| `{ music: 'marche' }` | Change de musique (fondu enchaîné). |
| `{ music: { push: 'minigame' } }` puis `{ music: { pop: true } }` | Musique temporaire, puis retour à la précédente. |
| `{ music: { once: 'jingle' } }` | Joue un morceau une fois par-dessus, puis la musique reprend. |
| `{ music: { stinger: 'success' } }` | Une courte ponctuation (un morceau de `audio.music` ou un son de `audio.sfx`) sur le prochain temps de la partition qui joue (3.5) ; tout de suite avec un mix unique. |
| `{ toast: 'Nouveau lieu : Marché' }` | Petit message en haut de l'écran. |
| `{ shake: 400 }` | L'écran tremble. |

### Logique

| Commande | Effet |
|---|---|
| `{ if: COND, then: […], else: […] }` | Branchement. |
| `{ once: […] }` | Une seule fois dans toute la partie. |
| `{ nth: [[…1re fois], […2e fois], […ensuite]] }` | Selon le nombre de fois ; la dernière branche se répète. |
| `{ cycle: [[…], […]] }` | En boucle : 1, 2, 1, 2… (ex. un tourne-disque qui alterne deux morceaux). |
| `{ random: [[…], […]] }` | Au hasard, jamais deux fois de suite la même. |

### Séquences et écrans

| Commande | Effet |
|---|---|
| `{ cutscene: […] }` | Cinématique : bandes noires, bouton « Passer ». Passer joue la suite instantanément : les effets (objets, flags, états) sont bien appliqués. |
| `{ choice: [{ text, do, if?, once? }, …] }` | Le joueur choisit une réplique ; le héros la dit, puis `do` est joué. |
| `{ talk: 'grandmere' }` | Ouvre le menu de conversation d'un acteur depuis un script. |
| `{ minigame: 'pipes', params: { tiles: …, cols: 4 }, then: […] }` | Lance un mini-jeu. Un mini-jeu ne s'échoue jamais : `then` est toujours joué, même si on passe. Ses images viennent toutes des `params` (voir « Mini-jeux disponibles »). |
| `{ phone: 'grandmere', do: […] }` | Appel entrant : sonnerie (`skin.sounds.phone`), bouton Décrocher, puis les répliques de `do`. Pendant l'appel, le correspondant est affiché dans un cadre de téléphone (en bas à gauche), bouche animée quand il parle ; ses répliques s'affichent en haut. |
| `{ phone: ['lou', 'vendeuse'], do: […] }` | Appel à plusieurs : tous côte à côte dans le même cadre (le premier devant), chacun à sa taille (`height`). Chaque `{ say: ['lou', …] }` anime la bouche de la bonne personne. Pose affichée : la première de `skin.callPoses` qui existe (défaut `phone`, `front`, `face`, `idle`) ; bouches de `mouths.phone` (sinon la pose `phone_talk` alterne, sinon un petit rebond). Les ids sont des personnages de `characters` (pas besoin d'acteur dans le lieu). |
| `{ guide: { verb: 'look', target: 'etagere', say: 'Choisis Regarder, puis touche l’étagère.' } }` | Tutoriel : le héros donne la consigne, le verbe clignote, la cible scintille. Le script attend que le joueur fasse exactement cette action ; toute autre action fait répéter la consigne. |
| `{ hint: true }` | Donne l'indice courant (comme Parler au talkie-walkie). |
| `{ ending: true, after?: […] }` | La fin scellée (`GameDef.ending`) : ticket à gratter, confetti, puis `after`, puis la carte finale. `{ reveal: true }` est l'ancien nom, toujours accepté. |
| `{ end: true }` | Fin de partie. |

## Les conditions

| Condition | Vraie quand… |
|---|---|
| `'attache'` / `'!attache'` | le flag est vrai / faux ou absent. |
| `{ has: 'corde' }` | l'objet est dans le sac. |
| `{ flag: 'essais', eq: 3 }`, `{ flag: 'essais', gte: 2 }`, `{ flag: 'x', lt: 5 }` | comparaison d'un flag. |
| `{ not: … }`, `{ all: [ … ] }`, `{ any: [ … ] }` | non, et, ou. |
| `{ visited: 'marche' }`, `{ room: 'marche' }` | on est déjà allé au marché / on y est. |
| `{ prop: ['lampe', 'on'] }`, `{ prop: ['maison.lampe', 'on'] }` | l'accessoire est dans cet état (dans le lieu courant, ou `'lieu.accessoire'`). |
| `{ unlocked: 'marche' }` | le lieu est débloqué sur la carte. |
| `{ seen: 'maison.grandmere.0' }` | le sujet n° 0 de Grand-mère à la maison a déjà été entendu. |
| `{ actorIn: ['grandpere', 'maison'] }` | le personnage mobile est dans ce lieu (voir « Le monde vit »). |

## Quand le DSL ne suffit pas

Un jeu peut définir ses propres commandes en code, dans `games/<id>/index.ts` :

```ts
export const commands: CustomCommands = {
  sparkle: { pure: true, run: async ({ scene, args }) => { /* des étoiles sur `scene` pendant args.ms */ } },
  explose: { effects: [{ set: 'poulet_explose' }, { lose: 'poulet' }, { sfx: 'boum' }], run: ({ scene }) => { /* le souffle */ } },
};
// dans un script :  { custom: 'sparkle', args: { ms: 1200 } }
```

`effects` dit ce que la commande fait au jeu, en commandes ordinaires : elles s'exécutent d'abord, dans le navigateur
**et** dans le solveur, donc une commande custom ne casse jamais `npm run solve` ni la sauvegarde. `run` est la partie
visuelle, navigateur seulement (elle reçoit l'élément de la scène, le presenter, l'état en lecture, les arguments). Une
commande qui ne change rien dit `pure: true`. Le validateur refuse une commande qui ne déclare ni l'un ni l'autre.
`run` ne doit pas toucher l'état : en mode dev le moteur compare l'état avant et après, et signale dans le journal un
`run` qui a changé quelque chose hors de `effects` (le solveur, les sauvegardes et le replay ne connaissent que
`effects`).

## Traductions

Le contenu reste écrit dans une langue (`lang: 'fr'` dans `game.ts`). Traduire, c'est une table, pas des clés dans le contenu :

```bash
npm run i18n -- extract              # games/<id>/locales/fr.json : chaque texte avec son chemin (la référence)
npm run i18n -- extract --lang en    # locales/en.json : garde ce qui est traduit, suit les textes déplacés, ajoute les manquants
npm run i18n -- status               # couverture de chaque langue, chemins obsolètes, lignes longues
```

Un chemin ressemble à `room:maison/look.garde_manger[1]`, `item:cle/name`, `char:grandmere/refuse`, `ui/newGame`,
`rules/fallbacks.look[2]`, `start/intro[0].say` ; une ligne avec un id est indexée par lui (`room:house/look.pantry.<id>`,
`rules/fallbacks.look.<id>` : les listes acceptent des lignes `{ id, text }`, UPGRADING §10) ; le fichier est
`{ "<chemin>": "<texte>" }`. Le jeu embarque les
fichiers qu'il a (`locales` dans `index.ts` les ramasse) ; le joueur a `?lang=en`, son choix dans Réglages
(`ui.language`), ou la langue de son navigateur quand la traduction existe. Les textes absents d'un fichier restent
comme écrits. `npm run validate -- --report` et l'onglet Check du Studio montrent la couverture.

Les chemins suivent la structure, donc un refactor les déplace : `extract --lang en` s'en sort. Il compare le jeu au
fichier de référence (`locales/fr.json`, rafraîchi en même temps) : un texte déplacé (une liste réordonnée, une règle
remontée) garde sa traduction parce que son texte source est le même ; un texte disparu est garé sous `_stale:<ancien
chemin>` (ignoré en jeu, listé par `status`, à supprimer à la main quand on est sûr) et revient avec sa traduction si le
chemin réapparaît ; un texte dont la source a changé est proposé à nouveau à traduire. Règle simple : lancer `extract
--lang xx` après chaque refactor, avant de traduire du neuf, et commiter le fichier de référence avec les traductions.

## Tes propres mini-jeux

Le moteur fournit pipes, cables, pick, hide, runner, stroke et scratch. Un jeu ajoute les siens (`minigames` dans
`index.ts`) : un objet `{ run(ctx): Promise<void>; required?: string[] }` où `ctx` donne l'élément de superposition,
l'échelle, les images, les sons, les `params` de la commande et un signal d'annulation ; `required` nomme les params que
le validateur vérifie. `{ minigame: 'duel', params: { … }, then: [ … ] }` le joue ensuite comme un mini-jeu intégré.
Voir `src/engine/minigames/types.ts`.

## Plusieurs personnages jouables

```ts
hero: 'bernard',
players: { ids: ['bernard', 'hoagie', 'laverne'], start: { hoagie: { room: 'labo_passe' }, laverne: { room: 'labo_futur' } },
  give: 'Tiens, {nom} : {objet}.' },
```

Chaque personnage jouable a son lieu, sa position et son sac (`sharedInventory: true` pour un sac commun). Le héros
est celui contrôlé en premier. Un bouton par autre personnage se trouve dans la rangée d'outils (son portrait, ou son
initiale) : le toucher, c'est `{ switchPlayer: 'hoagie' }`, la vue passe dans son lieu. Un personnage inactif présent
dans le lieu est dessiné et on peut lui **donner** un objet : il va dans son sac (`{ transfer: ['hamster', 'laverne'] }`
fait pareil depuis un script). La condition `{ player: 'laverne' }` dit qui agit ; `'hero'` dans les commandes désigne
toujours l'actif. Si un lieu déclare un acteur pour un personnage jouable, cet acteur le représente quand il est inactif
(poses, sujets de conversation) ; il n'est pas dessiné deux fois. Les checkpoints acceptent `active` et
`players: { id: { room, inventory } }`. Le solveur change de personnage comme le joueur (« Switch to hoagie » dans son chemin).

## Mise en scène : lieux larges, animations, voix, réglages

### Lieux larges et caméra

Un lieu fait 640 × 400 unités logiques. Donne à son layout une `width` (ex. 960, 1280 : dossier « Room width » de
l'éditeur, ou `layout/<lieu>.json`) et peins son décor aussi large (800 px de haut, la largeur en proportion ;
`npm run assets` la garde) : le lieu défile, et la **caméra** suit le héros. Les positions restent des coordonnées du
monde (un accessoire à x 900 est dans la partie droite). Des commandes déplacent la caméra :

| Commande | Effet |
|---|---|
| `{ camera: { to: 'etals_lointains', ms: 900 } }` | Panoramique pour centrer quelque chose (acteur, accessoire, zone), puis reste là. |
| `{ camera: { pan: 320, ms: 600 } }` | Panoramique vers un bord gauche, en unités logiques (borné au lieu). |
| `{ camera: 'follow' }` (ou `'reset'`) | Suivre à nouveau le héros. Entrer dans un lieu suit toujours le héros. |

La caméra est dans l'état (une sauvegarde la restitue), le solveur l'ignore, et « réduire les animations » rend chaque
panoramique instantané.

### Animations d'accessoires et événements de frame

```ts
props: {
  garde_manger: { name: 'garde-manger', states: { ferme: 'home/r1c3', ouvert: 'home/r1c4' }, initial: 'ferme',
    anims: { secoue: { frames: ['home/r1c4', 'home/r1c3', 'home/r1c4', 'home/r1c3'], fps: 12, at: { 1: [{ sfx: 'loquet' }] } },
             halo: { frames: ['home/g1', 'home/g2'], fps: 4, loop: true } } },
},
on: [{ verb: 'open', a: 'garde_manger', do: [{ play: ['garde_manger', 'secoue'] }, 'Fermé.'] }],
```

`{ play: [accessoire, nom] }` montre les images l'une après l'autre à `fps` et **exécute les commandes de `at` quand
cette image est atteinte** (un son sur la bonne image, un flag, une réplique), puis l'accessoire reprend l'image de son
état. Une animation `loop` tourne toute seule jusqu'à `{ stopAnim: accessoire }` ; son `at` ne joue que des sons et des
secousses (`sfx`, `shake`), à chaque tour de boucle : une machine qui claque à l'image 4, c'est
`glow: { frames: […], loop: true, at: { 4: [{ sfx: 'clank' }] } }`, et le validateur y refuse un flag ou une réplique (la
boucle ne finit jamais). Les poses des
personnages ont la même chose : `{ anim: ['hero', 'saut'], ms: 600, at: { 2: [{ sfx: 'boum' }] } }` exécute les
commandes quand la pose atteint cette image, au `fps` du personnage.

### Voix

```ts
audio: { voices: { grandmere_01: 'grandmere-01.mp3' } },   // fichiers dans games/<id>/audio/voice/
{ say: ['grandmere', 'Pixel ! Mauvaise nouvelle.'], voice: 'grandmere_01' }
```

La réplique reste à l'écran tant que le clip joue (un tap la passe toujours) ; sans clip, le temps de lecture
s'applique. Le volume des voix est un réglage à part, et la musique s'efface pendant qu'on parle. Une ligne qui a un id
stable joue le clip rangé sous cet id (`audio.voices[id]`) ; les autres langues ont leurs propres clips,
`audio.voicesByLang: { fr: { <id de ligne>: 'fr/…mp3' } }`, choisis avec la langue. Production : `npm run voices`
(TOOLS). Un son qui compte reçoit un sous-titre, montré par écrit avec le réglage des sous-titres (actif par défaut,
proposé dans les réglages seulement quand le jeu sous-titre quelque chose) et traduit comme toute ligne :
`{ sfx: 'porte_claque', caption: '[Une porte claque à l\'étage]' }`.

### Réglages

`settings: true` ajoute une entrée Réglages au menu pause : vitesse du texte (lent / normal / rapide), taille du texte
(normal / grand), réduire les animations (pas de tremblement, caméra et fondus instantanés), une police lisible quand le
jeu en fournit une (`skin.fonts.readable`), volumes musique / sons / voix. Les préférences restent dans le navigateur,
hors sauvegarde. Textes : `ui.settings`, `ui.textSpeed`, `ui.textSize`, `ui.reduceMotion`, `ui.readableFont`,
`ui.volumeMusic`, `ui.volumeSfx`, `ui.volumeVoice`, `ui.slow`, `ui.normal`, `ui.fast`, `ui.large` (défauts anglais si absents).

## La scène (3.4) : calques, masques, lumières, particules, sols

Un lieu peut montrer plus que son décor. Le contenu dit ce qui existe et quand (`stage` dans le lieu) ; le layout dit
où (écrit par les éditeurs du Studio) ; le peintre le dessine. Rien sur la scène n'est un état du jeu : un calque, une
lumière ou une particule ne change jamais ce que voit le solveur (tests/stage.test.ts prouve la démo avec une scène sur
chaque lieu : mêmes états).

```ts
stage: {
  layers: [
    { id: 'ciel', image: 'quai/ciel', role: 'backdrop' },               // derrière tout (sinon `decor` est le fond)
    { id: 'comptoir', image: 'quai/comptoir', role: 'scenery' },        // parmi les personnages, selon le `z` du layout
    { id: 'lanterne', image: 'quai/lanterne', role: 'foreground', visible: 'lanterne_allumee' },  // devant tout le monde
    { id: 'brume', image: 'quai/brume', role: 'effect' },               // au-dessus de tout
  ],
  lights: [{ id: 'lampe', kind: 'radial', color: '#ffd28a', intensity: 0.7, visible: 'lanterne_allumee' }],
  emitters: [{ id: 'embruns', kind: 'rain', rate: 40 }],
  transition: 'fade',                                                    // cut (défaut), fade, wipe
  links: { escalier: { if: 'grille_ouverte', locked: 'La grille est fermée.' } }, // la logique d'un lien de marche
},
```

Dans le layout : `layers.<id> { x, y, z, parallax: [x, y], blend, opacity }`, `occluders.<id> { polygon | mask | layer,
z, feather?, invert? }` (ce qui cache un personnage plus profond que `z` : un pilier, un comptoir, un cadre de fenêtre),
`walkZones.<id> { area, holes?, scale?, zoom? }` (plusieurs sols ; elles remplacent `walk`), `walkLinks.<id> { from: {
zone, at }, to: { zone, at }, mode: walk | stairs | ladder | jump | teleport, ms?, facing?, oneWay? }`,
`lights.<id> { at, radius }`, `emitters.<id> { area }`. Un lien fermé ne se marche pas : le héros va jusqu'à son pied,
dit sa ligne `locked`, et l'action continue de là ; les règles de ce qui se trouve derrière doivent donc vérifier la
même condition (`npm run lint` avertit, `walk-link-gate`) : l'énigme est la règle, le lien ne fait qu'arrêter la
marche. Chaque zone met les personnages à l'échelle selon sa propre ligne de profondeur (`scale`) et peut zoomer la
caméra (`zoom`, de 1 à 2 : un balcon vu de plus près) ; une caméra zoomée monte et descend aussi pour garder le héros
en vue. `renderer: 'canvas'` (sur le lieu ou le jeu) choisit le
peintre Canvas : masques d'image ou de calque, lumières, particules et modes de fusion ne sont dessinés que par lui
(`npm run validate` le dit sur un lieu peint en DOM). Un ancien lieu est une scène d'un fond (`decor`) et d'une zone
(`walk`, nommée `main`) : rien à réécrire.

## Sorties, chapitres, sauvegardes

### Les sorties déclarées

Une sortie peut s'écrire comme un hotspot plus une règle avec `goto`. La déclarer est plus court, et donne aux outils la
carte du monde :

```ts
exits: {
  fenetre: { name: 'fenêtre du jardin', to: 'jardin', entry: 'maison', if: { unlocked: 'jardin' },
    locked: 'Pas encore. D’abord, la clé.', sfx: 'porte', verbs: ['use', 'open', 'push'] },
  trappe: { name: 'trappe', to: 'cave', oneWay: true },
},
```

Le moteur transforme chaque sortie en un hotspot du même id (kind `exit`, placé dans le layout comme toute zone, avec
sa ligne dans `look`) et en règles ajoutées à la fin de `on` : « VERBE sortie → goto » quand `if` tient, puis la ligne
`locked`. Tes propres règles sur la sortie passent avant, donc une réaction spéciale (un objet utilisé sur la porte)
gagne toujours. `verbs` vaut par défaut use, open, walk, go, enter, push, pull (ceux que ton jeu a). À partir des sorties,
des commandes `goto` et de la carte, le validateur sait **quels lieux ne sont atteints par rien** et **quelles sorties
n'ont pas de retour** (indique `oneWay: true` quand c'est voulu) ; l'onglet Check du Studio et `npm run page:world`
dessinent cette carte.

### Chapitres et invariants

Un checkpoint avec `goals` est la fin d'un chapitre. `npm run solve -- --chapters` prouve chaque chapitre séparément,
depuis le checkpoint précédent (ou une nouvelle partie) jusqu'à ce que ses objectifs tiennent, puis du dernier
checkpoint à la fin : un jeu long se vérifie en petites recherches bornées, et un chapitre cassé est nommé.

```ts
checkpoints: {
  jardin: { room: 'jardin', inventory: ['jeton'], goals: [{ has: 'jeton' }] },
  marche: { room: 'marche', …, goals: ['cuve_videe', { unlocked: 'marche' }] },
},
// Ne doit jamais devenir vrai (le solveur donne le chemin qui le rend vrai) :
invariants: [{ all: [{ not: { has: 'jeton' } }, '!fleurs_faites'] }],
```

### Objectifs et journal de quêtes (4.1.12)

`objectives` nomme ce que le joueur doit faire, pour la liste **Objectifs** du menu pause (une étape sous son parent,
✓ fait, ○ ouvert, un objectif secondaire en italique), pour le journal sémantique (`objectiveCompleted`, une fois, la
première fois que `done` est vrai après une action) et pour le solveur : `npm run solve -- --goal=100%` cherche un
état où chaque objectif non `optional` est vrai. Écrivez `done` comme une condition qui reste vraie une fois vraie
(un drapeau levé une fois, un objet gardé) : le journal ne reprend jamais un objectif accompli, mais une partie
chargée plus tard ne compte comme faits que ceux qui sont vrais à ce moment.

```ts
objectives: {
  cle: { title: 'Trouver la clé du garde-manger', done: { any: [{ has: 'cle' }, 'garde_manger_ouvert'] } },
  cuve: { title: 'Vider la citerne', done: 'cuve_videe', parent: 'cle' },
  garde_manger: { title: 'Ouvrir le garde-manger', done: 'garde_manger_ouvert' },
  pari: { title: 'Deviner ce qu’il y a dedans', done: 'pari', optional: true },
},
```

`npm run validate` refuse un objectif dont `done` ne peut jamais être vrai (un drapeau que rien ne lève, un objet que
rien ne donne), un `parent` inconnu et un cycle de parents. Les titres se traduisent comme tout texte
(`objectives/<id>.title`), et la ligne du menu est `ui.objectives`. L'onglet **Language** du Studio les édite ; le
`set_value` de MCP les écrit avec `id: "@game"`. Chaque condition et chaque commande, avec sa forme, est dans la
référence générée (`docs/fr/DSL.md`).

`speedrun` (4.1.14) déclare des catégories et des splits de speedrun dans le contenu : des déclencheurs sur les
événements sémantiques (un lieu atteint, un objet acquis, un objectif accompli, la fin), les règles de chaque
catégorie (sauvegardes, pauses, indices, rechargements, Reality, les composants d'empreinte qu'un run doit égaler, les
entrées), la version des règles. `npm run validate` le vérifie ; `docs/fr/SPEEDRUN.md` est le guide.

### Emplacements de sauvegarde et migrations

```ts
saves: { slots: 3 },   // le menu pause gagne Sauver / Charger avec trois emplacements, plus export et import en fichier JSON
ui: { …, save: 'Sauver', load: 'Charger', slot: 'Emplacement {n}', emptySlot: 'vide', exportSave: 'Exporter en fichier', importSave: 'Importer un fichier', confirmOverwrite: 'Écraser cet emplacement ?' },
```

Les emplacements manuels sont stockés comme l'autosauvegarde : dans IndexedDB, en enveloppes, relus après chaque
écriture ; un fichier importé depuis le menu remplit aussi le premier emplacement libre. L'autosauvegarde utilise une enveloppe v3 validée avant de toucher à la partie courante, avec une écriture IndexedDB
relue et un import de compatibilité localStorage. Quand le contenu change de façon incompatible, on incrémente
`saveVersion` et on convertit l'état, en données, une étape par version :

```ts
saveVersion: 3,
migrations: [
  { from: 1, renameFlag: { trouve: 'cle_trouvee' }, renameItem: { cle: 'key' } },
  { from: 2, renameRoom: { entree: 'hall' }, renameProp: { 'hall.lampe': 'hall.lanterne' }, dropFlag: ['tmp'] },
],
```

La migration couvre aussi compteurs, ids vus, scripts, étapes de script nommées, joueurs et personnages ; voir le type
`Migration` complet. La chaîne doit atteindre `saveVersion` ; une sauvegarde sans chemin repart toujours de zéro. Les
références facultatives périmées restantes sont élaguées avec un avertissement visible ; une corruption structurelle,
un autre jeu, un lieu courant absent ou un joueur actif inconnu est refusé sans toucher à la session courante.

## Le monde vit : scripts, événements, personnages mobiles

Tout ce qui précède réagit au joueur : un tap, une règle, ses commandes. Trois primitives permettent au monde d'agir
tout seul. Ce sont des données comme le reste : `validate`, `solve` et la sauvegarde les comprennent.

### Les scripts : ce qui se passe sans tap

Un script est une liste de commandes qui tourne toute seule, **une commande à la fois, dans les creux entre les actions
du joueur** : jamais pendant une action, une cinématique, une conversation ou un mini-jeu. Le moteur le reprend au creux
suivant. Les scripts d'un lieu tournent tant que le joueur y est ; ceux du jeu (`scripts` dans `game.ts`) partout.

```ts
scripts: [
  // Biscuit s'étire toutes les sept secondes, pour toujours.
  { id: 'biscuit_naps', loop: true, do: [{ wait: 7000 }, { anim: ['biscuit', 'stretch'], ms: 1200 }] },
  // Lou fait les cent pas entre deux points tant que l'affaire n'est pas conclue ; quand `while` devient faux, le script revient au début et attend.
  { id: 'lou_paces', loop: true, while: '!bouquet_given', do: [
    { wait: 6000 }, { walk: [235, 262], who: 'neighbor' }, { wait: 3000 }, { walk: [147, 278], who: 'neighbor' },
  ] },
  // Une fois : le cuisinier arrive quand le gong sonne, puis le script est terminé.
  { id: 'cook_comes', do: [{ waitEvent: 'gong' }, { moveActor: ['cook', 'hall'] }, { say: ['cook', 'À table !'] }] },
],
```

| Champ ou commande | Effet |
|---|---|
| `id` | Unique dans tout le jeu (on peut attendre un script depuis n'importe où). |
| `loop: true` | Recommence du début une fois fini. Une boucle doit contenir un `wait`, `waitUntil` ou `waitEvent`. |
| `while: COND` | Ne tourne que tant que la condition tient ; quand elle devient fausse, le script revient à sa première commande et attend. Elle est vérifiée avant chaque commande : un script qui `lose` l'objet dont son `while` a besoin s'arrête là (donner le nouvel objet d'abord, retirer l'ancien ensuite). |
| `{ wait: 3000 }` | Une pause : le joueur continue de jouer pendant ce temps. |
| `{ waitUntil: COND }` | Attend que la condition soit vraie (vérifiée à chaque creux). |
| `{ waitEvent: 'gong' }` | Attend que l'événement soit émis, même depuis un autre lieu. |
| `{ startScript: 'id' }`, `{ stopScript: 'id' }` | Depuis un script ou une règle : relance un script du début (même fini ou arrêté), ou l'arrête. |

La position d'un script est sauvegardée avec la partie : il reprend où il en était. Comme ses commandes s'intercalent
avec les actions du joueur à l'échelle d'une commande entière, garde chaque commande courte (un `walk`, une réplique,
une pose), et mets une séquence qui ne doit pas être interrompue dans une `cutscene`. Le joueur ne peut pas passer un script.

### Les événements : « il vient de se passer quelque chose »

Un flag est un état (la porte *est* ouverte). Un événement est un instant (la cloche *vient de* sonner).
`{ emit: 'cloche' }` exécute, ici même et dans l'ordre, les écouteurs du lieu courant, puis ceux du jeu :

```ts
// marche.ts, dans une règle :  { gain: 'cle' }, { emit: 'key_found' }
// game.ts :
events: [
  { on: 'key_found', once: true, do: [{ moveActor: ['grandpa', 'house'] }, { toast: 'Grand-père est rentré.' }] },
],
```

`if` et `once` marchent comme sur une règle. Un événement n'est pas mémorisé : pour réagir plus tard (à la prochaine
entrée dans un lieu), pose un flag dans l'écouteur et teste-le dans `onEnter`. Un script en pause sur `waitEvent` pour
cet événement avance, où qu'il soit.

### Les personnages mobiles

Un personnage déclaré comme acteur dans plusieurs lieux s'affiche normalement dans tous (Grand-mère dans la cuisine
*et* au jardin). Donne-lui un lieu de départ, et seul son acteur de ce lieu s'affiche ; `moveActor` l'envoie ailleurs :

```ts
// cast.ts
grandpa: { name: 'Grand-père', room: 'garden', … },
// house.ts et garden.ts déclarent tous deux   actors: { grandpa: { char: 'grandpa' } }   et le placent dans leur layout.
// n'importe où :  { moveActor: ['grandpa', 'house'] }            à sa position du layout de la maison
//                 { moveActor: ['grandpa', 'house'], at: 'door' } à ce point d'entrée (ou un point) de la maison
// conditions : { actorIn: ['grandpa', 'house'] }
```

Le personnage disparaît du lieu qu'il quitte et apparaît dans celui qu'il rejoint, à l'écran si le joueur y est.
Un checkpoint avec `goals` doit être un état que le jeu atteint vraiment quand ces objectifs tiennent : `npm run solve --
--prove --chapters` prouve chaque chapitre depuis chaque état frontière atteignable et signale un checkpoint qui n'en
égale aucun, avec les dimensions qui diffèrent (`room: house vs market`). `used`, `seen` et `players[].used` laissent
un checkpoint nommer ce qu'une vraie partie laisse derrière elle (un objet déjà utilisé, un écouteur `once` déjà déclenché).
Les `checkpoints` acceptent `where: { grandpa: 'house' }` pour démarrer avec un personnage ailleurs que dans son lieu
de départ. Le validateur refuse un `moveActor` vers un lieu où le personnage n'est pas acteur, ou pour un personnage sans `room`.

## Personnages, objets, carte

```ts
characters: {
  grandmere: {
    name: 'Grand-mère', color: '#f0c040', height: 124, kind: ['person'],
    portrait: 'grandmere/r1c2',
    sprites: { idle: ['grandmere/r3c3'], talk: ['grandmere/r3c4', 'grandmere/r3c3'], walk: ['grandmere/r2c1', 'grandmere/r2c2', …] },
    refuse: 'C’est gentil, ma chérie. Mais garde-le, tu en auras besoin pour ta course.',
    hug: 'Toujours. Même avec un panier dans les bras.',
  },
  talkie: { name: 'le talkie-walkie', color: '#ff6fb5', offscreen: true },      // parle dans un cadre, sans corps
},
items: {
  corde: { name: 'corde', icon: 'items/r1c2', look: 'Une longueur de corde. Un bout pour le crochet, un bout pour le seau.' },
},
map: {
  start: 'monde',
  regions: { monde: { name: 'Monde', image: 'decor/carte' }, ville: { name: 'Ville', image: 'decor/carte_ville', parent: 'monde' } },
  places: {
    marche: { name: 'Marché', room: 'marche', region: 'ville', pos: [61, 41], portrait: 'vendeuse/r1c2', vehicle: 'car', news: '!marche_fini' },
  },
},
```

### Parole : seule la bouche bouge

Un personnage qui a une planche de parole déclare ses bouches par pose. Pendant une réplique, le corps ne change pas :
les images de bouche ouverte défilent au hasard (160 à 220 ms), un clignement passe de temps en temps au repos.
L'image « bouche fermée » remplace l'image de repos de la pose, donc repos et parole viennent du même dessin.

```ts
import { human, mouths } from './cast';
grandpere: { …, mouths: mouths('talk_grandpere', { idle: 'profil', front: 'face', assis: 'assis' }) },
```

`mouths(dossier, { pose: ligne })` lit `talk_<perso>/<ligne>/t1…t6` (t1 fermée, t2 à t4 ouvertes, t5 clignement, t6 sourire).
Sans bouches pour une pose, le personnage garde la même image et rebondit d'un pixel en parlant ; une longue réplique commence par un geste (`talk`) joué une fois.

### Variantes selon l'état

```ts
import { cat } from './cast';
hero: { …, sprites: cat('hero'), variants: [{ if: { has: 'seau' }, sprites: cat('hero_seau'), mouths: … }] },
```

La première variante dont la condition est vraie remplace `sprites`, `mouths` et `portrait`. Le changement se voit tout de suite (ex. dès qu'on prend le seau).

### Changement de palette (`palette`, aussi sur les variantes)

Une planche, plusieurs apparences : `palette` associe des couleurs sources à des couleurs cibles, toutes en `#rrggbb`.
La vue du lieu recolore une fois chaque image de pose et de bouche du personnage, dans un canevas hors écran (en cache,
transparence gardée). La `palette` d'une variante remplace celle du personnage tant que sa condition tient (une
variante sans palette garde celle du personnage).

```ts
biscuit: { …, sprites: cat('cat'),
  palette: { '#2c1818': '#7a3416', '#492a25': '#b0592a', '#543329': '#c4703a' }, paletteTolerance: 14,
  variants: [{ if: 'boueux', palette: { '#492a25': '#5a4a3a' } }] },
```

Par défaut, seules les couleurs RVB exactes changent : cela convient au style `pixel`, dont le découpage donne une
valeur exacte par matière. Les planches peintes (`cel`) et le WebP avec perte ont beaucoup de tons voisins :
`paletteTolerance` (une distance RVB, 10 à 16 pour commencer, sous la distance à la couleur du contour) recolore tout
pixel proche d'une couleur source en gardant son écart. Prendre les couleurs sources dans le PNG découpé (les couleurs
opaques les plus fréquentes d'une case). Biscuit, dans la démo, devient ainsi un chat roux tigré. Les portraits des
menus et des appels ne sont pas recolorés. `npm run validate` signale une clé ou une valeur qui n'est pas en `#rrggbb`.

### Choses à plusieurs états (une mouette qui regarde / gobe, un vieux chien qui dort / boude / bâille, l'œil d'un chat qui brille sur un écran)

Un hotspot n'a qu'un nom et qu'une zone. Pour une chose dessinée qui change, utiliser un **accessoire à états** :
`props: { mouette: { name: 'mouette', states: { regarde: 'obj_jardin/r2c4', gobe: 'obj_jardin/r2c5' }, initial: 'regarde' } }`,
positions par état dans le layout (`props.mouette.states.gobe`), la zone touchable suit l'image. On change d'état par `{ prop: ['mouette', 'gobe'] }`
et on réagit selon l'état avec `if: { prop: ['mouette', 'gobe'] }`. Pour une zone du décor qui change de nom ou de forme,
deux hotspots aux `visible` opposés (`visible: 'x'` / `visible: '!x'`), chacun sa zone ; une règle peut viser les deux (`a: ['h1', 'h2']`).

### Présence sans interaction

`actors: { ghost: { char: 'ghost', interactive: false, visible: 'ghost_seen' } }` : visible, mais ni cliquable ni nommée.
À combiner avec `{ show: 'ghost', fade: 1500 }` / `{ hide: 'ghost', fade: 1500 }` et `glow` dans la fiche du personnage.

Poses d'un personnage, par convention : `idle`, `talk`, `walk` (profil, vers la droite ; le moteur retourne l'image pour la gauche),
`walk_front`, `walk_back`, `point`, `use`, plus toutes les poses spéciales que tu veux (`sleep`, `sit`, `celebrate`…).
Une pose est une liste d'images jouée en boucle. Une pose absente retombe sur `idle`.

## L'habillage (`skin`)

Tout ce que le moteur affiche ou joue sans que le contenu le cite. Ids d'images du manifeste ; les sons sont des ids de `audio.sfx`
(`phone`, `plane`, `confetti`) ou de `audio.music` (`jingle`, `end`). Un son absent = silence. `npm run validate` vérifie chaque id.

```ts
skin: {
  icons: {
    map: 'ui/r1c5', pause: 'ui/r3c5', music: 'ui/r3c6',   // obligatoires : les trois boutons de la colonne
    spark: 'ui/r3c4',                                        // étincelle du tutoriel guidé
    pin: 'ui/r1c6', news: 'ui/r2c4', plane: 'ui/r2c1', car: 'ui/r2c2',   // carte (map.vehicles les remplace s'ils y sont)
    confetti: ['ui/r4c1', 'ui/r4c2'], cardFallback: 'items/r3c6',      // fin scellée
  },
  sounds: { phone: 'phone', plane: 'plane', confetti: 'confetti', jingle: 'jingle', end: 'end' },
  fonts: { ui: 'DotGothic16', pixel: 'Press Start 2P' },   // familles CSS → variables --font-ui et --font-pixel
  heights: { actor: 110, hero: 84 },                       // hauteur d'un personnage sans `height`
  callPoses: ['phone', 'telephone', 'front', 'face', 'idle'],   // poses essayées pour le cadre d'un appel
  pixelArt: false,                                         // true : les images agrandies gardent des bords nets (artStyle "pixel")
},
```

Les textes d'interface sont dans `ui` (dont `tapToContinue`, « ▼ toucher pour continuer », et `ok`, le bouton du mot de passe). Les
clés que le moteur affiche lui-même ont une **valeur anglaise par défaut** quand le jeu les omet (`src/engine/dom/ui-defaults.ts`) :
`verbs` (le libellé ARIA de la barre des verbes), `saveFailed`, `saveAdjusted`, `updateAvailable`, `updateNow`, `advance`, `jump`,
`duck`, `offlineStatus`, `offlineComplete`, `offlineRetry`, `save`, `load`, `slot`, `emptySlot`, `confirmOverwrite`,
`exportSave`, `importSave`, `exportSession`, `shareSession`, `settings`, `textSpeed`, `textSize`, `slow`, `normal`,
`fast`, `large`, `reduceMotion`, `readableFont`, `language`, `volumeMusic`, `volumeSfx`, `volumeVoice`, et depuis 4.1.14
`speedrun`, `exportRun`, `abandonRun` (les lignes speedrun du menu pause). Un jeu dans une
autre langue les fournit toutes : `npm run i18n -- status` liste les clés laissées aux valeurs par défaut, et
`npm run e2e -- --lang <xx>` échoue dès que l'une d'elles est visible.

## Le layout (écrit par l'éditeur, à ne pas taper à la main)

Champs lus par le moteur, en plus des positions : sur un accessoire (et dans chacun de ses `states`) `rot` (degrés, sens horaire, pivot aux pieds),
`flip` (miroir horizontal), `flipV` (miroir vertical, l'image passe sous la ligne des pieds, comme dans la page de placement), `z` (couche forcée) ;
un champ absent d'un état reprend celui de l'accessoire. Sur un acteur : `z` force sa couche (sinon, celle de ses pieds).
Sur le lieu : `floor` (défaut 395) est le bas du sol ; un point d'approche calculé ne descend pas plus bas.

## Écran titre et générique

`titleScreen: { decor, video, logo, music, footer }` : la vidéo (fichier `games/<jeu>/art/decor/decor_<nom>.mp4`, réencodé par `npm run assets`) tourne en boucle, muette, derrière le logo ; le décor sert d'affiche.
`creditsScreen: { video, decor }` : fond du générique (par défaut, la vidéo du titre). `credits: [lignes…]` : le texte.

## Les images

Après la première visite, le jeu met en cache chaque image et chaque son pour jouer hors ligne (`offline: 'full'`, le
défaut ; `'nearby'` ne garde que le lieu courant et ses voisins) ; `assetBudgets` dimensionne les lots. Un jeu de 40 Mo
pèse 40 Mo sur le téléphone.
`assetBudgets.initialKB`, `roomKB` et `chapterKB` disent combien le jeu peut demander à un téléphone de télécharger
avant que le premier lieu soit jouable, par lieu et par chapitre. Avec une partition, `backgroundScoreKB` (ses stems),
`decodedAudioMB` (décodée), et pour tout jeu `offlineTotalKB` (le préchargement complet) tiennent le reste (3.6) ; avec
des transitions, `transitionPeakMB` (deux partitions, un pont et un stinger décodés à la fois, 3.6.1) ; `initialJsKB`
le JavaScript d'une première visite (3.9, vérifié sur le build par `npm run verify:dist`).
`npm run weight` les vérifie, et une release les exige (docs/fr/TOOLS.md).

Une image se désigne par `dossier/nom`, le chemin du fichier découpé dans `games/<jeu>/art/` sans l'extension :
`grandmere/r3c3` (planche de Grand-mère, ligne 3, colonne 3), `items/r1c2`, `maison/fauteuil`. Les décors s'appellent `decor/<lieu>`.
`npm run assets` prépare uniquement les images citées par le contenu, et `npm run validate` signale toute image introuvable.

## Mini-jeux disponibles

Chaque mini-jeu déclare son contrat : les params `required`, `textParams` (les chaînes visibles par le joueur, extraites
pour la traduction) et `bindings` (les params qui nomment une image ou un son : `validate` vérifie qu'ils existent, par
exemple `sfx` de `stroke`, `sfx.ring` / `sfx.stamp` de `cables`, `ticket` et `sfx` de `scratch`).

Tous les mini-jeux acceptent `intro` (consigne de la voix des indices au début) et `win` (phrase de fin). Aucun ne s'échoue, et tous ont un bouton « Passer » (sauf `scratch`, qui est la fin scellée elle-même).
Le moteur ne nomme aucune image : chaque mini-jeu reçoit les siennes par `params`. Les paramètres **en gras** sont obligatoires ; `npm run validate` signale ceux qui manquent.

| Id | Geste | Paramètres |
|---|---|---|
| `pipes` | Toucher un tuyau pour le faire tourner d'un quart de tour | **`tiles`** `{ ground, straight: [sec, mouillé], elbow: [sec, mouillé], tee: [sec, mouillé] }` (images de base : droit gauche-droite, coude gauche-bas, té gauche-droite-bas), **`source`**, **`nozzle`** `[sec, qui arrose]`, **`tank`**, `mushrooms` `[assoiffé, content]`, `cols` (4), `rows` (3), `helpAfter` (15 taps avant que le bon tuyau scintille), `background` |
| `stroke` | Caresser lentement : une jauge monte | **`target`** (image de l'animal), **`hand`** (image de la main fantôme), `goal` (100), `sfx` (bruit de la réussite), `tooFast` (phrase si trop vite) |
| `pick` | Toucher la bonne image | **`rounds`** `[{ prompt, options: [image…], answer }]`, `decoy` (image piège), `decoyLine`, `wrongLine`, `background` |
| `hide` | Trouver la bonne cachette | **`spots`** `[{ img, x, y, h, reply, found }]`, `bg` (image de fond), `answer` (index de la bonne) |
| `runner` | Haut de l'écran : sauter, bas : se baisser | **`hero`** `{ run: [images], jump, slide, stumble, h, slideH }`, `buddy` (même forme, second coureur derrière), **`chaser`** `{ frames: [images], fps, x, speed, h }`, **`obstacles`** `{ jump, duck }` (à sauter au sol, à éviter en se baissant), **`bg`** (décor qui défile), `seconds` (20), `stumble` (phrase quand on trébuche) |
| `cables` | Tirer une fiche : son câble gigote dans le nœud ; la glisser sur la bonne prise | **`board`** (panneau de 4 prises), **`knot`**, **`plugs`** `{ couleur: image }` (ids de couleur libres, 4 au plus), `sockets` (ordre des couleurs sur le panneau, de haut en bas), `tints` `{ couleur: css }`, `gags` (`lamp`, `phone`, `toaster`, `windows` ; un gag sans ses images ou son texte est retiré), `lampOn`, `lampOff`, `phone`, `toaster`, `windowsText`, `sfx: { ring, stamp }`, `helpAfter` (4) |
| `scratch` | Gratter un ticket | **`ticket`** (image), `text`, `color`, `sfx` (bruit pendant qu'on gratte), `threshold` ; utilisé par la fin scellée via `ending.scratch` |

Un jeu peut ajouter ses propres mini-jeux : `export const minigames = { monjeu: { required: ['…'], run(ctx) { … } } }` dans `index.ts`.

Exemple :

```ts
{ music: { push: 'minigame' } },
{ minigame: 'pipes', params: {
  tiles: { ground: 'pipes/r3c1', straight: ['pipes/r3c2', 'pipes/r3c5'], elbow: ['pipes/r3c3', 'pipes/r3c6'], tee: ['pipes/r3c4', 'pipes/r4c1'] },
  source: 'pipes/r4c2', nozzle: ['pipes/r4c3', 'pipes/r4c4'], tank: 'maison/r3c6', mushrooms: ['maison/r4c5', 'maison/r4c6'],
  intro: 'Khhh… tourne les tuyaux… jusqu’aux plantes.', win: 'Khhh… elles ont bu.',
}, then: [
  { music: { pop: true } },
  { say: ['grandpere', 'Merci. Maintenant, je me souviens : j’ai laissé ta clé au marché.'] },
  { unlock: 'marche' },
] },
```

## La fin scellée (`ending`)

Module facultatif. `GameDef.ending` le décrit :

```ts
ending: {
  file: 'data/dossier.bin',                         // produit par npm run seal
  password: { given: '…' },                         // ou { typed: true, prompt: 'Mot de passe ?' }
  guess: { flag: 'pronostic', labels: { a: '…', b: '…' }, right: '… {guess} …', wrong: '…', none: '…' },   // pronostic jugé sur la carte
  scratch: { ticket: 'items/r4c1', sfx: 'grattage' },   // paramètres du mini-jeu scratch
  card: { accent: '#d4145a' },                       // couleur du cadre de la carte et du texte gratté
},
```

`{ ending: true, after: […] }` joue, dans l'ordre : le ticket à gratter (le texte vient du fichier chiffré), les confetti (`skin.icons.confetti`,
`skin.sounds.confetti`) et le jingle (`skin.sounds.jingle`), puis `after`, puis la carte finale (musique `skin.sounds.end`). `{ reveal: true }` est l'ancien nom.
Les textes de la fin ne sont **jamais** dans le contenu du jeu : ils sont dans `games/<jeu>/private/ending.config.ts` (voir `TOOLS.md`, « La fin scellée »).
Juste avant, le scénario joue ce qu'il veut (la famille autour du canapé, le cadenas qui fond…).

## Vérifier son travail

`ui.shareSession` nomme la ligne du menu pause qui envoie un playtest depuis un téléphone (docs/fr/TOOLS.md,
« Playtests »).
`npm run lint` (docs/fr/TOOLS.md, « Lint ») lit le graphe de puzzles et une passe du solveur pour ce que le
validateur ne voit pas : une condition que rien ne pose, une règle qu'une autre masque, un objet qu'aucune règle
n'exige, un indice qui ne peut pas se déclencher, une action jamais jouée par le solveur. Un constat gardé exprès (un
faux indice) se fait taire dans `game.ts` :

```ts
lint: { ignore: ['item-red-herring:poulet_en_caoutchouc', 'rule-shadowed:salon/on[4]'] },   // un code, `code:<id>` ou `code:<lieu>/<chemin>`
```

La même liste garde un flag décoratif (posé, jamais lu) hors des avertissements de `npm run validate` : `flag-never-read:<flag>`.


```bash
npm run validate   # tout ce qui est cité existe, chaque chose visible a un Regarder, textes non vides
npm run solve      # le jeu se finit depuis « Nouvelle partie » ; liste les objets jamais utilisés
npm run dev        # puis ?dev pour sauter à un checkpoint, ?edit=maison pour placer les choses
```

## Musique en stems (3.5)

Un morceau de `audio.music` peut aussi avoir une partition : ses stems, joués ensemble par le directeur musical, le
mix suivant le jeu. `npm run audio -- stems` les fabrique (docs/fr/AUDIO.md).

```ts
audio: {
  music: { theme: 'swan_theme.mp3' },            // le mix unique : Save-Data, appareils modestes, sans Web Audio
  scores: {
    theme: {
      stems: { melody: 'swan-theme-stems/melody.mp3', strings: 'swan-theme-stems/strings.mp3', harp: 'swan-theme-stems/harp.mp3', bass: 'swan-theme-stems/bass.mp3' },
      bpm: 80, beatsPerBar: 4,                  // depuis score.json
      states: [                                 // le premier qui tient fixe le mix ; aucun : tous les stems
        { if: { player: 'biscuit' }, stems: ['harp', 'bass'] },
        { if: { room: 'garden' }, stems: ['strings', 'harp', 'bass'] },
      ],
      // quantize: 'bar' (défaut) ou 'beat' ; fadeBeats: 2 ; loop: [première mesure, mesure de fin)
    },
  },
}
```

Un état est n'importe quelle condition du DSL (un flag, le lieu, le personnage actif). Un changement d'état prend
effet à la mesure suivante, en fondu ; un autre lieu avec le même morceau garde la musique et ne change que le mix.
`npm run validate` vérifie les stems, le tempo, les stems et conditions des états, et que le mix unique existe.
L'onglet Musique du Studio joue une partition et le mix de chaque état.

D'une partition à une autre (3.6), une règle dit où l'ancienne laisse entrer la nouvelle, sur sa propre grille :

```ts
audio: {
  scores: { day: { …, markers: { calm: 8 }, phraseBars: 4 }, night: { … } },
  transitions: [
    { from: 'day', to: 'night', at: 'calm', bridge: 'dusk_sting' },  // à la mesure 8 de « day », puis le pont, puis « night »
    { from: '*', to: 'day', at: 'phrase', fadeBeats: 2 },             // à la phrase suivante, en fondu sur 2 temps
  ],
  maxDecodedMB: 160,                                                  // audio décodé gardé (160 par défaut)
}
```

`at` vaut `beat`, `bar` (défaut), `phrase` ou un marqueur de l'ancienne partition, compté à travers sa boucle. Sans
règle, une partition en remplace une autre aussitôt, en fondu, comme en 3.5. Une sauvegarde garde où en est la
musique, et la charger la reprend là, en coupe, jamais par une transition (3.6.1). La première règle qui nomme les
deux partitions s'applique : `validate` refuse une règle qu'une précédente couvre, et un marqueur depuis `'*'` qu'une
partition qu'elle peut quitter n'a pas. C'est un mixeur adaptatif à stems avec transitions, pas iMUSE : pas de
changement de tempo, pas de branches à l'intérieur d'une partition.
