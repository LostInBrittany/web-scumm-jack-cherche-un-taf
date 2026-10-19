<p align="center"><img src="docs/img/logo.png" width="480" height="320" alt="Le logo de web-scumm : une fenêtre d’éditeur en pixel art avec une scène de port, un graphe de dialogue et un curseur, entourée de cartes illustrées, d’une carte au trésor, d’un panneau IA, d’un carnet de schémas d’énigmes et d’une tasse de café, sous les mots Web-SCUMM, Open source point &amp; click engine"></p>

# web-scumm

**Faire un point-and-click pour le navigateur : l'écrire comme des données, le façonner dans un Studio visuel,
vérifier qu'on peut le finir, et le livrer comme un jeu web qui s'installe sur un téléphone et se joue hors ligne.**

*[English version](README.md)*

| | |
|---|---|
| 🎮 **Jouer** | [La Clé du garde-manger](https://wanoo.github.io/web-scumm/), le jeu d'exemple, sur téléphone en paysage ou sur ordinateur |
| 🛠 **Studio** | [Ouvrir le Studio](https://wanoo.github.io/web-scumm/studio.html) en mode démo : modifiez le jeu d'exemple, vos modifications restent dans votre navigateur |
| ⏱ **Commencer** | [Votre jeu dans son propre dossier](#commencer), puis [une première pièce en quinze minutes](docs/fr/TUTORIAL.md) |

![La Clé du garde-manger : le salon de Grand-mère, neuf verbes, le sac](docs/img/readme/4119-hero.webp)

## Commencer

<!-- install:begin -->
Node 22.12 ou plus récent et Python 3 avec Pillow (`npm run assets` prépare les images avec eux), sous Windows, macOS
ou Linux. Le moteur s'installe depuis l'archive d'une release (la
publication npm arrive dans une 4.2.x ultérieure) :

```bash
T=https://github.com/wanoo/web-scumm/releases/download/v4.2.2/web-scumm-4.2.2.tgz
npx --package=$T web-scumm create mon-jeu "Mon jeu" --engine=$T
cd mon-jeu && npm install
npm run assets && npm run dev        # y jouer ; puis npm run verify, npm run build
```
<!-- install:end -->

`npm run build` écrit `dist/`, un site statique que n'importe quel hébergement sert. ffmpeg sert au pipeline sonore
et reste optionnel ; `npx web-scumm doctor` dit ce qui manque. [PACKAGE](docs/fr/PACKAGE.md)
est le guide complet ; le [TUTORIAL](docs/fr/TUTORIAL.md) accompagne la première pièce.

## Fabriquer un jeu

**Le contenu, ce sont des données.** Pièces, accessoires à états, personnages, objets, règles, conversations,
indices, scripts et événements sont de simples objets TypeScript, sans code dedans : chaque outil peut les lire, les
vérifier et les jouer.

```ts
export const garden: RoomDef = {
  id: 'garden', name: 'The garden', decor: 'garden',
  props: { tank: { name: 'water tank', states: { full: 'tank_full', empty: 'tank_empty' } } },
  exits: { back_door: { name: 'back door', to: 'house', entry: 'garden' } },
  on: [
    { verb: 'use', a: 'pipe', b: 'tank', if: '!tank_drained',
      do: [{ minigame: 'pipes' }, { lose: 'pipe' }, { set: 'tank_drained' }, { prop: ['tank', 'empty'] }] },
  ],
  hints: [{ until: 'tank_drained', lines: ['Use the pipe on the water tank.'] }],
};
```

Une règle, c'est un verbe, une cible, une condition et une liste de commandes. Ce qu'un jeu demande au-delà, une
commande à lui, est du TypeScript propre au jeu : du code de confiance, nommé dans le jeu et pris dans son empreinte
([CONTENT_GUIDE](docs/fr/CONTENT_GUIDE.md), [ENGINE](docs/fr/ENGINE.md)). Des mécaniques célèbres du genre sont
écrites ainsi dans [CLASSICS](docs/fr/CLASSICS.md).

**Le Studio, c'est le vrai moteur avec un éditeur par-dessus** : les pièces et leurs placements, le storyboard case par
case, chaque planche de sprites et où elle sert, les vérifications après chaque sauvegarde, un onglet de jeu qui
explique une règle et rejoue une session, et des notes partagées avec un assistant IA ([STUDIO](docs/fr/STUDIO.md)).

<table>
<tr><td width="50%" valign="top"><img src="docs/img/readme/4119-studio-rooms.webp" alt="Studio, onglet Pièces : le garde-manger sélectionné, ses répliques et réactions modifiables" width="100%"><br><sub><b>Pièces</b> : le vrai moteur, un éditeur de placement par-dessus, chaque réplique modifiable sur place</sub></td><td width="50%" valign="top"><img src="docs/img/readme/4119-studio-check.webp" alt="Studio, onglet Vérifier : validateur, chemin du solveur et santé du solveur" width="100%"><br><sub><b>Vérifier</b> : le validateur et le solveur, relancés après chaque sauvegarde</sub></td></tr>
</table>

**Images, son et langues.** Un prompt pour chaque planche de sprites, objet et décor dans un seul style, des planches
découpées en sprites ([PROMPTS](docs/fr/PROMPTS.md)) ; une musique chiptune arrangée depuis un MIDI et des bruitages
tirés d'une même palette ([AUDIO](docs/fr/AUDIO.md)) ; chaque réplique traduisible, une traduction manquante trouvée
avant la release.

## Le prouver et le livrer

- **Validé** : les références cassées, les pièces inatteignables et les répliques non traduites sont trouvées avant
  que quiconque joue.
- **Résolu** : le solveur fait tourner le vrai moteur (pas de second modèle du contenu). `npm run verify` demande un
  **témoin**, un chemin vers une fin ; `npx web-scumm solve --prove` explore **chaque état atteignable** et échoue sur un blocage ou une
  recherche tronquée. Ce sont deux promesses différentes, et la release demande la seconde ([BENCH](docs/fr/BENCH.md)
  dit ce que la preuve peut et ne peut pas faire).
- **Rejoué** : une session est l'unité de reproduction ; les sauvegardes se chargent d'une version à l'autre, une
  sauvegarde figée par release depuis la 3.0.0.
- **Livré** : une PWA qui s'installe et se joue hors ligne après la première visite, ce qu'un téléphone doit
  télécharger tenu par un budget, chaque fichier compté avec sa licence.
- **Accessible autant qu'une machine peut le dire** : axe-core sur chaque écran, le jeu au clavier et au toucher en
  CI. Ce n'est pas une conformité WCAG : le lecteur d'écran et les vrais appareils sont des passes humaines
  ([FIELD](docs/fr/FIELD.md)).

<table>
<tr><td width="50%" valign="top"><img src="docs/img/readme/4119-player-scene.webp" alt="Parler à Grand-mère : ses sujets dans la colonne de côté" width="100%"><br><sub>Des conversations à sujets, à choix, avec un historique</sub></td><td width="50%" valign="top"><img src="docs/img/readme/4119-proof-graph.webp" alt="Le graphe des énigmes avec le chemin critique et la chaleur du solveur" width="100%"><br><sub>Le graphe des énigmes : où mène chaque objet et chaque drapeau, le chemin critique, la chaleur du solveur</sub></td></tr>
</table>

## Plus loin

- **Plusieurs personnages jouables**, une carte du monde, des mini-jeux au toucher ou au clavier, des cinématiques et
  des coups de téléphone, l'autosauvegarde et des emplacements.
- **Remix** : des mondes générés depuis une graine, chacun validé et résolu avant d'être livré ([REMIX](docs/fr/REMIX.md)).
- **Speedrun** : des runs enregistrées, scellées et vérifiées par un rejeu ; des classements sur le Bridge.
- **Reality** : un jeu réagit à un fait du monde (un email reçu, une commande de terminal, un badge) par un signal
  signé venu d'un Bridge, sans que son contenu touche au réseau ([REALITY](docs/fr/REALITY.md),
  [REALITY-OPS](docs/fr/REALITY-OPS.md)).

<table>
<tr><td width="50%" valign="top"><img src="docs/img/readme/4119-player-minigame.webp" alt="Le mini-jeu des tuyaux : des tuiles à tourner entre une cuve d’eau et les champignons" width="100%"><br><sub>Un mini-jeu, joué au toucher ou au clavier</sub></td><td width="50%" valign="top"><img src="docs/img/readme/4119-player-map.webp" alt="La carte du monde : Grand-mère et Grand-père épinglés dessus, les lieux où aller dans la colonne de côté" width="100%"><br><sub>La carte du monde, les personnages là où ils sont</sub></td></tr>
</table>

## Ce qui est stable

Chaque surface n'est promise qu'aussi loin que ses preuves ([SUPPORT](docs/fr/SUPPORT.md), [GO / NO-GO 4.2](docs/dev/GO-NO-GO-4.2.md)) :

| Stable | Limité | Expérimental |
|---|---|---|
| le format du contenu et ses outils ; la PWA Chromium sur ordinateur ; le Bridge Reality sur SQLite | le lecteur DOM sur téléphone et au lecteur d'écran (pas encore essayé par une personne) ; la PWA Safari ; Firefox (la PWA seulement) ; speedrun et Remix ; les voix ; les quatre archives de packages (jusqu'à ce qu'une personne les installe) | le peintre Canvas ; le Bridge sur Postgres (`distributed`) ; les quatre connecteurs |

Ce que seuls des humains et de vrais appareils peuvent vérifier est listé, pas affirmé : [FIELD](docs/fr/FIELD.md), et
les notes de chaque release disent quelles passes ont été faites.

## Comment c'est fait

```
src/engine/      core (le DSL, le moteur), tools (validate, solve, lint, i18n…), dom (le lecteur), minigames, reality
games/demo/      le jeu d'exemple : pièces, mises en page, images, son, langues, storyboard
games/_template/ copié par npm run new-game
tools/           les commandes, le Studio, le serveur MCP, les pipelines d'image et de son, les plugins Vite
bridge/          le Bridge Reality (le package web-scumm-bridge)
connectors/      les connecteurs du monde extérieur (le package web-scumm-connectors)
docs/en docs/fr  la documentation ; docs/dev : le journal de travail, les décisions, les passes de chaque release
```

Le moteur, le solveur et le rejeu partagent un seul chemin de code ; [ARCHITECTURE](docs/fr/ARCHITECTURE.md) et une
[visite du code](docs/fr/CODE_TOUR.md) d'une demi-heure expliquent comment tout s'assemble.

**Fait avec un assistant IA, relu par des personnes.** Le contenu est déclaratif : un assistant le lit et l'écrit
comme n'importe quel fichier (`AGENTS.md` en donne les règles) ; chaque opération est une commande et un outil MCP
([MCP](docs/fr/MCP.md)) ; après chaque changement il peut valider, résoudre, rejouer et faire une capture, et voit ses
erreurs avant qu'une personne les voie. Chaque résultat reste relisible, dans le Studio et dans Git.
[CONTRIBUTING](CONTRIBUTING.md) dit comment le modifier.

## En chiffres

Mesuré sur ce commit de `main` par les vérifications automatiques (`npm run quality:baseline` écrit ces chiffres) :
<!-- metric:tests -->2666<!-- /metric --> déclarations de tests unitaires, sous Node 22 et 24, avec des planchers de
couverture et des tests de mutation bloquants ; le jeu de référence prouvé en <!-- metric:referenceStates -->288<!-- /metric -->
états ; la première visite du joueur, <!-- metric:initialJsKB -->133<!-- /metric --> Ko de JavaScript compressé. Chaque
release est construite depuis le commit que son candidat a testé. Le candidat produit les quatre archives de packages,
l'image du Bridge, les SBOM, les parties enregistrées et la baseline, et la release publie ces fichiers mêmes ; la
release ne produit que le jeu construit, son manifeste d'assets, les catalogues Remix prouvés, le speedrun de référence
et les sommes, depuis le même commit. Chaque fichier est publié avec sa somme SHA-256 et une attestation de provenance
([la liste](tools/release/artifacts.mjs)).

## Documentation

Chaque page existe en anglais (`docs/en/`) et en français (`docs/fr/`), et un test garde les deux alignées : le
[TUTORIAL](docs/fr/TUTORIAL.md), le [WORKFLOW](docs/fr/WORKFLOW.md) de la première idée à la release, chaque commande
dans [TOOLS](docs/fr/TOOLS.md), ce qui change dans le [CHANGELOG](CHANGELOG.md), passer à une nouvelle version dans
[UPGRADING](docs/fr/UPGRADING.md), et d'où vient le projet dans la [ROADMAP](docs/fr/ROADMAP.md).

Release actuelle : [v4.2.2 « Playable Workshop »](https://github.com/wanoo/web-scumm/releases/tag/v4.2.2), le Studio en
ligne pour une équipe, expérimental ([STUDIO-SERVER](docs/fr/STUDIO-SERVER.md)) : prévisualisations par révision,
santé, annulation personnelle, builds publiés, sauvegarde et restauration du serveur ; sur la 4.2.0 « Stable World ». La
4.2.0 a rétabli le SemVer strict après la ligne d'incubation 4.1.x : une mineure ajoute, une majeure retire ; l'API
publique le suit ([SUPPORT](docs/fr/SUPPORT.md)). La 4.2.0 est sortie avant les passes humaines : des surfaces
ci-dessus, seule la colonne Stable est promise ; les passes se font sur une 4.2.x, qui promeut ce qu'elles prouvent
([GO / NO-GO 4.2](docs/dev/GO-NO-GO-4.2.md), D38).

## Licences

Code : MIT. Images, bruitages et thème du jeu d'exemple : CC BY 4.0 (attribution « Wano ») ; le thème est le *Lac des
cygnes* de Tchaïkovski (domaine public), transcrit et arrangé pour le projet. Polices : SIL OFL. Voir `CREDITS.md`.

web-scumm est un projet indépendant. « Façon SCUMM » désigne un genre de jeu ; le projet n'est ni affilié à, ni
approuvé par, ni dérivé de LucasArts, Lucasfilm, Disney ou du projet ScummVM, et n'en livre ni code, ni données, ni
images.
