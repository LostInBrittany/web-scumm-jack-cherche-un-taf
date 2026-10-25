# FAQ par public

Les questions qu’on pose le plus, rangées selon qui les pose, chacune avec une réponse d’une ou deux lignes et la page
qui dit le reste. Les réponses valent pour la release à laquelle appartient cette documentation, nommée au pied de
chaque page. Vous ne trouvez pas la vôtre ? Cherchez dans ce wiki, ou voyez
[Ce que quest'n'click ne fait pas](index.not-supported.md).

<a name="players"></a>

## Joueurs

- **Où jouer ?** Le jeu d’exemple est sur [quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/), sur
  un téléphone en paysage ou un ordinateur ([Jouer en ligne](start.play-online.md)).
- **Comment on joue ?** Touchez un verbe, puis une chose ; un double tap agit sans verbe ; tout le jeu se joue aussi au
  clavier ([Commandes](play.controls.md)).
- **Puis-je jouer hors ligne, sur un iPhone ?** Oui : ouvrez-le en ligne dans Safari, Partager › Sur l’écran d’accueil,
  et attendez que le menu de pause annonce le jeu entier en cache. Personne ne l’a encore essayé sur un vrai iPhone
  ([Installer le jeu comme une application](play.install-app.md)).
- **Où sont mes sauvegardes, et puis-je les déplacer ?** Dans votre navigateur, sur cet appareil seulement. Exportez une
  sauvegarde en fichier et importez-la ailleurs ([Sauvegardes](play.saves.md)).
- **Ma sauvegarde ne se charge pas. / Il n’y a pas de son. / Je vois toujours l’ancienne version.**
  [Dépannage pour les joueurs](play.troubleshooting.md).
- **Que garde le jeu sur moi ?** Rien en dehors de votre appareil, sauf si le jeu utilise un Bridge Reality ou des
  classements en ligne ([Confidentialité](play.privacy.md)).
- **Est-ce accessible ?** Testé au clavier et avec axe-core ; pas une conformité WCAG, et aucune passe au lecteur
  d’écran par une personne pour l’instant ([Accessibilité](play.accessibility.md)).
- **Puis-je faire des speedruns, avec LiveSplit ou OBS ?** Dans un jeu qui déclare des catégories, oui
  ([Speedrun pour les joueurs](play.speedrun.md)).

<a name="authors"></a>

## Auteurs

- **Comment commencer mon propre jeu ?** Installez le moteur depuis l’archive d’une release, dans son propre dossier,
  puis suivez le tutoriel du premier jeu ([Installer depuis l’archive de la release](install.from-archive.md),
  [Votre premier jeu](create.first-game.md)).
- **Puis-je faire `npm install @quest-n-click/engine` ?** Pas encore : aucune release n'a publié les packages sur npm ; chaque
  release les joint sous forme d'archives ([Stabilité et support](start.stability.md#releases)).
- **Cette commande se lance où ?** Chaque commande de ce wiki dit d’abord son dossier et son contexte : le dépôt du
  moteur ou un projet créé, qui n’ont pas les mêmes scripts ([Organisation d’un projet](create.project-layout.md),
  [Scripts npm](reference.npm-scripts.md)).
- **Je veux que le garde patrouille.** Scripts et personnages qui se déplacent
  ([Déplacer les personnages](create.moving-characters.md)).
- **Drapeau ou événement ?** Un drapeau est un état qui reste ; un événement se déclenche puis disparaît
  ([Drapeaux, variables et événements](create.flags-variables-events.md)).
- **Le solveur trouve une fin : ai-je exclu tous les blocages ?** Non : `npm run verify` trouve un chemin gagnant ;
  seul `solve --prove` explore chaque état atteignable ([Ce que prouve le solveur](create.solver-proofs.md)).
