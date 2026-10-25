# Formats de fichiers

Les fichiers que le moteur et ses outils écrivent et lisent : une sauvegarde, une session, une preuve de speedrun
(`.wsrun`), le storyboard, les regroupements de la carte, les notes, et les manifestes qu'écrit un build. Pour chacun :
son schéma, un exemple minimal, ce qui est refusé, les anciennes versions qu'il lit encore, et ce que devient un champ
qu'il ne connaît pas. Tout ici est lu dans le code de la version à laquelle s'applique la page ; chaque section nomme
son fichier source.

Plusieurs formats portent encore l'identifiant de l'ancien nom du projet, `web-scumm` (`web-scumm-save`,
`web-scumm-session`, `web-scumm-speedrun`, `web-scumm-reality-manifest`). C'est voulu : les sauvegardes, sessions et
runs existants continuent de se charger après le renommage (décision D47). Ce n'est pas le signe d'un vieux fichier.

<a name="save"></a>
<!-- applies: .. since 3.0.0 -->

## Sauvegarde (`web-scumm-save`)

Ce que garde une sauvegarde : l'état du jeu, dans une enveloppe qui dit à quel jeu, à quelle version de sauvegarde et
à quel monde il appartient. L'autosauvegarde, les emplacements manuels et le fichier exporté contiennent tous la même
enveloppe. Source : [`src/engine/core/save.ts`](../../src/engine/core/save.ts), migrations dans
[`src/engine/core/migrate.ts`](../../src/engine/core/migrate.ts).

**Schéma (enveloppe de schéma 4, écrite depuis la 4.1.15).**

| Champ | Type | Sens |
|---|---|---|
| `format` | `"web-scumm-save"` | L'identifiant du format. |
| `schema` | `4` | La version de l'enveloppe. `3` se lit encore (plus bas). |
| `gameId` | chaîne non vide | L'`id` du jeu. |
| `gameSaveVersion` | entier ≥ 0 | Le `saveVersion` du jeu au moment de la sauvegarde. Doit valoir `state.v`. |
| `savedAt` | nombre | Quand elle a été faite, en millisecondes epoch. |
| `state` | objet | L'état du jeu (`GameState`, plus bas). |
| `variant` | objet | Le monde où la partie s'est jouée (`WorldVariant`) : `seed` (1 à 64 caractères), `algorithm`, `algorithmVersion` (entier > 0), `manifestHash` (64 caractères au plus), `mode` (1 à 64 caractères, `story` pour le jeu tel qu'écrit), `assignments` (la valeur prise par chaque dimension Remix), `hash` (64 chiffres hexadécimaux). |

