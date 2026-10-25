# Ce que quest'n'click ne fait pas

La liste franche de ce que le moteur, ses outils et ses serveurs ne font pas, à la 4.4.0, chaque point avec sa raison
et, quand il y en a une, la chose la plus proche qui existe. Si vous cherchiez une fonction et arrivez ici, elle n’est
pas dans le produit : aucune autre page ne la décrira.

<a name="multiplayer"></a>

## Multijoueur en temps réel

**Non pris en charge.** Un jeu a un seul joueur à la fois : son état vit dans un navigateur, sur un appareil.
« Plusieurs personnages jouables » veut dire un joueur qui passe d’un personnage à l’autre, pas plusieurs personnes.
Ce qui existe à côté, et n’est pas du multijoueur :

- le **Bridge Reality** livre à un jeu des signaux signés venus du monde extérieur (un email reçu, une commande de
  terminal, un badge) ; il ne relie pas les joueurs entre eux ([Le Bridge Reality](bridge.what-it-is.md)) ;
- les **classements de speedrun** d’un Bridge sont asynchrones : les runs sont envoyés, vérifiés et classés après coup ;
- le **Studio d’équipe hébergé** permet à plusieurs auteurs de modifier un même jeu ensemble ; c’est un éditeur, pas
  un jeu ([Ce qui tourne où](team.what-runs-where.md)).

<a name="export"></a>

## Exporter vers Steam, les consoles, les boutiques d’applications ou une application native

**Non pris en charge.** `npm run build` écrit `dist/`, un site web statique que n’importe quel hébergement sert, et le
jeu s’installe depuis le navigateur comme une PWA ([Installer le jeu comme une application](play.install-app.md)). Il
n’y a pas d’empaquetage pour Steam, les consoles, l’App Store ou Google Play, ni d’enveloppe native pour ordinateur. Ce
qui existe : [Construire et publier](create.build-release.md), [GitHub Pages](create.github-pages.md),
[Clever Cloud](create.clever-static.md), [autres hébergements statiques](create.other-hosts.md).

<a name="3d-physics"></a>

## 3D, Phaser, un moteur physique

**Non pris en charge, par décision (D10).** La scène est en 2D, dessinée par le peintre DOM (la référence) ou le peintre
Canvas 2D (expérimental). WebGL ne servirait que pour un effet que Canvas 2D ne tient pas, mesures à l’appui, et aucun
n’a été mesuré (ADR 0012). Les mouvements de la scène (`launch`, `spring`, `path`, `follow`) sont de la présentation
seulement, des formules fermées du temps, pas une simulation physique ([La scène](create.stage.md)).

<a name="real-time"></a>

## Un monde en temps réel

**Non pris en charge.** Les scripts avancent entre les actions du joueur, jamais pendant une action, une cinématique,
une conversation ou un mini-jeu ; les animations et les boucles forment la couche temps réel. Les séquences d’action
relèvent d’un mini-jeu ([Mini-jeux fournis](create.minigames.md), [Un mini-jeu sur mesure](create.custom-minigame.md)).

<a name="camera"></a>

## Une caméra libre

**En partie.** La caméra se déplace horizontalement dans une salle large (elle suit le héros ou bouge sur une
commande). Depuis la 3.4, une zone de marche peut aussi zoomer, de 1× à 2×, et la vue suit alors aussi le héros
verticalement. Il n’y a pas de déplacement vertical libre ni de rotation. (L’ancienne page des classiques rangeait
« le zoom, une caméra qui bouge sur deux axes » hors champ ; le zoom par zone existe depuis la 3.4.) Voir
[Géométrie](create.geometry.md).

<a name="dialogue-format"></a>

## Un second format de dialogue

**Non pris en charge, par décision.** Sujets, `choice` et `if` forment le graphe de dialogue ; le Studio le dessine en
arbre. Un format parallèle dupliquerait le DSL et casserait le solveur, le MCP et les prompts
([Dialogues](create.dialogues.md)).

<a name="input"></a>

## Mode portrait, manette, remappage des touches

- **Le portrait sur un téléphone** : non pris en charge ; le jeu se joue en paysage et demande de tourner le téléphone.
- **Une manette** : elle ne joue pas au jeu ; seule la roue à code de Remix en lit une.
- **Remapper les touches** : non pris en charge ; un jeu peut donner une lettre à ses verbes, et le joueur peut couper
  ces touches.

Voir [Commandes](play.controls.md).

<a name="saves-accounts"></a>

## Comptes, sauvegardes dans le nuage, mesure d’audience

