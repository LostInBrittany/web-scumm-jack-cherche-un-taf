# Feuille de route

D’où vient quest'n'click, ce qu’on a décidé de laisser dehors, ce que chaque release a laissé ouvert et où en est
chacun de ces points à la 4.4.0, et ce qui vient ensuite. L’histoire complète, release par release, est le
[changelog](reference.changelog.md) et la feuille de route telle qu’elle a été écrite, conservée à
[`blob/v4.4.0/docs/fr/ROADMAP.md`](https://github.com/Quest-n-Click/quest-n-click/blob/v4.4.0/docs/fr/ROADMAP.md).

<a name="overview"></a>

## De la v1.3 à la 4.4, en bref

La feuille de route a commencé le 3 octobre 2026 à partir d’un audit externe de la v1.2.1, intitulé « d’un moteur
réactif à un moteur de monde (v1.3 → v2.0) ». Chaque release depuis y a ajouté sa section : M1 « World » à M5 « Open »
(v1.3 à v2.0), v2.1 « Proof » à v2.5 « Sound », v3 « Trust » à 3.9 « Independence », 4.0 « Stable Platform », la ligne
4.1.x (4.1.0 « Clarity » à 4.1.20 « Last Mile », avec le programme 4.1.8 → 4.1.15 de la D18), la 4.2.0 « Stable World »
et ses étapes 4.2.x (le Studio Server), la 4.3.0 « Hero Choice », la 4.3.1, et la 4.4.0 « Author's Desk ». Le projet
s’appelait web-scumm jusqu’à la 4.2.5 ([Ce qu’est quest'n'click](start.what-it-is.md#history)).

<a name="context"></a>

## Contexte : l’audit de la v1.2.1

L’audit concluait que le moteur savait produire un bon point-and-click court, mais pas confortablement un jeu de 30 à
100 salles, parce qu’il était purement réactif (tap → règle → commandes), sans simulation du monde. Ses 18 affirmations
ont été vérifiées dans le code : 12 exactes, 4 partielles, 2 fausses (`give` / `take` / `room` ne sont pas des
commandes ; les mini-jeux n’étaient pas dans le cœur, c’était déjà un registre qu’un jeu étend depuis
`games/<id>/index.ts`). Le diagnostic principal tenait.

Le but fixé alors, et qui reste celui du projet : **une personne, avec n’importe quelle IA, peut faire un jeu complet
(long) avec ce moteur**. Le travail est ordonné par ce qui bloque vraiment un jeu long, pas par la fidélité à Day of the
Tentacle.

Ce qui était vrai en v1.2.1, et ne l’est plus : un seul `hero` et un seul inventaire, des acteurs rangés par salle et
jamais déplacés par une commande ; aucun script autonome, aucune minuterie, aucun événement (`onEnter` était le seul
déclencheur en dehors d’un tap) ; une scène fixe de 640 × 400 sans caméra, sans animation d’accessoire, sans événement
d’image ; des sujets de conversation par salle, les embranchements par `choice` / `if` ; des sorties en hotspots avec
`goto`, aucun graphe des salles dans `validate` ; une seule sauvegarde, une nouvelle version voulant dire une nouvelle
partie, aucune migration ; un solveur best-first sans notion de but ni d’invariant ; pas de commande sur mesure, pas de
langue, pas de voix, des réglages limités à la musique et aux sons.

<a name="audit"></a>

## Ce qu’on a gardé de l’audit, et ce qu’on a changé

**Gardé** : un ordonnanceur, des événements et des acteurs du monde comme premier jalon ; pas de réécriture, pas de
Phaser ; un solveur par chapitres avec buts et invariants ; des sauvegardes à plusieurs emplacements avec des
migrations en données ; un débogueur « pourquoi cette règle n’est pas disponible » ; des animations avec événements
d’image ; une porte de sortie dont les effets sont déclarés au solveur.

**Changé** :

- *Événements et ordonnanceur ne font qu’un.* Un bus d’événements sans scripts capables d’attendre (`waitEvent`,
  `waitUntil`) n’est qu’un drapeau renommé ; les deux sont arrivés ensemble, dans le même état sérialisable.
- *Plusieurs personnages jouables n’était pas prioritaire* : c’est venu après la caméra et les sauvegardes, parce que
  cela change la forme de l’état et demandait des migrations.
- *Pas de graphe de dialogue séparé.* Sujets, `choice` et `do` forment déjà un graphe de données ; un second format
  dupliquerait le DSL et casserait le solveur, le MCP et les prompts. Ce qui manquait, c’était la visualisation dans le
  Studio (un arbre tiré des sujets). Le combat d’insultes est une activité (un mini-jeu), pas une primitive de dialogue.
- *Les mini-jeux comme greffons* : c’était déjà le cas ; il ne manquait que la documentation et un exemple hors du cœur.
- *La traduction par extraction* (des textes repérés par leur chemin, des fichiers `locales/<lang>.json` qui les
  remplacent) plutôt que des clés dans le contenu, pour que le DSL qu’écrit une IA reste léger.
- *Le vrai risque n’est pas technique* : chaque nouvelle primitive doit être comprise par `validate`, `solve`, le guide
  du contenu dans les deux langues, le générateur de prompts, les outils MCP et le Studio, sinon une IA ne l’utilisera
  pas, ou mal. Chaque jalon inclut cette propagation, et le jeu d’exemple utilise chaque primitive au moins une fois.

<a name="principles"></a>

## Principes de conception, à chaque jalon

1. **Tout reste des données** : de nouvelles commandes dans l’union `Cmd`, de nouveaux champs typés sur `RoomDef` /
   `GameDef`, jamais de fonctions dans le contenu (sauf le registre `custom`, qui vit dans `index.ts` comme les
   mini-jeux).
2. **Tout est dans `GameState`** : la position des scripts, les acteurs du monde, la caméra, pour qu’une sauvegarde
   reprenne exactement et que le solveur reste déterministe.
3. **Le solveur traite le temps comme un choix** : « laisser le script X finir son tour » est une action du solveur,
   une attente vaut zéro en simulation, et une commande `custom` déclare ses effets.
4. **Un jalon, au plus une hausse de `saveVersion`**, avec sa migration.
5. **Le jeu privé suit** : le jeu du mainteneur embarquait une copie du moteur et était rejoué à chaque jalon. Il reste
   en 3.1.0 depuis la D8 ; depuis la 4.0, un jeu indépendant hors du dépôt (The Lighthouse) et les jeux fournis tiennent
   ce rôle.

<a name="open-items"></a>

## Points ouverts : ce que chaque release a laissé, et où il en est

Chaque release a dit ce qu’elle laissait pour plus tard. Vérifié dans le code de la 4.4.0 (23 octobre 2026) :
« ouvert » veut dire que le code ou les notes de release montrent que ce n’est toujours pas fait, « fait » nomme la
release qui l’a fait.

**Les passes humaines.** Chaque release depuis la 3.4 a signalé des passes que seule une personne peut faire (un
lecteur d’écran, de vrais téléphones, Safari hors ligne, des testeurs qui ne connaissent pas les énigmes, des voix
enregistrées écoutées, de vraies sessions OBS et LiveSplit, de vrais connecteurs, un Bridge et un Studio Server
déployés). **Ouvert** : les 21 passes de la fiche 4.4.0 sont toutes à faire
([Stabilité et support](start.stability.md#surfaces)). Ce sont elles qui font passer une surface « limitée » au stable.

**La publication npm.** Annoncée pour « une 4.2.x après la 4.2.0 » (D38), répétée en 4.3.0. **Ouvert** : les packages
ne sont pas sur le registre npm (vérifié le 23 octobre 2026) ; le moteur s’installe depuis l’archive d’une release.
The Lighthouse dans un dépôt public : ouvert.

**Le solveur à l’échelle** (v2.4, v3.3, v3.5, v3.6, 4.1.13) :

- la matrice ouverte à trois personnages (20 salles × 3 personnages, arrêtée à 200 000 puis 600 000 états en 3.5 et
  3.6 ; 8 des 12 instances de la matrice de preuve dans le budget en 4.1.13) : **ouvert** ; le levier nommé en 4.1.13,
  une mémoire pour les macro-déplacements et les passages d’objets, n’est pas fait ;
- la dominance dans les preuves : **ouvert** (la dominance de témoin existe depuis la 3.5 en option, pour les témoins
  seulement ; dans une preuve, elle a changé un verdict dans un mode réservé aux tests, elle reste donc coupée) ;
- un moteur symbolique (un essai, non tenté en 4.1.13) : **ouvert** ;
- les chiffres de `prove:matrix` sur le runner et les nouveaux modules du solveur dans le jeu de mutation du cœur : pas
  revérifiés ici.

**Son et voix** (v2.5, v3.4) : la musique adaptative, « pas faite exprès » en v2.5, **faite** en 3.5 et 3.6 (le
directeur musical : des pistes séparées qui suivent l’état du jeu à la mesure suivante, des transitions sur un temps,
une mesure, une phrase ou un repère). Les repères de synchronisation labiale dans la table des voix : **ouvert**. Furnace
est téléchargé par `npm run audio -- setup`, jamais embarqué (GPL), et la CI ne fait aucun rendu audio (les fichiers sont
commités) : voulu, pas prévu.

**La structure du moteur** (4.1.5, 4.1.6, 4.1.8) :

- `busyCount`, `guideWait` et `skipping` laissés sur l’Engine : **fait**, ils vivent dans l’état d’occupation du moteur
  (`src/engine/core/busy.ts`) ;
- les scripts npm regroupés en une douzaine de verbes : **ouvert** (129 scripts dans le `package.json` du dépôt du
  moteur) ;
- `sirv-cli` là où il est : inchangé (toujours une dépendance) ;
- l’onglet assistant du Studio (845 lignes en 4.1.8) : **ouvert** (`src/studio/assistant.ts`, 839 lignes) ;
- le lecteur de jeu décomposé, la liste de dessin du peintre Canvas construite à chaque image, les onglets du Studio
  séparés avec un test par onglet, l’onglet Vérifier dans la langue du solveur, l’accélération du workflow de release :
  pas revérifiés ici.

**Documentation** (4.1.7) : un exemple par nom dans la référence de l’API : pas revérifié ; un vérificateur de liens
externes : **ouvert**, prévu en 4.5 comme `wiki -- check --network`.

**Connecteurs** (4.1.9) : les réponses par email (aucune n’est envoyée), DKIM et SPF, STARTTLS et IDLE en IMAP (le
client parle TLS dès le premier octet) : **ouvert** ; un plancher de couverture pour `connectors/` : **ouvert** (la
mesure de couverture porte sur `src/`, `bridge/` et `studio-server/`) ; un seuil de mutation pour les connecteurs :
**fait** (`connectors-pure` en 4.1.18, `connectors-edge` en 4.1.20).

**Le Bridge** (4.1.10) : la rétention sur un stockage SQL : **ouvert** (`compact` refuse un stockage SQL, « no
retention yet ») ; la sécurité par ligne et par locataire dans Postgres : **ouvert** ; les chiffres de charge sous
Postgres et une limite de débit par connecteur partagée entre instances : pas revérifiés ici ; un vrai déploiement à
plusieurs instances derrière HTTPS : la passe `bridge-postgres-https`, ouverte.

**Le rendu** (4.1.11) : `e2e:perf` sur les deux peintres : **fait** (la CI le lance avec `--renderer=canvas` et
`--renderer=dom`) ; l’essai WebGL : **ouvert** (ADR 0012 : WebGL seulement sur un gain mesuré, non mesuré) ; un vrai
téléphone : la passe `phone-both-renderers`, ouverte.

**Le langage** (4.1.12) : `e2e:canonical` en CI : **fait** (depuis la 4.1.16) ; le mode démo du Studio qui écrit des
objectifs : **ouvert**.

**Speedrun** (4.1.14 à 4.1.16) : un stockage SQL des runs et le montage de `/v1/runs`, `e2e:speedrun` en CI, les jeux
de mutation remix et speedrun bloquants, le parcours Mystère du joueur : **fait** (4.1.16 et 4.1.17) ; le niveau
`server-witnessed` : **ouvert** (réservé, pas implémenté) ; rejouer un ancien run avec sa propre version du moteur (le
rejeu à version épinglée) : **ouvert** (le vérificateur répond `unsupported-version`) ; isoler le worker de
vérification au niveau du système : **ouvert** (ses refus réseau sont dans le processus, « pas un bac à sable »).

**Remix** (4.1.15) : `e2e:remix` en CI, le module du défi du jour monté sur le serveur du Bridge, le monde dans
l’enveloppe `.wsrun`, le résultat de la roue à code dans la session : **fait** (4.1.16) ; les cinq graines humaines :
une passe humaine, ouverte ; `e2e:a11y` sur la roue et la fin `story` de la roue : pas revérifiés ici.

**Le Studio hébergé** (la liste de la 4.2.3, reportée en 4.3) :

- les captures avant/après du diff sémantique : **faites sur un Studio local** en 4.4.0 ; **ouvertes** sur un Studio
  hébergé, qui n’a pas de navigateur à côté de son worker ;
- la santé du jeu avec le lint et les parties de test (elles chargent la file unique du worker) : ouvert selon
  SUPPORT ;
- l’Assistant sur un Studio hébergé (une clé apportée par chaque utilisateur, D41, demande son propre modèle de
  menaces) : ouvert ;
- une sauvegarde signée (son empreinte dit qu’elle est entière, pas qui l’a faite ; la signer demande une clé hors de
  l’instance, décidée avec la rotation des clés, D37) : ouvert ;
- `ids --lines` comme opération exclusive : pas trouvé fait.

**La 4.0** demandait « un jeu fait par quelqu’un d’autre » : un contributeur extérieur, Horacio (LostInBrittany), a fait
son jeu « Jack cherche un taf » avec le moteur et a apporté ce qu’il lui fallait (4.2.4, 4.3.0, 4.4.0) ; la « relecture
par quelqu’un qui n’a pas construit le moteur » de la 4.1.0 a été faite par les lectures extérieures de la 4.3 (4.3.1,
4.4.0).

<a name="unplanned"></a>

## Après la 4.0 : ce qui reste sans plan

- Les passes humaines, puis ce qu’elles trouveront (D12) ; rendues bloquantes pour la 4.2.0 (D18), puis la 4.2.0 est
  sortie avant elles avec un périmètre stable réduit (D38).
- Publier les packages sur npm (D38), et The Lighthouse dans un dépôt public.
- Les traductions chargées à la demande (la seconde langue fait environ 10 % du JavaScript de la première visite) : un
  changement du contrat du module de jeu, donc une mineure avec une dépréciation, pas un correctif.
- La matrice ouverte à trois personnages (ci-dessus).
- Les repères de synchronisation labiale dans la table des voix (laissés depuis la 3.4).
- Fait depuis que cette liste a été écrite : Vite 8 et TypeScript 7 (refusés en 4.0, faits en 4.1.8 « Foundation
  Reset », avec le `tsconfig.json` du modèle de projet).

<a name="out-of-scope"></a>

## Hors plan, par décision

- **Pas de Phaser, pas de moteur physique général** (D10). Canvas 2D est permis depuis la 3.4 comme second peintre de
  scène, le DOM restant la référence ; WebGL seulement pour un effet que Canvas 2D ne tient pas, mesures à l’appui.
- **Pas de format de dialogue parallèle au DSL.**
- **Pas de package npm avant la 4.2.0** (D18 ; avant, aucune seconde personne n’en avait demandé). Depuis la 4.2.0, la
  publication est permise et prévue, et pas encore faite.

La liste complète de ce que le projet ne fait pas, avec les raisons :
[Ce que quest'n'click ne fait pas](index.not-supported.md).

<a name="ahead"></a>

## Ce qui vient après la 4.4

- **La 4.5.0 « Wiki »** (D50, 23 octobre 2026, ADR 0030) : la documentation passe dans ce wiki bilingue, généré depuis
  `wiki/` dans le dépôt, lu par les outils MCP `search_docs`, `list_docs` et `read_doc`, livré dans le package et publié
  par version. Le plan : [`docs/dev/PLAN-4.5-WIKI.md`](../../docs/dev/PLAN-4.5-WIKI.md). Il porte aussi les
  corrections que son inventaire a trouvées (captures d’écran refaites, scripts manquants d’un projet créé dits, un
  ticket pour eux).
- **Rien n’est décidé après la 4.5** : le registre des décisions n’a aucune question en attente
  ([`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md), « Pending: none »). Les points ouverts ci-dessus, et d’abord
  les passes humaines, sont les candidats.

<a name="verification"></a>

## Vérification à chaque jalon

Ce que chaque jalon de la feuille de route devait passer :

1. `npm run validate && npm run solve && npm test && npm run build` au vert, la CI au vert, l’audit des assets au vert.
2. Le jeu d’exemple utilise chaque nouvelle primitive au moins une fois et le parcours de bout en bout passe par elle
   (captures en 844 × 390).
3. Une sauvegarde faite avec la version précédente du jeu d’exemple se charge après migration (un test unitaire sur un
   JSON figé par jalon ; depuis la 3.0.0, une sauvegarde de référence par release).
4. Le moteur copié dans le jeu privé : ses tests, son solveur et son parcours de bout en bout inchangés (jusqu’à ce que
   la D8 fige ce jeu en 3.1.0).
5. Le MCP liste les outils à jour ; une nouvelle session d’IA ajoute un script ou un événement au jeu d’exemple en ne
   suivant que le guide du contenu.
6. Une release taguée avec ses notes, et le tableau des releases du README mis à jour.

La liste d’aujourd’hui pour un changement : [Avant une pull request](contribute.before-a-pr.md).

<a name="references"></a>

## Références

- [Changelog](reference.changelog.md), [Stabilité et support](start.stability.md),
  [Décisions et ADR](contribute.decisions.md).
- La feuille de route telle qu’écrite jusqu’à la 4.4.0 :
  [`blob/v4.4.0/docs/fr/ROADMAP.md`](https://github.com/Quest-n-Click/quest-n-click/blob/v4.4.0/docs/fr/ROADMAP.md).
- [Mesures de performance](contribute.benchmarks.md) pour les mesures du solveur,
  [`docs/dev/PROOF-MATRIX.md`](../../docs/dev/PROOF-MATRIX.md) pour la matrice des jeux à trois personnages.
