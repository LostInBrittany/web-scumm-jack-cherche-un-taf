# Ce qu’est quest'n'click, et son histoire depuis web-scumm

![Le logo de Quest'n'Click : une fenêtre d’éditeur en pixel art avec une scène de port, un graphe de dialogue et un curseur, entourée de cartes illustrées, d’une carte au trésor, d’un panneau IA, d’un carnet de schémas d’énigmes et d’une tasse de café, sous les mots Quest'n'Click, Open source point & click engine](../images/start/logo.png)

*Le logo : les mots « quest'n'click, Open source point & click engine » sous une fenêtre d’éditeur en pixel art.*

**quest'n'click sert à faire un point-and-click pour le navigateur : on l’écrit comme des données, on le façonne dans
un Studio visuel, on vérifie qu’on peut le finir, et on le livre comme un jeu web qui s’installe sur un téléphone et se
joue hors ligne.** C’est un moteur, ses outils, un Studio local, un Studio hébergé pour une équipe, et un Bridge
Reality, le tout libre (le code sous licence MIT).

<a name="what-you-can-do"></a>

## Ce qu’on peut en faire

| | |
|---|---|
| **Jouer** | *La Clé du garde-manger*, le jeu d’exemple, sur téléphone en paysage ou sur ordinateur : [quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/) |
| **Essayer le Studio** | Le Studio en mode démo : modifiez le jeu d’exemple, vos modifications restent dans votre navigateur ([Jouer en ligne et essayer le Studio de démo](start.play-online.md)) |
| **Faire son jeu** | Dans son propre dossier, depuis l’archive d’une release ([Installer depuis l’archive de la release](install.from-archive.md)), puis une première salle en quinze minutes ([Votre premier jeu](create.first-game.md)) |

![La Clé du garde-manger : le salon de Grand-mère, avec une grand-mère et un chat sur un tapis, les neuf verbes à droite (Give, Open, Close, Pick up, Look at, Talk to, Use, Push, Pull), un sac vide en dessous, et la ligne de phrase « Walk to » sous la scène](../images/start/4119-hero.webp)

*La Clé du garde-manger, le salon de Grand-mère (en anglais) : la scène à gauche, les neuf verbes et le sac à droite,
la ligne de phrase « Walk to » en dessous. Capture faite à la 4.1.19.*

En une phrase par partie :

- **Le contenu, ce sont des données** : salles, accessoires à états, personnages, objets, règles, conversations,
  indices, scripts et événements sont de simples objets TypeScript, sans code dedans, que chaque outil peut lire,
  vérifier et jouer ([Principes du contenu](create.principles.md)).
- **Le Studio, c’est le vrai moteur avec un éditeur par-dessus** : les salles et leurs placements, le storyboard,
  chaque planche de sprites et où elle sert, les vérifications après chaque enregistrement
  ([Le Studio local](studio.overview.md)).
- **Le solveur fait tourner le vrai moteur** pour trouver un chemin gagnant, ou pour prouver que chaque état
  atteignable peut encore finir ([Ce que prouve le solveur](create.solver-proofs.md)).
- **Le jeu se livre comme un site statique et une PWA** qui s’installe et se joue hors ligne
  ([Construire et publier](create.build-release.md)).

La liste complète : [Fonctionnalités](start.features.md). Ce qu’il ne fait pas :
[Ce que quest'n'click ne fait pas](index.not-supported.md).

<a name="history"></a>

## Anciennement web-scumm

Le projet s’appelait **WebSCUMM**, puis **web-scumm**, en hommage à SCUMM, le moteur de LucasArts dont il suit
l’esprit. Il a été renommé **quest'n'click** en 4.2.5 (20 octobre 2026, décision D47) pour que son nom ne suscite aucun
débat inutile. Ce que cela veut dire aujourd’hui :

- Le dépôt est `Quest-n-Click/quest-n-click` depuis la 4.5.2, dans l’organisation Quest-n-Click ; les liens vers les
  précédents (`wanoo/quest-n-click`, `wanoo/web-scumm`) y sont redirigés. Les anciennes adresses de la démo,
  `wanoo.github.io/web-scumm` et `wanoo.github.io/quest-n-click`, étaient sur GitHub Pages, abandonné en 4.5.2 : la
  démo est sur le site web du projet, [quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/).
- À partir de la 4.2.5, les packages et les commandes s’appellent `quest-n-click`. Les anciens noms `web-scumm` ont
  marché pendant toute la 4.2.x et disparaissent en 4.3.0, où `npx quest-n-click migrate` renomme les imports et les
  commandes d’un jeu ([Venir de web-scumm](install.from-web-scumm.md)).