L'état (`GameState`) exige `v` (sa version de sauvegarde), `room` (la salle courante), `inventory`, `flags` (valeurs
booléennes, numériques ou textuelles), `props`, `actors`, `hero` (la position du héros par salle), `unlocked`,
`visited`, `counters`, `seen` et `started`. Il peut contenir `used`, `where` (où est chaque personnage), `scripts`,
`camera`, `active` (le joueur actif), `players`, `done`, `music` et `reality` (le curseur du Reality Bridge, voir
[Les signaux Reality dans la session et la sauvegarde](#session-reality)).

**Exemple minimal** (une sauvegarde du jeu `demo`, monde de l'histoire ; abrégée depuis
[`tests/fixtures/saves/demo-4.2.0.json`](../../tests/fixtures/saves/demo-4.2.0.json), où `hash` et `manifestHash`
sont réels) :

```json
{
  "format": "web-scumm-save",
  "schema": 4,
  "gameId": "demo",
  "gameSaveVersion": 2,
  "savedAt": 1792022400000,
  "state": {
    "v": 2,
    "room": "garden",
    "inventory": ["pipe"],
    "flags": { "pipe_taken": true },
    "props": { "house.pantry": "locked" },
    "actors": {},
    "hero": { "garden": [320, 360] },
    "unlocked": ["house", "garden"],
    "visited": { "house": 1, "garden": 1 },
    "counters": {},
    "seen": {},
    "started": 1792029074445
  },
  "variant": {
    "seed": "story",
    "algorithm": "web-scumm-remix-1",
    "algorithmVersion": 1,
    "manifestHash": "<64 hex digits>",
    "mode": "story",
    "assignments": {},
    "hash": "<64 hex digits>"
  }
}
```

**Contraintes, dans l'ordre où `parseSave` les vérifie.**

- La forme de l'enveloppe (son schéma zod). Un champ absent ou du mauvais type fait refuser la sauvegarde.
- `gameId` est celui de ce jeu : sinon « save belongs to game "…", not "…" ».
- `gameSaveVersion` vaut `state.v` : sinon « save envelope and state versions disagree ».
- Le monde. Une sauvegarde de l'histoire se charge dans le monde de l'histoire, quel que soit le hash du manifeste
  Remix ; toute autre ne se charge que dans le monde dont elle donne le `hash`. Sinon le chargement lève
  `SaveWorldMismatch`, qui porte le monde sauvegardé : le joueur reconstruit ce monde-là depuis son affectation
  gardée (`applyVariant`) et recharge. Rien n'est régénéré depuis la graine.
- La version de l'état. Une sauvegarde plus ancienne que le `saveVersion` du jeu passe par les `migrations` du jeu, une
  étape par version (renommages et suppressions de flags, objets, salles, props, acteurs, lieux, compteurs, répliques
  vues, scripts, personnages, joueurs). S'il manque une étape, ou si la sauvegarde est plus récente que le jeu, le
  chargement échoue avec « save version N cannot be migrated to M ».
- Les références nécessaires pour reprendre. Une salle courante inconnue (« state.room: unknown current room ») ou un
  joueur actif inconnu (« state.active: unknown active player ») fait refuser la sauvegarde.
- Les autres références sont élaguées, pas refusées : un objet, un lieu, un état de prop, un acteur, un script ou la
  salle d'un personnage que le contenu n'a plus est retiré (un personnage revient dans sa salle d'origine, un joueur
  dans sa salle de départ), et un seul avertissement les liste tous : « save adjusted after a content update: … ». Une
  mise à jour ordinaire du contenu ne casse donc pas « Continuer ».

**Compatibilité.**

- L'enveloppe de schéma 3 (jusqu'à la 4.1.14 : les mêmes champs sans `variant`) se lit comme une sauvegarde du monde de
  l'histoire. Chargée dans un jeu qui tourne dans un autre monde, elle lève `SaveWorldMismatch` avec le monde de
  l'histoire.
- Un état nu, sans enveloppe (le format v2), se lit aussi, avec les mêmes vérifications.
- Une sauvegarde par version, de la 3.0.0 à la 4.4.0, est gardée dans
  [`tests/fixtures/saves/`](../../tests/fixtures/saves/) (`demo-<version>.json`). Le test
  [`tests/save-v3.test.ts`](../../tests/save-v3.test.ts) charge chacune sur le moteur actuel, la migre et la joue
  jusqu'à la fin.

**Champs inconnus.** L'enveloppe est stricte : un champ qu'elle ne connaît pas fait refuser toute la sauvegarde.
L'état ne l'est pas : un champ inconnu est accepté et laissé dans l'état, pour qu'une sauvegarde d'un moteur plus
récent puisse encore s'importer. La partie `reality` de l'état redevient stricte (`playerId`, `cursor`, `applied`
seulement).

> [!GUARANTEE id=save-foreign-game-refused]
> Une sauvegarde d'un autre jeu, un état de mauvaise forme ou un état dont la salle courante n'existe pas est refusé,
> et la partie en cours reste telle quelle. Le test couvre ces trois cas ; les autres refus ci-dessus sont lus dans le
> code.

<a name="save-storage"></a>
<!-- applies: .. since 3.0.0 -->

## Où vivent les sauvegardes, et ce que dit chaque opération

Source : [`src/engine/dom/save-store.ts`](../../src/engine/dom/save-store.ts).

- **Dans le navigateur.** Base IndexedDB `web-scumm-saves`, magasin d'objets `slots`. L'autosauvegarde est la clé
  `<gameId>:auto` (l'enveloppe). Un emplacement manuel est la clé `<gameId>:slot:<n>`, qui contient un enregistrement
  `{ meta, envelope }` : `meta` est ce qu'affiche le menu (`at`, `room`, `roomName`, `v`, et depuis la 4.2.2
  `revision` : `{ rev, fingerprint }`, la révision et l'empreinte du contenu où la sauvegarde a été faite, ADR 0026).
  Un emplacement v2, `{ meta, state }`, se lit encore.
- **Chaque écriture est relue et vérifiée.** Un navigateur sans IndexedDB (fenêtre privée, profil verrouillé) reçoit
  à la place le stockage localStorage (`<gameId>.save`, `<gameId>.slot.<n>`, vérifié de la même façon), annoncé une
  fois au joueur.
- **Les sauvegardes localStorage de la v2** (`<gameId>.save`, `<gameId>.slot.<n>`) sont copiées une fois dans
  IndexedDB, et chacune n'est supprimée qu'une fois sa copie vérifiée.
- **Chaque opération dit ce qu'elle a fait.** `save()` signale une écriture refusée par le rappel d'échec du stockage,
  et `whenIdle()` rejette. `clear()` et `clearSlot()` rendent `false` quand le navigateur a refusé la suppression : la
  sauvegarde est toujours là, et la page continue de la montrer. Le jeu en tient compte : « Recommencer » garde la
  partie en cours quand l'autosauvegarde ne peut pas être effacée ; « Nouvelle partie » depuis le titre reprend plutôt
  la partie sauvegardée ; un import de fichier ne charge jamais par-dessus la partie en cours quand sa copie dans un
  emplacement libre a été refusée. Chaque cas affiche le message `ui.saveFailed`.
- **Le fichier exporté.** L'export du menu de sauvegarde écrit `<gameId>-save.json` : l'enveloppe, avec la musique
  qui joue à ce moment-là. L'importer la vérifie comme ci-dessus, puis la copie dans le premier emplacement libre pour
  que la prochaine autosauvegarde ne la perde pas.

Comment c'est testé : écritures et suppressions refusées avec un IndexedDB factice
([`tests/save-store.test.ts`](../../tests/save-store.test.ts)) ; les sauvegardes figées ci-dessus ; et dans un vrai
navigateur, `npm run e2e -- --save` (une sauvegarde manuelle survit à un rechargement) et
`npm run e2e -- --save --no-indexeddb` (le repli aussi), dans le dépôt du moteur. La mise à niveau d'une ancienne
sauvegarde par la vraie version construite tourne dans Chromium et WebKit (`npm run e2e:a11y`, sa partie stockage,
une porte de la CI depuis la 3.3) : l'autosauvegarde et l'emplacement v2 en localStorage sont copiés dans IndexedDB et
supprimés seulement une fois la copie vérifiée, une enveloppe 3.1.0 déjà dans IndexedDB est migrée, le bouton
Continuer du titre la reprend, et une sauvegarde manuelle survit ensuite à un rechargement.

Ce qu'un joueur ou un auteur fait des sauvegardes (emplacements, renommer un id, migrations) :
[État et sauvegardes](create.state-saves.md#guarantees).

<a name="session"></a>
<!-- applies: .. since 3.7.1 -->

## Fichier de session (`web-scumm-session`)

Une session, ce sont toutes les entrées d'une partie, dans l'ordre, avec les réponses données pendant qu'elles
tournaient (choix de dialogue, choix sur la carte, tirages aléatoires, résultats de mini-jeux) et une empreinte de
l'état après chacune. `replay` la rejoue sur le vrai moteur, sans affichage, et nomme la première entrée dont l'état
diffère : le rapport de bug d'un testeur est un fichier de session. Sources :
[`src/engine/tools/replay.ts`](../../src/engine/tools/replay.ts) (`sessionFile`, `parseSessionFile`),
[`src/engine/core/types/session.ts`](../../src/engine/core/types/session.ts).

**D'où il vient.** « Exporter la session » du menu de sauvegarde (`<gameId>-session.json`), « Partager la session »
(un playtest, `<gameId>-<date>.session.json`, pour `games/<id>/playtests/`), l'onglet Jouer du Studio et le panneau de
dev.

**Schéma.**

| Champ | Sens |
|---|---|
| `kind` | `"web-scumm-session"`. |
| `game` | L'id du jeu. |
| `v` | La version de sauvegarde du jeu. |
| `at` | Le début de la session, en ms epoch. |
| `session` | `{ v, start, base, log, at?, seed?, variant? }`. `start` vaut `{ "kind": "new" }`, `{ "kind": "load" }` ou `{ "kind": "checkpoint", "id": … }` ; `base` est l'état de départ ; `seed` la graine du générateur du run (depuis la 4.1.14 ; absente avant) ; `variant` le monde joué (depuis la 4.1.15). |
| `trace` | La trace du moteur (vide dans un playtest). |
| `device` | `ios`, `android` ou `desktop`, quand elle est partagée comme playtest (3.7.1). |
| `misses` | Les tapes dans le vide à côté d'une cible, par `salle/cible` (3.8). |
| `journal` | Le journal sémantique, en ids (4.1.11) : `replay` vérifie que le rejeu donne le même. |
| `journalTruncated` | `true` quand la session a dépassé la fenêtre du journal : pas de journal à comparer. |

Chaque entrée de `log` est une action du joueur : `act` (un verbe sur une cible, `aborted` si la marche a été
interrompue), `travel`, `switch`, `map`, `step`, `script`, `enter`, `start`, ou `external` (un signal Reality). Une
entrée peut porter `picks`, `maps`, `rnd` (les tirages aléatoires), `mg` et `mgt` (les résultats des mini-jeux et,
depuis la 4.1.17, leurs transcriptions), `skipAt`, `ran`, `digest` et `t` (ms depuis le début ; les playtests le
lisent, `replay` l'ignore).

**Exemple minimal** (abrégé depuis
[`tests/fixtures/formats/session.json`](../../tests/fixtures/formats/session.json)) :

```json
{
  "kind": "web-scumm-session",
  "game": "signals",
  "v": 1,
  "at": 1791329746159,
  "session": {
    "v": 1,
    "start": { "kind": "new" },
    "base": { "v": 1, "room": "hall", "inventory": [], "flags": {}, "props": {}, "actors": {}, "hero": {},
              "unlocked": [], "visited": {}, "counters": {}, "seen": {}, "started": 1791329686159 },
    "log": [{ "start": "new", "ran": ["rule:game/start"], "digest": "86c55b44" }]
  },
  "trace": []
}
```

**Contraintes.** Le fichier doit contenir une session avec une liste `log` et un `start.kind` : sinon « not a session
file ». Une session qui part d'une sauvegarde a besoin de sa `base`. Une session tient au plus 500 entrées : l'entrée
suivante ouvre une nouvelle session depuis l'état courant.

**Compatibilité.** Une session nue (l'objet `session` seul) se lit aussi. Une session enregistrée avant la 4.1.14 n'a
pas de `seed` ; avant la 4.1.15, pas de `variant`, et elle se rejoue dans le monde de l'histoire ; une session de la
4.1.16 n'a pas de `mgt` et se rejoue comme elle était. Avec un `variant`, le rejeu reconstruit ce monde depuis son
affectation gardée.

**Champs inconnus.** Au premier niveau, `parseSessionFile` ne garde que les champs ci-dessus et laisse tomber le
reste ; un `device` hors des trois valeurs est écarté, de même que les clés de `misses` qui n'ont pas la forme
`salle/cible` et les événements du journal qu'il ne reconnaît pas. L'objet `session` est pris tel quel.

**La rejouer**, dans le dépôt du moteur (le jeu est `GAME`, sinon `config.game` du `package.json`) :

```sh
# dans le dépôt du moteur
npm run replay -- demo-session.json
```

La commande affiche le journal et l'état final, et sort en 1 là où le rejeu cesse de correspondre à l'enregistrement.
Un projet créé n'a pas de script `replay`.

> [!GUARANTEE id=session-replays]
> Le format de fichier de session de la 4.1.7 est figé dans une fixture : ses clés sont vérifiées, et il se rejoue
> jusqu'à l'empreinte qu'il a enregistrée. Changer le format, c'est changer ce test.

<a name="session-reality"></a>
<!-- applies: .. since 4.1.8 -->

## Les signaux Reality dans la session et la sauvegarde

Un signal du Reality Bridge est une entrée de la session,
`{ "external": { "id", "sequence", "signal", "source", "receivedAt", "playerId" } }` (plus `evidenceHash`, et
`skipped: "expired" | "signal"` pour un signal signé par le Bridge mais refusé pour de bon, enregistré pour que le
curseur le dépasse, sans effet). `npm run replay` l'applique hors ligne, sans Bridge. Une session ne garde jamais un
jeton, un e-mail, un identifiant ni la charge utile du connecteur.

La sauvegarde garde la dernière séquence reçue sans trou et les ids au-delà (`state.reality` : `cursor`, `applied`) :
un signal livré de nouveau (le Bridge livre au moins une fois) est reconnu et pas appliqué deux fois.

Le transport garde trois curseurs (depuis la 4.1.8) : *reçu*, la dernière séquence envoyée par le Bridge ; *livré*, la
dernière remise au jeu ; *durable*, la dernière acquittée, après la sauvegarde. Chaque requête au Bridge, un poll ou
une reconnexion, part du curseur durable. Un signal remis mais non acquitté (un refus qui passera peut-être plus tard,
une sauvegarde échouée, un plantage avant l'acquittement) est livré de nouveau sur la même connexion, avec une attente
qui grandit jusqu'à une minute tant que rien ne se règle : un poll redemande ; un flux que le Bridge garde ouvert est
fermé par le joueur après cette attente et rouvert depuis le curseur durable. Avant la 4.1.8, le transport partait du
curseur livré, et un tel signal attendait une reconnexion complète.

Le premier signal lie la sauvegarde à son joueur pseudonyme (`state.reality.playerId`, le `p-…` donné par le Bridge à
la liaison ; jamais la capacité). Une sauvegarde qui arrive sur un appareil lié comme quelqu'un d'autre (importée d'un
autre appareil, ou faite avant un « Délier » puis une nouvelle liaison) est une **discordance** (`mismatch`) : rien
n'en est appliqué ni acquitté, la partie continue, et le « Lien au monde » du menu pause propose d'utiliser le lien de
cet appareil avec cette sauvegarde. Son état de lien repart alors pour ce joueur (curseur 0), et les signaux dont la
sauvegarde a déjà l'effet ne sont pas appliqués de nouveau. Les mondes du solveur ne nomment aucun joueur : ils ne
lient rien.

Le côté Bridge de ces garanties : [Garanties du Bridge](bridge.guarantees.md#session-and-save).

<a name="wsrun"></a>
<!-- applies: .. since 4.1.14 -->

## Preuve de speedrun (`.wsrun`)

La preuve d'un speedrun : les entrées du run, chaînées par des hashes, et le résumé qu'affiche un classement.
Sources : [`src/engine/tools/speedrun/envelope.ts`](../../src/engine/tools/speedrun/envelope.ts) (écriture),
[`src/engine/tools/speedrun/verify.ts`](../../src/engine/tools/speedrun/verify.ts) (lecture). ADR 0016, 0017, 0019.

**Schéma 2 (écrit depuis la 4.1.16, `SpeedrunEnvelopeV2`).**

| Champ | Sens |
|---|---|
| `format`, `schema` | `"web-scumm-speedrun"`, `2`. |
| `gameId`, `fingerprint` | Le jeu, et son empreinte (`logic`, `trustedExtensions`, `presentation`, `engine`) tel qu'écrit, avant tout monde. |
| `engineVersion`, `prngVersion`, `timingVersion` | Les versions du moteur, du générateur et des durées. |
| `categoryId`, `rulesVersion` | La catégorie et la version de ses règles. |
| `runSeed` | La graine du générateur du run, jamais celle du monde. |
| `variant` | Le monde exact joué, affectations comprises : jamais régénéré depuis une graine. |
| `worldEvidence` | Pour un monde Daily `{ kind: "daily", token }` ; pour un monde Mystery `{ kind: "mystery", commitmentToken, revealToken, startedAt }` : les jetons signés du Bridge, tels que reçus (4096 caractères au plus chacun). |
| `timing` | `rtaMs`, `logicalSteps`, `logicalTime`, `activeTime` (les trois derniers en chaînes décimales), `excluded` (les pauses, menus, arrière-plans, chargements et sauvegardes déclarés : `{ kind, entry, atMs, durationMs }`). |
| `splits` | Les splits enregistrés. |
| `chunks` | Les entrées par chunks de 500, chacun `{ index, prevHash, hash, entries }`, chaînés par SHA-256 de `h0` au dernier hash. |
| `loads`, `inputsUsed`, `realitySignals` | Facultatifs : les chargements, les entrées utilisées (`mouse`, `touch`, `keyboard`, `gamepad`), les signaux Reality (chacun avec le JWS du Bridge, son hash et le verdict du client). |
| `h0` | La tête de la chaîne : le hash des règles. En schéma 2 elle scelle aussi le monde (son hash, la politique de monde de la catégorie, le hash des preuves, la version de l'algorithme Remix) : les mêmes entrées dans deux mondes font deux runs. |
| `finalStateHash`, `finalProof` | Le hash de la partie logique de l'état final ; la preuve qui scelle le dernier hash de la chaîne avec le temps, les splits, l'état final, les chargements et les signaux. |
| `trust` | Toujours `local` à l'export. |

Chaque hash porte sur `canonicalJson`, et le fichier lui-même est écrit en JSON canonique. La chaîne montre que le
fichier n'a pas été modifié après avoir été scellé ; elle ne montre pas que le client était honnête. Un vérificateur
rejoue le run, et seul un témoin élève sa confiance. La description complète des catégories, du temps et des niveaux
de confiance est dans [Speedrun pour les auteurs](create.speedrun.md#proof).

**Exemple minimal** (la forme, valeurs abrégées) :

```json
{
  "format": "web-scumm-speedrun",
  "schema": 2,
  "gameId": "demo",
  "fingerprint": { "logic": "…", "trustedExtensions": "…", "presentation": "…", "engine": "…" },
  "engineVersion": "4.4.0",
  "prngVersion": 1,
  "timingVersion": 1,
  "categoryId": "any",
  "rulesVersion": 1,
  "runSeed": "…",
  "variant": { "seed": "story", "mode": "story", "…": "…" },
  "timing": { "rtaMs": 61000, "logicalSteps": "42", "logicalTime": "58000", "activeTime": "57000", "excluded": [] },
  "splits": [],
  "chunks": [{ "index": 0, "prevHash": "<h0>", "hash": "…", "entries": [{ "start": "new" }] }],
  "h0": "…",
  "finalStateHash": "…",
  "finalProof": "…",
  "trust": "local"
}
```

**Contraintes, telles que le vérificateur lit le fichier.** Il doit être du JSON au format `web-scumm-speedrun`, de
schéma 1 ou 2 (un autre schéma : `unsupported-version`). Chaque champ doit être présent avec son type
(`envelope-shape`) ; un run de schéma 2 doit nommer son monde (`world-missing`), et ses preuves doivent être une preuve
Daily ou Mystery (`world-shape`). Viennent ensuite les versions : un générateur, des durées ou un moteur d'une autre
version que ceux du vérificateur donnent `unsupported-version` (« rejouez-le avec l'archive de cette version »). Les
chunks doivent être contigus, liés et pleins sauf le dernier. Les vérifications suivantes (catégorie, politique de
graine, rejeu, temps, splits, état final) sont décrites dans [Speedrun pour les auteurs](create.speedrun.md).

**Compatibilité.** Un fichier de schéma 1 (4.1.14 et 4.1.15 : une `seed` facultative, pas de `variant`) se lit
toujours, comme un run Story. Présenté à une catégorie Remix, il est refusé (`legacy-world-missing`), jamais requalifié
d'après sa graine.

**Champs inconnus.** Refusés : « unknown field(s) in the envelope: … », code `envelope-shape`, verdict
`invalid-replay`. Un champ du schéma 1 dans une enveloppe de schéma 2 (`seed`) est inconnu lui aussi.

> [!GUARANTEE id=wsrun-unknown-field-refused]
> Un fichier `.wsrun` qui porte un champ que le vérificateur ne connaît pas est refusé avec `envelope-shape`, champs
> nommés ; un champ du schéma 1 dans une enveloppe de schéma 2 compte comme inconnu.

En vérifier un :

```sh
# dans le dépôt du moteur
npm run speedrun:verify -- run.wsrun
# dans un projet créé
npx quest-n-click speedrun verify run.wsrun
```

<a name="storyboard"></a>
<!-- applies: .. since 4.1.0 -->

## `storyboard.json`

Le script d'un jeu, dans `games/<id>/storyboard.json` : la source de vérité de chaque texte, les salles sont écrites à
partir de lui. Sources : [`tools/pages/storyboard-data.ts`](../../tools/pages/storyboard-data.ts) (normalisation et
vérifications), [`tools/pages/storyboard-schema.md`](../../tools/pages/storyboard-schema.md) (le schéma commenté).

**Schéma.** `{ title?, intro?, boards: Board[] }`. Une planche (board) : `id`, `title`, et en option `room` (un id de
salle : son décor est montré), `goal`, `music`, `arrival` (des répliques), `panels` (dans l'ordre de jeu :
`{ id, title, action?, lines?, sfx? }`, l'`id` unique dans tout le storyboard), `talks` (des sujets par id de
personnage : `{ topic, lines }`), `reactions` (`{ action, lines }`, pas nécessaires pour finir), `hints` (du plus vague
au plus précis) et `exit`. Une réplique s'écrit `{ "who": "<locuteur>", "text": "…" }` : `who` est un id de
personnage, `hero` (toujours le héros), `action` (une action du joueur) ou `stage` (une didascalie) ; un id inconnu
est montré tel quel.

**Exemple minimal :**

```json
{
  "boards": [
    {
      "id": "kitchen",
      "title": "The kitchen",
      "room": "kitchen",
      "goal": "Get the key.",
      "panels": [
        { "id": "kitchen-1", "title": "The drawer", "action": "Open drawer",
          "lines": [{ "who": "hero", "text": "Empty. Of course." }] }
      ],
      "hints": ["Something in this kitchen opens.", "Look in the drawer."]
    }
  ]
}
```

**Contraintes** (`storyboardProblems`, les mêmes phrases dans le générateur de page, le Studio local, le Studio
hébergé, la démo du Studio et le `set_storyboard` du MCP) : le fichier est un objet avec une liste `boards` ; chaque
planche est un objet avec un `id` (une chaîne ou un nombre) ; `panels`, s'il est là, est une liste d'objets ; une liste
de répliques contient des répliques écrites `"texte"`, `[who, text]` ou `{ who, text }`. Un storyboard qui a un
problème est refusé et rien n'est écrit. Un fichier qui n'est pas du JSON est signalé par « storyboard.json: invalid
JSON (…) ».

**Formes tolérées**, normalisées à la lecture : `talk` pour `talks` ; `talks` en liste `[{ "who", "topics" }]` ; des
sujets écrits `{ "q", "answer" }` ; `optional` pour `reactions` ; une réplique écrite en simple chaîne (le héros la
dit) ou en `["who", "text"]`. Un panneau sans `id` ou sans `title` en reçoit de vides.

**Champs inconnus.** Le Studio et le MCP les gardent : ils lisent le fichier brut, modifient sur place les champs
qu'ils connaissent et réécrivent tout l'objet (de façon compacte ; un storyboard inchangé n'est pas réécrit). La page
de relecture et l'export Markdown (`npm run page:storyboard -- --md`, `games/<id>/storyboard.md`) ne montrent que les
champs ci-dessus.

Comment écrire un storyboard : [Le storyboard](create.storyboard.md).

<a name="groupings"></a>
<!-- applies: .. since 4.2.3 -->

## `groupings.json`

Les regroupements qu'une équipe déclare pour la carte du scénario (un personnage, une énigme, un chapitre), dans
`games/<id>/groupings.json`. Un regroupement ne fait que lister des références à ce que le jeu nomme déjà ; il ne les
écrit jamais. La carte elle-même n'est jamais stockée : elle est dérivée de l'IR et de ce fichier. Source :
[`tools/studio/scenario-map.ts`](../../tools/studio/scenario-map.ts).

**Schéma.** `{ "groupings": [{ id, kind, title, refs }] }`.

- `id` : lettres minuscules, chiffres et `-`, commençant par une lettre ou un chiffre, 64 caractères au plus, unique
  dans le fichier.
- `kind` : `character`, `puzzle` ou `chapter`.
- `title` : 1 à 200 caractères, pas blanc, sans caractère de contrôle ni forçage de direction.
- `refs` : 500 références au plus, chacune la clé de provenance de l'IR d'une chose que le jeu nomme (un id de salle,
  un id de règle, de sujet ou d'écouteur, `item:<id>`, `char:<id>`, `<salle>.<entité>`, `objective:<id>`,
  `checkpoint:<id>`) : sans espace, sans caractère de contrôle, 200 caractères au plus, aucune nommée deux fois.
- 500 regroupements au plus.

**Exemple minimal :**

```json
{ "groupings": [{ "id": "the-key", "kind": "puzzle", "title": "The pantry key", "refs": ["kitchen", "item:key"] }] }
```

Une référence que l'IR ne connaît pas est montrée comme « non déclarée » (une faute de frappe, un id écrit par du
code, quelque chose de supprimé), jamais devinée.

**Champs inconnus.** Refusés à l'écriture : « `<champ>` is unknown » pour un champ de trop au premier niveau,
« groupings[n].`<champ>` is unknown » pour un champ de trop dans un regroupement ; rien n'est écrit. À la lecture, un
fichier modifié à la main (par une personne, une IA, une fusion) n'est pas refusé en bloc : les regroupements bien
formés sont pris (le premier d'un id répété), les autres sont laissés de côté avec leur raison, et l'onglet Carte dit
ce qu'il a écarté. Enregistrer depuis le Studio écrit alors les regroupements lisibles.

> [!GUARANTEE id=groupings-unknown-refused]
> La vérification des regroupements nomme un champ inconnu du fichier ou d'un regroupement avec les phrases ci-dessus.
> Elle nomme aussi, d'une phrase chacun, un problème de forme, de nombre, d'id, de titre ou de références.

Sur un Studio hébergé, `groupings.json` est un pan à lui seul. Voir [La carte](studio.map.md).

<a name="notes"></a>

## `notes.json`

Le journal partagé entre l'auteur et un assistant IA, dans `games/<id>/notes.json`, affiché par l'onglet Notes du
Studio et lu par les outils MCP `get_notes` et `add_note`. Sources :
[`tools/studio/types.ts`](../../tools/studio/types.ts) (`Note`, `NotesFile`),
[`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts) (lecture et écriture).

**Schéma.** `{ "entries": [{ id, about, author, text, at, edited?, task? }] }` : `id` est donné par le Studio (`n`
suivi d'un suffixe tiré de l'heure) ; `about` est un id de panneau, un id de salle, `salle.entité` ou du texte libre ;
`author` est le nom de qui écrit (sur un Studio hébergé, toujours celui du membre connecté, jamais ce qu'envoie la
page) ; `at` et `edited` sont des dates ISO ; `task: true` marque une demande de l'auteur à reprendre par un agent IA.

**Exemple minimal :**

```json
{
  "entries": [
    { "id": "n1a2b3c4", "about": "kitchen-1", "author": "you", "text": "Shorter line here?", "at": "2026-10-23T09:00:00.000Z" }
  ]
}
```

**Contraintes.** Une nouvelle note exige un `text` non vide ; une modification aussi, et son `about` doit être une
chaîne ; modifier ou supprimer un id inconnu donne « no such note » (404). Un fichier absent se lit comme aucune note ;
un fichier qui n'est pas du JSON est une erreur. Les écritures n'entrent pas dans l'historique d'annulation du Studio.

**Champs inconnus.** Un fichier sans liste `entries` se lit comme vide. Les champs d'une entrée que le Studio ne
connaît pas sont gardés. Tout autre champ de premier niveau disparaît à la prochaine écriture, qui ne réécrit que
`{ "entries": … }`.

<a name="build-files"></a>
<!-- applies: .. since 4.1.12 -->

## Les fichiers qu'un build écrit sur lui-même

`npm run build`, dans le dépôt du moteur comme dans un projet créé, écrit à côté du jeu, dans `dist/`, les fichiers qui
décrivent le build. Sources : [`tools/vite/plugins.ts`](../../tools/vite/plugins.ts) (`sealBuild`),
[`tools/dist.ts`](../../tools/dist.ts), [`src/engine/tools/inventory.ts`](../../src/engine/tools/inventory.ts).

**`dist/site.json`** (depuis la 4.1.12) : le `games/<id>/site.json` du jeu (titre, nom court, description, couleur de
thème, langue…) avec deux champs ajoutés : `trustedExtensions` (le hash du code du jeu à côté de son contenu, la partie
de l'empreinte qu'une copie du joueur ne peut pas calculer depuis le contenu) et `engine` (la version du moteur). Le
joueur reçoit les deux mêmes valeurs dans son code. Un champ du `site.json` du jeu est recopié tel quel.

**`dist/licenses/assets-manifest.json`** (depuis la 3.7.1) :

```json
{ "game": "demo", "assets": [
  { "key": "<asset key>", "path": "<path in dist>", "sha256": "…", "bytes": 1234, "licence": "CC-BY-4.0", "status": "…", "author": "…", "source": "…", "url": "…" }
] }
```

Une entrée par asset de `provenance.lock.json`, triées par clé ; `author`, `source` et `url` viennent de l'entrée de
provenance quand elle les a. `npm run verify:dist` refuse le build quand le manifeste ne liste pas le même nombre
d'assets avec les mêmes hashes que le verrou (« licenses/assets-manifest.json: does not match provenance.lock.json ») ;
il ne lit aucun autre champ. Le même dossier contient `LICENSE`, `LICENSE-ASSETS`, `CREDITS.md` et
`THIRD_PARTY_NOTICES.txt`.

**`dist/reality-manifest.json`**, seulement pour un jeu qui déclare `reality` : voir la section suivante.

Le build lui-même et ses vérifications : [Construire et publier un jeu](create.build-release.md).

<a name="reality-manifest"></a>
<!-- applies: .. since 4.1.1 -->

## Manifeste Reality (`web-scumm-reality-manifest`)

Les signaux que déclare un jeu, sans aucun secret, construits depuis son contenu : ce contre quoi le Bridge vérifie
les propositions. Source : [`src/engine/reality/manifest.ts`](../../src/engine/reality/manifest.ts) ; lu par
[`bridge/src/cli.ts`](../../bridge/src/cli.ts) et [`bridge/src/bridge.ts`](../../bridge/src/bridge.ts).

**Schéma 1.**

```json
{
  "format": "web-scumm-reality-manifest",
  "schema": 1,
  "gameId": "signals",
  "signals": [{ "id": "mail.answer.correct", "source": "mail", "availability": "optional", "replay": "record" }]
}
```

`signals` est trié par id ; `availability` vaut `optional` ou `required` ; `replay` vaut `record`. `connectors`
(depuis la 4.1.9) n'est présent que si le jeu le déclare : ce que les connecteurs du jeu peuvent transformer en
signaux.

**Où il va.** Le build l'écrit dans `dist/reality-manifest.json` quand le jeu déclare `reality`, et seulement dans ce
cas. `quest-n-click-bridge init --manifest=<game>/dist/reality-manifest.json` le recopie dans le `config.json` du
Bridge avec son hash (SHA-256 de son texte JSON, clés dans l'ordre où elles sont écrites).

**Contraintes.** Le Bridge refuse un signal que le manifeste ne déclare pas. Au démarrage, il refuse un manifeste dont
le hash n'est pas celui que sa configuration a enregistré (« the game's manifest (…) is not the one configured (…) »),
ou dont le `gameId` n'est pas celui de la configuration. Un jeu sans `reality.signals` n'a pas de manifeste : `init`
répond « the game declares no reality.signals: nothing to bridge ».

**Champs inconnus.** Le Bridge ne vérifie pas la forme du manifeste à l'`init` : un champ qu'il ne connaît pas est
gardé dans sa configuration et compté dans le hash. Modifier le manifeste contenu dans `config.json` sans relancer
`init` fait refuser le démarrage du Bridge.

Les signaux eux-mêmes : [Les signaux et le manifeste](bridge.signals-manifest.md).

<a name="ir-and-fingerprint"></a>
<!-- applies: .. since 4.1.12 -->

## L'IR et l'empreinte du jeu

ADR 0013. [`src/engine/core/ir.ts`](../../src/engine/core/ir.ts) `compileIR` fait la représentation intermédiaire
du jeu depuis le jeu compilé : sa logique en données simples (salles, entités, règles, scripts, objectifs, politiques
Reality, le monde, les extensions de confiance par nom, l'emplacement de variante de la 4.1.15), avec le
`fichier:ligne` de chaque id quand les sources sont données (`provenanceOf`, depuis les clés d'objet des sources,
[`src/engine/core/source-keys.ts`](../../src/engine/core/source-keys.ts)).

**L'IR comme fichier.** Elle n'est pas stockée : `npm run ir -- --json` l'affiche, le même texte pour les mêmes
sources (dépôt du moteur ; `--game <id>` pour un autre jeu ; sans `--json`, un plan lisible). Son premier niveau :
`schema` (1 depuis la 4.1.12), `engine`, `gameId`, `world`, `rooms`, `entities`, `rules`, `scripts`, `objectives`,
`reality`, `extensions`, `variant` et `provenance`. Dans le schéma 1, un champ peut s'ajouter, et le sens d'un champ ne
change jamais.

```sh
# dans le dépôt du moteur
npm run ir -- --json > demo-ir.json
```

Le runtime, le solveur et le replay continuent de lire `CompiledGame` : l'IR en est une projection. L'ADR a mesuré
l'autre voie : faire lire l'IR au runtime réécrirait 641 lectures et porterait la présentation que l'IR laisse dehors.

**Ce que compte chaque champ.** [`src/engine/core/ir-fields.ts`](../../src/engine/core/ir-fields.ts) classe chaque
champ d'un jeu, d'une salle et d'une entité, vérifié par le compilateur (un champ ajouté sans classe ne compile pas) :
`logic` est dans l'IR et dans le `logic` de l'empreinte ; `presentation` dans son `presentation` ; `both` se partage
(l'IR garde la partie logique, la présentation le tout) ; `meta` ne sert qu'aux outils.

Le jeu (`GameDef`) :

- **logic** : `schemaVersion`, `id`, `saveVersion`, `hero`, `players`, `hintItem`, `hintVoice`, `rules`, `scripts`,
  `events`, `globalTalk`, `start`, `reality`, `checkpoints`, `invariants`, `migrations`, `objectives`, `remix`,
  `variant`
- **both** : `verbs`, `characters`, `items`, `rooms`, `map`
- **presentation** : `title`, `renderer`, `audio`, `skin`, `ending`, `saves`, `settings`, `input`, `actorGap`, `ui`,
  `titleScreen`, `creditsScreen`, `credits`
- **meta** : `lang`, `offline`, `lint`, `i18n`, `assetBudgets`, `speedrun`

Une salle (`RoomDef`) :

- **logic** : `id`, `name`, `hotspots`, `look`, `on`, `talk`, `hints`, `onEnter`, `scripts`, `events`, `hero`,
  `anchors`
- **both** : `props`, `actors`, `exits`, `stage`
- **presentation** : `decor`, `music`, `renderer`
- **meta** : `description`, `furniture`

La référence du DSL champ par champ : [Référence du DSL](create.dsl.md#field-counts).

**L'empreinte.** [`src/engine/core/canonical.ts`](../../src/engine/core/canonical.ts) `canonicalJson` écrit un seul
texte par valeur sur chaque runtime (NFC, clés triées, pas de `-0`, grands entiers en chaînes).
[`src/engine/core/fingerprint.ts`](../../src/engine/core/fingerprint.ts) le hache avec WebCrypto (SHA-256) en quatre
composantes :

- `logic` : l'IR sans sa provenance ;
- `trustedExtensions` : l'empreinte, donnée par le build, du code du jeu à côté de son contenu
  (`__TRUSTED_EXTENSIONS__`, écrite aussi dans `dist/site.json`) ;
- `presentation` : `presentationOf`, chaque champ de présentation et le manifeste des assets ;
- `engine` : sa version et `prngVersion` (réservé).

L'empreinte n'est pas un fichier à part : un `.wsrun` la porte, et le `meta.revision` d'un emplacement de sauvegarde
porte l'empreinte du contenu où il a été fait. La ligne d'empreinte du menu pause (`ui.fingerprint`, « Build » par
défaut) la calcule à la demande, sur le jeu tel qu'écrit (avant une traduction), et montre les huit premiers chiffres
de chaque composante. La ligne des objectifs (`ui.objectives`) ouvre le journal de quêtes
([`src/engine/dom/objectives-menu.ts`](../../src/engine/dom/objectives-menu.ts)).

<a name="related"></a>

## Identifiants et pages liés

- `npm run replay`, `npm run speedrun:verify`, `npm run ir` (dépôt du moteur) ; `quest-n-click speedrun verify`
  (projet créé).
- [État et sauvegardes](create.state-saves.md), [Speedrun pour les auteurs](create.speedrun.md),
  [Garanties du Bridge](bridge.guarantees.md), [Modèle d'exécution](engine.execution-model.md),
  [Architecture](contribute.architecture.md#storage).
