# Référence du paquet

Ce que contiennent les paquets npm du moteur, les commandes que le paquet `@quest-n-click/engine` donne à un projet de jeu, et
comment chaque release les vérifie. `scripts/pack.mjs` les fabrique depuis les fichiers que git suit ; leur
installation est décrite dans [Installer depuis l'archive de la release](install.from-archive.md).

<a name="overview"></a>

## Le moteur en paquet

Depuis la 3.9, un jeu n'a plus à vivre dans le dépôt du moteur. Le moteur est empaqueté en `@quest-n-click/engine`
(le moteur, ses pages, ses outils et la commande `quest-n-click`, le modèle de jeu), `@quest-n-click/create`
(`npm init @quest-n-click`) et, depuis la 4.1.1, `@quest-n-click/bridge` (le Reality Bridge de référence). Depuis la
4.1.9, les connecteurs forment un quatrième paquet, `@quest-n-click/connectors`, et depuis la 4.2.1 le Studio hébergé
un cinquième, `@quest-n-click/studio-server`.

À partir de la 4.5.2, les paquets sont nommés sous le scope de l'organisation npm, `@quest-n-click/…`, pour que
l'organisation les possède (D53). De la 4.2.5 à la 4.5.1, ils s'appelaient `quest-n-click`, `create-quest-n-click`,
`quest-n-click-bridge`, `quest-n-click-connectors` et `quest-n-click-studio-server`. Les commandes gardent ces noms
(`quest-n-click dev`, `npx quest-n-click-bridge serve`), et les archives jointes à une release aussi
(`quest-n-click-<version>.tgz`, `create-quest-n-click-<version>.tgz`, …). `npx quest-n-click migrate` déplace les
imports d'un jeu (`quest-n-click/content` devient `@quest-n-click/engine/content`), son `tsconfig.json` et ses
dépendances ([Notes de mise à jour : 4.5](install.upgrade-notes-4-5.md#from-4-5-1-to-4-5-2)).

Jusqu'à la 4.2.4, ils s'appelaient `web-scumm`, `create-web-scumm`, `web-scumm-bridge`, `web-scumm-connectors` et
`web-scumm-studio-server` (le projet s'appelait web-scumm, D47). Pendant toute la 4.2.x, chaque release les livrait
aussi sous leurs anciens noms, et les anciennes commandes et les anciens imports (`web-scumm dev`,
`web-scumm/content`) marchaient encore, après une ligne d'avertissement. La 4.3.0 les retire :
`npx quest-n-click migrate` renomme ce qu'un jeu dit encore ([Venir de web-scumm](install.from-web-scumm.md)).

Les cinq sont sur npm depuis la 4.5.2, et chaque release les joint aussi sous forme d'archives
([Installer depuis npm](install.from-npm.md)).

<a name="quest-n-click"></a>

## `@quest-n-click/engine`

L'archive `quest-n-click-<version>.tgz`.

### Contenu

Les fichiers suivis sous `src/`, `tools/`, `studio-server/`, `cli/`, `games/_template/`, `public/icons/`,
`public/fonts/`, `public/og.png`, les fichiers de stockage et de migrations que le journal du Studio partage avec le
Bridge (`bridge/src/store*.ts`, `migrations.ts`, `allowlist.ts`), `index.html`, `studio.html`, `vite.config.ts`,
`tsconfig.json`, `requirements.txt` et `LICENSE`. Jamais un jeu du dépôt, un
test, une page de documentation source ni un build. Laissés aussi hors de `tools/` : l'audit des assets, la
vérification croisée et les jeux de données du Bridge, le harnais de fuzz des connecteurs.

### Points d'entrée

La commande `quest-n-click` (`cli/quest-n-click.mjs`), et cinq entrées publiques : `@quest-n-click/engine/content`, `/player`,
`/minigames`, `/testing`, `/reality` ([API publique](engine.api.md)), plus `@quest-n-click/engine/cli/*`. Tout le reste est
interne.

### Dépendances

Les dépendances d'exécution du moteur (`earcut`, `howler`, `navmesh`, `zod`) et ce dont les outils ont besoin dans un
projet de jeu : Vite et `vite-plugin-pwa`, `tsx`, `@typescript/typescript6` (l'API du compilateur qu'utilisent les
outils), `@types/node`, `@types/howler`, Tweakpane, le SDK MCP. Les tests et Playwright restent dehors : c'est pourquoi
`quest-n-click doctor` demande un contournement dans un projet créé ([doctor](install.doctor.md#in-created-project)).
Le paquet ne porte pas de verrou : npm résout ces plages à l'installation.

<a name="docs-bundle"></a>
<!-- applies: .. since 4.5.0 -->

### Sa documentation, `docs-bundle/`

Depuis la 4.5.0, le paquet porte la documentation de sa version, écrite par `npm run wiki -- bundle` dans le dossier
préparé avant `npm pack` (jamais commitée) : `index.json`, `md/<lang>/<id>.md`, `legacy/<NAME>.md`, `assets/` et
`bundle-manifest.json` avec le sha256 de chaque fichier. Deux empaquetages d'un même commit donnent les mêmes octets.
Le serveur MCP d'un projet créé la lit (`read_doc`, `search_docs`, `list_docs`).

<a name="create-quest-n-click"></a>

## `@quest-n-click/create`

L'archive `create-quest-n-click-<version>.tgz`. Un seul fichier, `index.mjs`, la commande `create-quest-n-click`, qui
lance `quest-n-click create` depuis le moteur dont il dépend (`@quest-n-click/engine` à la même version) :
`npm init @quest-n-click my-game "Mon jeu"` une fois sur npm (ou `npx @quest-n-click/create my-game "Mon jeu"`).
`npx create-quest-n-click my-game` marche toujours et lance la même chose : le `create-quest-n-click` sans scope est un
relais, publié sur le compte d'un mainteneur, dont la commande importe `@quest-n-click/create/index.mjs`. Ce paquet
garde donc `index.mjs` à sa racine et aucune carte `exports`.

<a name="quest-n-click-bridge"></a>

## `@quest-n-click/bridge`

L'archive `quest-n-click-bridge-<version>.tgz`. Le Reality Bridge de référence, seul : `bridge/src` regroupé par esbuild en un seul module (`src/cli.mjs`, compilé
depuis la 4.1.2, il tourne donc avec Node seul), ses politiques Datalog et ses migrations SQL, la commande
`quest-n-click-bridge` (`init`, `serve`, `grant`, `rotate`, `revoke`, `doctor`, `compact`, `migrate`, `tenant`,
`backup`, `restore`). Le WebAssembly de Biscuit et zod sont des dépendances ; `pg` et OpenTelemetry ne sont chargés par
leur nom que s'ils servent. Il porte son `npm-shrinkwrap.json` (depuis la 4.1.19) : une installation ne résout rien.
[La CLI du Bridge](bridge.cli.md).

<a name="quest-n-click-connectors"></a>

## `@quest-n-click/connectors`

L'archive `quest-n-click-connectors-<version>.tgz`. Le SDK des connecteurs, la commande `quest-n-click-connector <email|telnet|ssh|open-badge> --config <fichier.json>` et
les quatre connecteurs regroupés en un module, avec le worker du lecteur MIME à côté ; `ssh2` est une dépendance. Un
paquet d'opérateur, qui tourne à côté d'un Bridge, jamais celui d'un jeu. Installez-le sans code natif :
`npm install --omit=optional --ignore-scripts quest-n-click-connectors-<version>.tgz`. Il porte son
`npm-shrinkwrap.json`. Expérimental (4.1.9). [Les connecteurs](bridge.connectors.md).

<a name="quest-n-click-studio-server"></a>

## `@quest-n-click/studio-server`

L'archive `quest-n-click-studio-server-<version>.tgz`. Les commandes `quest-n-click-studio-server` et
`quest-n-click-studio-worker`, qui font tourner le serveur et l'application de traitement du moteur installé à côté
(`@quest-n-click/engine`, un pair optionnel : la même version, sinon elles s'arrêtent sur
`… runs with @quest-n-click/engine <v>, not <w>`), et la page du Studio construite une fois. Ses propres dépendances sont
verrouillées dans son `npm-shrinkwrap.json` ; installé depuis le fichier d'archive plutôt que depuis le registre, npm
les résout depuis leurs plages (`quest-n-click-studio-server deps` dit lesquelles).
[Installer depuis l'archive de la release](install.from-archive.md#other-archives).

<a name="commands"></a>

## Les commandes d'un projet créé

`npx quest-n-click help` les liste. Le `package.json` du projet nomme les habituelles comme scripts npm (`dev`,
`studio`, `assets`, `verify`, `build`, `release`, `preview`) :

| Commande | Quoi |
|---|---|
| `quest-n-click dev` / `studio` | le jeu, le Studio |
| `quest-n-click assets` | l'art et l'audio vers `public/assets` |
| `quest-n-click verify` | validation, solveur, traductions, lint, playtests |
| `quest-n-click doctor` | les prérequis : Node et Chromium requis ; Python, ffmpeg et WebKit optionnels, signalés s'ils manquent (4.1.6) ; demande un contournement dans un projet créé ([doctor](install.doctor.md#in-created-project)) |
| `quest-n-click mcp` | le serveur MCP de ce jeu, sur stdio, pour un assistant (4.1.6) |
| `quest-n-click build` | assets, verify, le build, chaque fichier de `dist/` justifié |
| `quest-n-click release [--commercial]` | build, puis les portes de release : verrou de provenance, budgets, traductions, voix, playtests stricts, la preuve |
| `quest-n-click validate`, `solve`, `lint`, `i18n`, `weight`, `provenance`, `playtests`, `voices`, `prompts`, `ids` | chaque outil, avec ses options |
| `quest-n-click speedrun verify <run.wsrun>` | un speedrun rejoué contre le jeu : son verdict, son code et sa raison |
| `quest-n-click bridge`, `solve-reality` | un Bridge de référence pour le jeu ; un jeu à `reality.signals` prouvé fermé |
| `quest-n-click preview` | sert `dist/` en local |
| `quest-n-click create <dossier> ["Titre"] [--engine=<spec>]` | un nouveau projet de jeu depuis le modèle |
| `quest-n-click migrate` | amène les sources du jeu au format du moteur installé ([Mettre à jour](install.upgrade.md)) |

Elles tournent avec le projet comme dossier de travail
([`WEB_SCUMM_PROJECT`](reference.environment-variables.md#web-scumm-project)) : le moteur dans
`node_modules/@quest-n-click/engine` est lu, jamais écrit. Toutes les options sont dans [Ligne de commande](reference.cli.md).

<a name="how-it-is-checked"></a>

## Comment c'est vérifié

- `npm run fresh-install` (un job de CI, quand un paquet, le modèle ou un chemin d'écriture a changé) : empaquette le
  moteur (`npm run pack`), crée un jeu depuis le modèle empaqueté dans un dossier vide hors du dépôt, installe
  l'archive, lance `assets`, `verify` et `build`, et joue le jeu jusqu'à sa fin dans Chromium. Un fichier du nouveau
  projet qui nomme le dépôt le fait échouer.
- `npm run external-consumer` (chaque candidat de release, sous Ubuntu, macOS et Windows) : les archives du candidat
  lui-même, jamais réempaquetées, installées hors du dépôt : un jeu créé sur une release plus ancienne et passé à
  elles, une ancienne sauvegarde jouée jusqu'à la fin, le bundle de documentation vérifié contre son manifeste et lu
  par un vrai client MCP, `@quest-n-click/create`, le Bridge et les connecteurs depuis leurs archives.
- `npm run readme-quickstart` : le démarrage rapide du README, lancé comme un lecteur le copie.
- `npm run upgrade-check -- --from=<version>` : un jeu passé d'une release plus ancienne à celle-ci.
- `scripts/studio-install-smoke.mjs` : les archives du moteur et du Studio Server installées ensemble, un jeu servi.

Chaque release joint les cinq archives avec leurs SBOM et leurs sommes. Les publier sur npm revient aux mainteneurs
(l'organisation `quest-n-click` possède les cinq noms à scope ; à partir de la 4.5.2 la CI les met en scène, un
propriétaire approuve avec sa 2FA, et la 4.5.2 a été la première publiée) :
[Paquets npm](contribute.npm-packages.md).

<a name="related"></a>

## Identifiants liés

- `npm run pack` (`node scripts/pack.mjs [--out=<dossier>] [--publish-dry-run] [--build-id <id>] [--allow-dirty]`),
  qui écrit par défaut dans `.cache/pack`
- `npm run locks` (les verrous du Bridge et des connecteurs, `scripts/locks/` ; un verrou qui ne correspond plus
  arrête `pack`)
- [Installer depuis l'archive de la release](install.from-archive.md), [Ligne de commande](reference.cli.md),
  [Paquets npm](contribute.npm-packages.md)
- [`scripts/pack.mjs`](../../scripts/pack.mjs), [`scripts/fresh-install.mjs`](../../scripts/fresh-install.mjs),
  [`scripts/external-consumer.mjs`](../../scripts/external-consumer.mjs)