- À partir de la 4.5.2, les paquets sont nommés sous le scope de l’organisation npm : `@quest-n-click/engine`,
  `@quest-n-click/create`, `@quest-n-click/bridge`, `@quest-n-click/connectors`, `@quest-n-click/studio-server`
  ([Référence du paquet](install.package.md)). Les commandes gardent leur nom (`quest-n-click`,
  `quest-n-click-bridge`…) ; `npx quest-n-click migrate` passe les imports `quest-n-click/…` d’un jeu à
  `@quest-n-click/engine/…`.
- Les sauvegardes, les runs et les sessions gardent leurs formats et se chargent comme avant : des identifiants comme
  `web-scumm-save` ou la base `web-scumm-saves` font partie des formats, ce ne sont pas des noms du projet, et ils
  restent.

Le moteur a grandi à côté du jeu privé du mainteneur, qui en embarquait une copie et était rejoué à chaque jalon ; ce
jeu reste sur le moteur 3.1.0 (D8). Le chemin de la v1.3 à aujourd’hui : [Feuille de route](start.roadmap.md).

<a name="how-it-is-made"></a>

## Comment c’est fait

Le dépôt du moteur, au premier niveau :

```
src/engine/       core (le DSL, le moteur), tools (validate, solve, lint, i18n…), dom (le lecteur), minigames, reality
src/studio/       les pages du Studio
games/demo/       le jeu d'exemple : salles, mises en page, images, son, langues, storyboard
games/            aussi _template (copié pour un nouveau jeu), heroes, reference, signals
tools/            les commandes, le côté serveur du Studio, le serveur MCP, les chaînes d'images et de son, les plugins Vite
cli/              les commandes quest-n-click et create du package
studio-server/    le Studio d'équipe hébergé (le package @quest-n-click/studio-server)
bridge/           le Bridge Reality (le package @quest-n-click/bridge)
connectors/       les connecteurs du monde extérieur (le package @quest-n-click/connectors)
ops/, clevercloud/ les scripts de déploiement et de qualification
scripts/          les scripts de build, de bout en bout, d'empaquetage et de release
tests/            les tests unitaires et de propriétés
wiki/             cette documentation, en anglais et en français
docs/             la documentation d'avant la 4.5 ; docs/dev : le journal de travail, les décisions, les ADR, les passes de chaque release
```

Le moteur, le solveur et le rejeu partagent un seul chemin de code ; [Architecture](contribute.architecture.md) et une
[visite du code](contribute.code-tour.md) d’une demi-heure expliquent comment tout s’assemble. L’organisation d’un
projet de jeu et de ce dépôt, avec les scripts de chacun : [Organisation d’un projet](create.project-layout.md).

<a name="made-with-ai"></a>

## Fait avec un assistant IA, relu par des personnes

Le contenu est déclaratif : un assistant le lit et l’écrit comme n’importe quel fichier (`AGENTS.md` en donne les
règles). Chaque opération est une commande et un outil MCP, et après chaque changement un assistant peut valider,
résoudre, rejouer et faire une capture : il voit ses erreurs avant qu’une personne les voie. Chaque résultat reste
relisible, dans le Studio et dans Git. Voir [Travailler avec une IA](create.working-with-ai.md) et, pour modifier le
moteur, [Contribuer avec des agents IA](contribute.ai-agents.md).

<a name="why"></a>

## Pourquoi il est construit ainsi

Une personne, avec n’importe quelle IA, doit pouvoir faire un jeu complet et long, et savoir qu’on peut le finir. Cela
demande un contenu qu’une machine lit en entier (des données, pas du code), un seul état qu’une sauvegarde contient en
entier, un solveur qui joue le vrai moteur plutôt qu’un second modèle de celui-ci, et un résultat qui n’est qu’un site
web. Les autres voies écartées, et pourquoi, sont dans [Ce que quest'n'click ne fait pas](index.not-supported.md#why)
et la [Feuille de route](start.roadmap.md#out-of-scope).

<a name="affiliation"></a>

## Sans affiliation

quest'n'click (anciennement web-scumm) est un projet indépendant. « Façon SCUMM » désigne un genre de jeu ; le projet
n’est ni affilié à, ni approuvé par, ni dérivé de LucasArts, Lucasfilm, Disney ou du projet ScummVM, et n’en livre ni
code, ni données, ni images. Licences : le code sous MIT ; les images, bruitages et thème du jeu d’exemple sous CC BY
4.0 (attribution « Wano ») ; les polices sous SIL OFL ([Licences et crédits](contribute.licences.md)).

<a name="decisions"></a>

## Décisions et ADR

- D47 (le nouveau nom), D8 (le jeu privé figé en 3.1.0) : [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
- [ADR 0002](../../docs/dev/adr/0002-declarative-content.md) (le contenu déclaratif),
  [ADR 0003](../../docs/dev/adr/0003-solver-runs-the-engine.md) (le solveur fait tourner le moteur).