**Non pris en charge.** Il n’y a ni compte joueur, ni sauvegarde synchronisée entre appareils, ni mesure d’audience ou
pistage dans le moteur : les sauvegardes restent dans le navigateur, et une sauvegarde se déplace sous forme de
fichier exporté ([Sauvegardes](play.saves.md#export-import), [Confidentialité](play.privacy.md#overview)).

<a name="voices-text"></a>

## Synthèse vocale, traduction automatique, écriture de droite à gauche

**Non pris en charge.** Une voix n’existe que là où quelqu’un l’a enregistrée ; une traduction est écrite par une
personne (ou une IA) dans les fichiers de langue ; le moteur ne pose aucun sens d’écriture de droite à gauche
([Langues](play.languages.md)).

<a name="claims"></a>

## Ce que le projet n’affirme pas

- **La conformité WCAG** : le moteur est testé au clavier, sans violation axe sérieuse ou critique sur les écrans
  vérifiés ; personne n’a encore fait de passe au lecteur d’écran ([Accessibilité](play.accessibility.md#checked)).
- **Un anti-triche** : la preuve d’un speedrun montre qu’un run est possible et non modifié, pas que son joueur était
  honnête ([Speedrun pour les joueurs](play.speedrun.md#limits)).
- **« Prouvé » quand un budget a été coupé** : `npm run verify` trouve un chemin gagnant ; seul `solve --prove` explore
  chaque état atteignable, et une recherche tronquée est dite ([Ce que prouve le solveur](create.solver-proofs.md)).

<a name="bridge-limits"></a>

## Côté Bridge et connecteurs

Pas dans le Bridge à la 4.4.0 : la rétention sur un stockage SQL (il garde chaque signal), la sécurité par ligne et par
locataire dans Postgres, une limite de débit par connecteur partagée entre instances. Les connecteurs n’ont pas été
essayés avec un vrai fournisseur d’email, un vrai émetteur de badges ni une exposition contrôlée de SSH et Telnet, et
le profil `distributed` n’a pas de vrai déploiement : les deux restent expérimentaux. Les connecteurs n’envoient
aucune réponse par email et ne vérifient ni DKIM ni SPF ; le client IMAP parle TLS dès le premier octet (pas de
STARTTLS, pas d’IDLE). Le Bridge de référence est taillé pour un jeu, un développeur, un événement ou les jeux d’un
petit studio ([Garanties](bridge.guarantees.md)).

<a name="hosting"></a>

## Héberger le Studio d’équipe ailleurs que chez Clever Cloud

**Non documenté.** Le Studio hébergé n’est documenté que pour Clever Cloud, en détail (D50). C’est un serveur Node.js
avec PostgreSQL, un bucket S3 et un fournisseur OpenID Connect, et rien n’y est propre à un hébergeur, mais aucun autre
n’a de procédure ni de déploiement vérifié ([Clever Cloud : vue d’ensemble](clever.overview.md)).

<a name="tooling"></a>

## Outils audio

Furnace, le tracker qui fait le rendu de la musique, est téléchargé par `npm run audio -- setup`, jamais embarqué
(GPL-2.0) ; la CI ne fait aucun rendu audio (les fichiers sont commités). Les repères de synchronisation labiale dans la
table des voix n’existent pas.

<a name="not-yet"></a>

## Pas encore

- **`npm install @quest-n-click/engine`** : les packages ne sont pas sur npm ; le moteur s’installe depuis l’archive d’une
  release ([Installer depuis l’archive de la release](install.from-archive.md)).
- Le reste de ce qui est prévu ou laissé pour plus tard : [Feuille de route](start.roadmap.md#open-items).

<a name="why"></a>

## Pourquoi ces limites

Le but du projet est qu’une personne, avec n’importe quelle IA, fasse un point-and-click complet pour le navigateur et
prouve qu’on peut le finir. Chaque limite ci-dessus garde cette promesse vérifiable : un contenu qui reste des données,
un seul état qu’une sauvegarde contient en entier, un solveur qui fait tourner le vrai moteur, un jeu qui est un site
statique. Une fonction qui demanderait un serveur pour chaque jeu, un second modèle du contenu ou une boucle temps réel
est laissée dehors plutôt qu’à moitié prise en charge.

<a name="decisions"></a>

## Décisions et ADR

- D10 (pas de Phaser, pas de moteur physique général), D18 (le programme 4.1.x), D38 (ce que promet la 4.2.0), D50
  (Clever Cloud seulement pour la documentation du Studio hébergé) :
  [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
- [ADR 0012](../../docs/dev/adr/0012-canvas-backend.md) : Canvas 2D reste le moteur de rendu complet.
- [Stabilité et support](start.stability.md) : ce qui est promis, surface par surface.