- **Puis-je mettre à jour le moteur sans perdre les sauvegardes de mes joueurs ?** Les sauvegardes de toute release
  3.x ou 4.x se chargent dans toute 4.x suivante ; vos propres changements de contenu demandent une migration
  ([Mettre à jour](install.upgrade.md), [État et sauvegardes](create.state-saves.md),
  [Stabilité et support](start.stability.md#saves)).
- **Mon jeu marche en local mais pas sous un sous-chemin.**
  [Sous-chemin, cache et service worker](create.deploy-issues.md).
- **Puis-je exporter vers Steam, ou faire du multijoueur ?** Non
  ([Ce que quest'n'click ne fait pas](index.not-supported.md)).
- **Puis-je travailler avec une IA ?** Oui : chaque opération est une commande et un outil MCP, et ce wiki se lit par
  `search_docs` et `read_doc` ([Travailler avec une IA](create.working-with-ai.md)).
- **Qu’est-ce qui est stable ?** Le format du contenu et ses outils, la PWA sous Chromium d’ordinateur, le Bridge sur
  SQLite et l’API publique ; le reste est limité ou expérimental ([Stabilité et support](start.stability.md)).

<a name="admins"></a>

## Administrateurs d’un Studio d’équipe

- **Où héberger le Studio d’équipe ?** Il n’est documenté que pour Clever Cloud
  ([Clever Cloud : vue d’ensemble](clever.overview.md)) ; il est expérimental.
- **J’ai une 423. / J’ai une 409.** [Pan verrouillé (423)](team.write-refused-423.md),
  [Révision de base dépassée (409)](team.write-refused-409.md).
- **Comment restaurer le Studio sur une base vide ?** [Exercice de restauration](clever.restore-drill.md).
- **Comment faire tourner `STUDIO_SESSION_KEY` ?** [Faire tourner les clés](clever.key-rotation.md) ; toutes les
  variables : [Variables d’environnement](reference.environment-variables.md).
- **J’ai perdu l’accès propriétaire.** [Retrouver l’accès administrateur](clever.admin-recovery.md).

<a name="contributors"></a>

## Contributeurs

- **Comment préparer le dépôt ?** [Installation pour développer](contribute.setup.md).
- **Que faut-il faire passer avant une pull request ?** [Avant une pull request](contribute.before-a-pr.md).
- **Un mutant survivant, un cliquet de couverture au rouge ?** [Tests de mutation](contribute.mutation-testing.md),
  [Le cliquet de couverture](contribute.coverage-ratchet.md).
- **Comment écrire une page de ce wiki ?** [Écrire la documentation](contribute.writing-docs.md).

<a name="old-links"></a>

## Anciens liens et anciens noms

- **J’ai un ancien lien vers `docs/fr/CONTENT_GUIDE.md` (ou une autre page de `docs/`).** Depuis la bascule vers ce
  wiki (4.5.0), chaque ancienne page est une page de transition qui garde toutes ses anciennes ancres et renvoie vers
  ses nouvelles pages, avec un repli vers le texte de la 4.4.0 :
  [`blob/v4.4.0/docs/fr/CONTENT_GUIDE.md`](https://github.com/Quest-n-Click/quest-n-click/blob/v4.4.0/docs/fr/CONTENT_GUIDE.md).
  L’appel MCP `read_doc {name: "CONTENT_GUIDE"}` continue de marcher.
- **Qu’était web-scumm ?** L’ancien nom de ce projet, jusqu’à la 4.2.5
  ([Ce qu’est quest'n'click](start.what-it-is.md#history), [Venir de web-scumm](install.from-web-scumm.md)).

<a name="documentation"></a>

## Où est la documentation

Ce wiki remplace les pages de `docs/en` et `docs/fr`. Chaque page existe en anglais et en français, et
`npm run wiki -- check` garde les deux alignées (mêmes sections, liens, étapes et blocs) : le tutoriel de la première salle
([Votre premier jeu](create.first-game.md)), la boucle de travail de la première idée à la release
([La boucle de travail](create.working-loop.md)), chaque commande ([Scripts npm](reference.npm-scripts.md)), passer à
une nouvelle version ([Mettre à jour](install.upgrade.md)), et d’où vient le projet
([Feuille de route](start.roadmap.md)). Ce qui change à chaque release est dans le [changelog](reference.changelog.md).
La documentation de développement (décisions, ADR, plans, passes de chaque release) reste dans
[`docs/dev`](../../docs/dev/DECISIONS.md), en anglais : publique, écrite pour les mainteneurs.

<a name="current-release"></a>

## Ce que contient la release actuelle

La release actuelle est celle qu'indique le pied de cette page, et la plus récente sur
<https://github.com/Quest-n-Click/quest-n-click/releases/latest> ; [Stabilité et support](start.stability.md#releases) donne
les lignes et la durée de support de chacune. Cette réponse ne la nomme pas, pour ne pas vieillir à la release
suivante. Les plus récentes, de la plus neuve à la plus ancienne :

La **4.5.0 « Wiki »** (23 octobre 2026) : cette documentation, en anglais et en français, publiée comme wiki GitHub et
sur Pages depuis l'archive de la release elle-même ; `search_docs`, `list_docs` et `read_doc {id, section}` pour un
assistant. La **4.4.0 « Author’s Desk »** (22 octobre 2026) : un exemple jouable du choix du héros en deux langues
(`games/heroes`), la matrice héros × langue du Studio, des captures avant/après dans le diff sémantique (sur un Studio
local), une prévisualisation hébergée plus rapide, un hotspot qui agit d’un seul tap et une épingle de carte à
plusieurs lieux (d’Horacio, LostInBrittany), la colonne du téléphone sur un écran paysage bas.

Avant elles : la **4.3.1** a donné leurs voix aux aiguillages propres à une traduction sur toute la chaîne, et dit que
`npm run solve` trouve un chemin gagnant (`--prove` prouve chaque héros). La **4.3.0 « Hero Choice »** : le joueur
choisit son héros à la Nouvelle partie, une touche par verbe, une police pixel proportionnelle pour l’interface, pour
l’essentiel d’un contributeur extérieur ; les anciens noms `web-scumm` disparaissent (`npx quest-n-click migrate`). La
**4.2.5** : le nouveau nom. La **4.2.4** : une sortie franchie d’un simple tap, `actorGap`, le fond des planches de
sprites, `face: 'hero'` corrigé. La **4.2.3 « Coordination »** : le Studio en ligne pour une équipe, expérimental :
prévisualisations par révision, santé, annulation personnelle, builds publiés, sauvegarde et restauration, carte du
scénario, commentaires ancrés, diff par nom, agents IA par un MCP distant, envoi et import Git, onglet Assets hébergé.
La **4.2.0 « Stable World »** a rétabli le SemVer strict après la ligne 4.1.x, et est sortie avant les passes
humaines : seules ses surfaces stables sont promises ([Stabilité et support](start.stability.md#v420)).
