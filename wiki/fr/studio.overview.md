# Le Studio local : présentation et lancement

Le Studio est une page du serveur de dev où l'on modifie un jeu avec le vrai moteur sous les yeux : ce qu'on voit est
ce que les joueurs auront. Cette page le lance, sur votre ordinateur ou sur votre téléphone, et fait le tour de ses
onglets.

<a name="overview"></a>

## Ce qu'est le Studio

`npm run studio` démarre le serveur de dev et ouvre le Studio à `http://localhost:5173/__studio/`. Rien ne quitte la
machine : chaque changement est écrit dans des fichiers sous `games/<id>/` (dans un projet créé, sous `game/`), les
mêmes qu'un assistant IA ou un collègue modifie avec git. Le lieu qu'on modifie est dessiné par le moteur lui-même
(`src/engine/dom`) : un changement apparaît comme le jeu l'affichera.

Le Studio est une seule page, `studio.html` (point d'entrée [`src/studio/main.ts`](../../src/studio/main.ts)). Tout
serveur de dev du dépôt la sert à `/__studio/`, `npm run dev` aussi ; `npm run studio` l'ouvre en plus dans le
navigateur. Un build de production ne l'inclut pas, sauf s'il est construit exprès comme démo statique
([Mode démo](studio.demo-mode.md)).

Pour mettre le Studio d'un jeu en ligne pour une équipe (connexions, rôles, plusieurs personnes à la fois), c'est le
Studio hébergé : [Ce qui tourne où](team.what-runs-where.md).

> [!LIMIT id=one-person]
> Le Studio local sert à une personne sur une machine. Il n'a ni comptes, ni rôles, ni verrous : deux personnes qui
> modifient les mêmes fichiers en même temps passent par git, pas par le Studio.

<a name="what-you-will-build"></a>

## Ce que vous obtiendrez

Le Studio ouvert sur le jeu de démo (ou le vôtre), l'onglet Rooms montrant un lieu avec son éditeur de placement, et,
si vous le voulez, le même Studio sur votre téléphone par le réseau local.

<a name="what-you-need"></a>

## Ce qu'il vous faut

- Node 22.12 ou plus, et le dépôt installé avec `npm install` ([Installer depuis le dépôt](install.from-repository.md)),
  ou un projet créé ([Votre premier jeu](create.first-game.md)).
- Les assets préparés du jeu (`npm run assets`), pour que les lieux soient dessinés avec leurs images.
- Pour les captures d'écran et les captures avant/après seulement : Playwright et son Chromium
  ([doctor](install.doctor.md)).

<a name="steps"></a>

## Étapes

<!-- step: start -->
1. Lancez le Studio.

   ```sh
   # dans le dépôt du moteur
   npm run studio
   ```

   ```sh
   # ou dans un projet créé
   npm run studio
   ```

   Dans le dépôt du moteur, le jeu est `GAME=<id>` si vous le posez, sinon le dernier jeu choisi avec
   `npm run game`, sinon `config.game` de `package.json`, sinon `demo`. Un dossier de jeu sans `index.ts` arrête le
   démarrage avec `✖  games/<id>/index.ts not found (GAME=<id>)`. Le navigateur s'ouvre sur `/__studio/`, onglet Rooms.

<!-- step: pick-a-room -->
2. Choisissez un lieu dans l'onglet Rooms. Le lieu est dessiné par le moteur, l'éditeur de placement par-dessus, et la
   liste de ses accessoires, acteurs et zones cliquables à droite. Sélectionnez-en un pour ouvrir sa fiche
   ([Modifier une salle](studio.edit-room.md)).

<!-- step: lan -->
3. Pour travailler depuis un téléphone ou une tablette sur le même réseau, arrêtez le Studio et relancez-le en mode
   réseau local.

   ```sh
   # dans le dépôt du moteur
   npm run studio:lan
   ```

   La commande affiche un jeton valable pour cette session et l'adresse du Studio qui le porte :

   ```text
   LAN write access is protected by this one-session token:
     <jeton>
   Studio: http://<adresse de la machine>:5173/__studio/?token=<jeton>
   Layout editor: http://<adresse de la machine>:5173/?edit=<lieu>&token=<jeton>
   ```

   Ouvrez cette adresse sur le téléphone. Un nouveau jeton est tiré à chaque démarrage, sauf si vous posez vous-même
   `WEB_SCUMM_STUDIO_TOKEN`. Pourquoi ce jeton, et ce qu'il protège : [Sécurité en local et en réseau local](studio.security.md).

> [!LIMIT id=lan-engine-repo]
> `npm run studio:lan` et `npm run dev:lan` sont des scripts du dépôt du moteur. Un projet créé n'a pas encore de
> script réseau local ; [Tester sur un téléphone en réseau local](create.lan-testing.md) dit comment s'en passer.

<a name="layout"></a>

## Les onglets

Les onglets, dans l'ordre de la barre. L'URL garde l'onglet (`#check`, ou `#rooms/<lieu>` pour un lieu) : un
rechargement revient là où vous étiez.

| Onglet | Ce qu'il fait | Page |
|---|---|---|
| **Rooms** (par défaut) | Le lieu dessiné par le moteur avec l'éditeur de placement par-dessus ; les fiches des accessoires, acteurs et zones cliquables : lignes de Regarder, réactions, sujets de conversation, timeline des scripts ; des formulaires pour les valeurs structurées et la scène | [Modifier une salle](studio.edit-room.md), [Placement et scène](studio.placement.md) |
| **Storyboard** | L'éditeur de `storyboard.json`, chaque case dessinée comme une vignette, avec sa couverture par le contenu | [Storyboard](studio.storyboard.md) |
| **Map** | Les regroupements du scénario (chapitres, énigmes, personnages) et ce qu'aucun regroupement ne nomme encore | [Carte](studio.map.md) |
| **Assets** | Chaque image et chaque son, où il sert, son prompt, les envois et la découpe des planches | [Assets et découpe](studio.assets.md) |
| **Voices** | Le tableau d'enregistrement des voix par langue, et la matrice héros × langues | [Voix et matrice héros × langues](studio.voices-matrix.md) |
| **Music** | Les partitions du jeu par son propre directeur musical | [Musique](studio.music.md) |
| **Check** | Validateur, solveur, carte du monde, graphe de puzzles, lint, playtests, couverture du storyboard, changements entre révisions | [Vérifier](studio.check.md), [Diff sémantique](studio.semantic-diff.md), [Captures avant et après](studio.captures.md) |
| **Play** | Le jeu dans un cadre avec son état en direct, l'explication des règles, le journal, les sessions à exporter et rejouer | [Jouer et rejouer une session](studio.sessions.md), [Explication des règles](studio.rule-explainer.md) |
| **Language** | Les objectifs avec leurs formulaires, et l'IR du jeu | [Langue et objectifs](studio.language-objectives.md) |
| **Remix** | Seeds, dimensions, mondes comparés, couverture et biais | [Remix dans le Studio](studio.remix.md) |
| **Notes** | Le journal partagé avec l'IA et vos collègues | [Notes](studio.notes.md) |

À côté des onglets : **Undo** et **Redo** dans l'en-tête (Ctrl/Cmd+Z, Maj pour rétablir) sur toutes les écritures
de la session ([Aperçu, application, annulation](studio.preview-apply.md)), et le bouton **Assistant** (ou la touche
`a` quand aucun champ n'a le focus), une conversation avec le modèle de votre choix, qui a les mêmes outils que le
serveur MCP ([L'Assistant](studio.assistant.md)).

Le Studio suit les fichiers : quand une IA, un éditeur ou git change un fichier du jeu, il recharge ce que ce fichier
touche et garde ce que vous êtes en train de taper. La page du Studio ignore les rechargements complets de Vite causés
par les fichiers du jeu (la vue du moteur, elle, se recharge).

<a name="what-you-learned"></a>

## Ce que vous avez appris

- `npm run studio` ouvre le Studio ; `npm run studio:lan` l'ouvre à votre réseau derrière un jeton
  ([Sécurité en local et en réseau local](studio.security.md)).
- Chaque modification est un fichier du jeu, écrit d'un bloc et annulable ([Aperçu, application, annulation](studio.preview-apply.md)).
- N'importe quelle IA peut travailler sur les mêmes fichiers à côté de vous ([MCP local : configurer chaque client](studio.mcp-setup.md)).

<a name="next"></a>

## Pour aller plus loin

- [Modifier une salle](studio.edit-room.md), puis [Vérifier](studio.check.md).
- [Dépannage du Studio](studio.troubleshooting.md) quand le Studio refuse quelque chose.
