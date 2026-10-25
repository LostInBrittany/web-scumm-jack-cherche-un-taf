# Speedrun pour les auteurs

Un jeu fait avec quest'n'click peut déclarer des catégories de speedrun dans son contenu. Le joueur lance une
tentative depuis le menu pause, le moteur la chronomètre, la découpe en splits sur ce qui se passe dans le jeu (jamais
sur des pixels) et scelle le run dans un fichier `.wsrun` que n'importe qui peut rejouer et vérifier. Cette page est
pour l'auteur : déclarer les catégories et les splits, vérifier un run, proposer des classements. Le côté joueur (le
chrono, LiveSplit, OBS) est dans [Speedrun pour les joueurs](play.speedrun.md).

<a name="what-you-get"></a>

## Ce que vous obtenez

Votre jeu propose une ou plusieurs catégories de speedrun (Any%, sans indices, un monde Remix…) avec des splits
automatiques ; un run qu'un joueur exporte en `.wsrun` se vérifie sur votre machine en une commande, qui donne un
verdict, un code et une raison ; et, si vous faites tourner un Reality Bridge, ses classements rangent les runs que ses
workers isolés ont trouvés valides.

<a name="context-and-versions"></a>

## Contexte et versions

- Le dépôt du moteur ou un projet créé : les catégories sont du contenu (`GameDef.speedrun`), le vérificateur existe
  dans les deux.
- Le speedrun est arrivé en 4.1.14 (« Time Attack »). La politique de monde (`world`) et le schéma 2 du `.wsrun` datent
  de 4.1.16 ; la preuve par transcript de la roue de code, le monde Mystery dans le lecteur et les limites de file
  partagées de 4.1.17. Cette page décrit 4.1.17 et suivantes.
- Classements et défi du jour demandent un Reality Bridge sur un store SQL
  ([Installer et lancer le Bridge](bridge.install-run.md)).

<a name="prerequisites"></a>

## Prérequis

- Un jeu qui se termine : `validate` et `solve` au vert ([Vérifier son jeu](create.checking.md)).
- Des objectifs ou des drapeaux sur lesquels découper ([Chapitres et objectifs](create.chapters.md)).
- Pour des mondes autres que l'histoire : un manifeste Remix ([Remix](create.remix.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

- Modifier `game.ts` : dans le dossier du jeu (`games/<id>/` dans le dépôt du moteur, la racine dans un projet créé).
- Vérifier un run : dans le dépôt du moteur (`npm run speedrun:verify`, le jeu choisi par `GAME=<id>` ou
  `npm run game`), ou dans le projet créé (`npx quest-n-click speedrun verify`).
- Classements : sur la machine qui fait tourner le Bridge.

<a name="overview"></a>

## Comment un run est chronométré et prouvé

L'horloge du run observe le jeu et n'écrit jamais son état ; les tirages aléatoires du run viennent d'un générateur à
graine ; les entrées sont enregistrées en chunks chaînés par SHA-256 et scellées dans le `.wsrun`. Un vérificateur les
rejoue sur le vrai jeu et recalcule tout. La conception est dans
l'[ADR 0016](../../docs/dev/adr/0016-run-clock-and-envelope.md) (l'horloge, le générateur à graine, la preuve chaînée)
et l'[ADR 0017](../../docs/dev/adr/0017-speedrun-verdicts-and-trust.md) (verdicts et confiance) ; l'horloge et le
générateur sont expliqués dans [Modèle d'exécution](engine.execution-model.md#time-and-randomness).

> [!LIMIT id=not-anti-cheat]
> Rien ici ne promet de détecter toute triche. Un rejeu prouve qu'un run est possible et que son temps de jeu est
> exact ; seule l'observation d'un serveur ou d'un humain élève la confiance au-delà ([Niveaux de confiance](#trust)).

<a name="steps"></a>

## Étapes

<!-- step: categories -->
1. **Déclarer les catégories et les splits** dans `game.ts` (du contenu seulement : une nouvelle catégorie ne demande
   aucun changement du moteur) :

   ```ts
   // games/<id>/game.ts (dépôt du moteur) ou game.ts (projet créé)
   speedrun: {
     rulesVersion: 1,
     categories: [
       { id: 'any%', name: 'Any%', timing: 'igt',
         start: { event: 'sessionStarted', session: 'new' }, finish: { event: 'endingReached' },
         allowSaves: true, allowPauses: true, allowHints: true, reload: 'allowed', realityPolicy: 'forbidden',
         fingerprint: ['logic', 'trustedExtensions'],
         inputs: { mouse: true, touch: true, keyboard: true, gamepad: true, macros: 'forbidden' } },
     ],
     splits: [
       { id: 'ladder', name: 'Échelle', at: { event: 'objectiveCompleted', objective: 'ladder' } },
       { id: 'end', name: 'Festival', at: { event: 'endingReached' } },
     ],
   },
   ```

   Chaque champ est décrit dans [Définir des catégories](#categories).

<!-- step: validate -->
2. **Valider.** Le validateur vérifie le manifeste :

   ```sh
   # dans le dépôt du moteur
   npm run validate
   # ou dans le projet créé
   npx quest-n-click validate
   ```

<!-- step: record -->
3. **Enregistrer un run.** Jouez (`npm run dev`), ouvrez le menu pause, lancez une tentative dans une catégorie, allez
   jusqu'à l'arrivée, puis « Exporter le run » dans le menu pause : le navigateur télécharge
   `<jeu>-<catégorie>.wsrun`. L'onglet Play du Studio en exporte un aussi.

<!-- step: verify -->
4. **Le vérifier.**

   ```sh
   # dans le dépôt du moteur, le jeu sélectionné
   npm run speedrun:verify -- run.wsrun [--keys=bridge-keys.json] [--json] [--timeout=<ms>]
   # ou dans le projet créé
   npx quest-n-click speedrun verify run.wsrun [--keys=<file>] [--json]
   ```

   L'outil MCP `speedrun_verify` fait de même pour un assistant. Sortie 0 pour `valid` et `valid-unranked`, 1 pour
   tout autre verdict, `inconclusive` compris ; 2 sans fichier.

<!-- step: leaderboard -->
5. **Proposer des classements (facultatif).** Ajoutez une section `runs` (et une section `daily` pour les mondes Daily
   et Mystery) à la configuration du Bridge, sur un store SQL : voir [Classements sur le Bridge](#leaderboards).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`speedrun:verify` affiche `✔  <verdict> (<code>): <raison>`, puis la confiance, le jeu et le moteur, le monde et sa clé
de classement, et l'IGT, l'IGT actif et les pas recalculés ; avec `--json`, le résultat entier en JSON canonique. Un run
à vous, joué honnêtement jusqu'à l'arrivée, donne `valid` (`ok`) dans une catégorie IGT et `valid-unranked`
(`rta-unverifiable`) dans une catégorie RTA. L'exemple du dépôt est
[`tests/fixtures/speedrun/reference-any.wsrun`](../../tests/fixtures/speedrun/reference-any.wsrun) : un run Any% complet
du chapitre de référence (schéma 2, fait par [`tools/speedrun/reference-run.ts`](../../tools/speedrun/reference-run.ts)),
vérifié par un test et par le workflow de release, qui l'attache à chaque release. Le fichier de schéma 1 de 4.1.15 est
gardé comme fixture de référence (`reference-any.v1.wsrun`).

> [!GUARANTEE id=altered-run-refused]
> Une copie du run de référence modifiée après son scellement est refusée, avec sa raison, et `speedrun:verify` sort
> en 1.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| `validate` refuse le manifeste | un événement inconnu, un id qui ne nomme rien, un départ égal à l'arrivée, une catégorie sans entrée, une politique Reality sans `reality`, un split qui est son propre ancêtre, `reload: 'segment'` | corriger le champ que nomme le message |
| `validate` avertit | un drapeau jamais posé ; une catégorie qui n'exige pas `logic` | ajouter la règle manquante, ou `logic` à `fingerprint` |
| `modified-game` (`fingerprint`) | le jeu a changé depuis l'enregistrement du run, dans un composant qu'exige la catégorie | vérifier contre le jeu sur lequel le run a été joué |
| `unsupported-version` (`engine-version`) | le run a été enregistré sur une autre version du moteur | vérifier avec l'archive de cette version |
| `unsupported-version` (`rules-version`) | vous avez changé `rulesVersion` | normal : un ancien run n'est jamais requalifié |
| `invalid-category-rule` (`legacy-world-missing`) | un fichier de schéma 1 (4.1.14, 4.1.15) présenté à une catégorie Remix | il ne se lit que comme un run Story |
| `inconclusive` (`no-keyring`) | une catégorie `recorded` ou `live` vérifiée sans les clés du Bridge | passer `--keys=` (depuis `GET /v1/keys`) |

La liste complète des verdicts et des codes est dans [Vérifier un run](#verify).

<a name="files-changed"></a>

## Fichiers ou données modifiés

`game.ts` (la section `speedrun`). Le lecteur garde runs et records dans l'IndexedDB du navigateur. Un Bridge avec une
section `runs` écrit les runs et leurs verdicts dans son store SQL.

<a name="recovery"></a>

## Retour arrière

Retirer une catégorie ou changer ses règles ne touche pas les runs déjà exportés ; augmentez `rulesVersion` quand les
règles changent, pour qu'un ancien run ne soit jamais classé sous de nouvelles règles. Un run supprimé d'un classement
est perdu : `DELETE` ne se défait pas.

<a name="categories"></a>

## Définir des catégories

`GameDef.speedrun` (types dans [API publique](engine.api.md), vérifiés par `npm run validate`) contient `rulesVersion`,
`categories` et `splits`. Une catégorie (`SpeedrunCategory`) :

| Champ | Valeurs |
|---|---|
| `id`, `name` | l'id et ce que lisent les joueurs (le classement, l'overlay) |
| `timing` | `rta`, `igt` ou `active-igt` ([Le temps](#timing)) |
| `start`, `finish` | un déclencheur sémantique |
| `allowSaves`, `allowPauses`, `allowHints` | des booléens (la sauvegarde automatique tourne toujours ; un indice est enregistré par la session) |
| `reload` | `invalidates` (un chargement disqualifie) ou `allowed` (un état que le run a lui-même atteint) ; `segment` est réservé, refusé par le validateur |
| `realityPolicy` | `forbidden`, `recorded` ou `live` ([Politiques Reality](#reality-policies)) |
| `fingerprint` | les composants qu'un run doit égaler : `logic`, `trustedExtensions`, `presentation`, `engine` ([Politiques](#policies)) |
| `inputs` | `{ mouse, touch, keyboard, gamepad, macros: 'forbidden' \| 'allowed' }` |
| `seed` | le générateur du run : `fixed` (chaque run tire de `fixed:<id>`) ou `random` (par défaut, une graine neuve par run) |
| `world` | le monde où se joue le run (4.1.16, [plus bas](#worlds)) |

Un déclencheur nomme un événement sémantique (`roomEntered`, `itemAcquired`, `itemLost`, `flagChanged`,
`objectiveCompleted`, `endingReached`, `sessionStarted`, `playerSwitched`…) et les champs qu'il doit égaler (`room`,
`item`, `flag` avec `value`, `objective`, `ending`, `player`, `session`). Aucun pixel n'est jamais lu.

Les règles portent leur version : un changement ne requalifie jamais un ancien run (`rulesVersion` différente :
`unsupported-version`). Le validateur refuse un événement inconnu, un id qui ne nomme rien, un départ égal à l'arrivée,
une catégorie sans entrée, une politique Reality sans `reality`, un split qui est son propre ancêtre ; il avertit pour
un drapeau jamais posé et une catégorie qui n'exige pas `logic`. Une catégorie définie seulement dans le contenu ne
touche aucun code du moteur : [`tests/speedrun-manifest.test.ts`](../../tests/speedrun-manifest.test.ts) le prouve avec
un jeu de test.

Le chapitre de référence ([`games/reference/game.ts`](../../games/reference/game.ts)) déclare Any%, Any% No Hints, Real
Time, Remix Fixed (`WS-0000-02DZ`), Remix Random, Daily, Mystery et Any% (wheel proved).

<a name="worlds"></a>

## Mondes : Story, Fixed, Random, Daily, Mystery

Depuis 4.1.16 (D29, [ADR 0019](../../docs/dev/adr/0019-run-world-binding.md)), le monde où un run se joue est `world` :

- `{ policy: 'story' }` (par défaut quand `world` est absent) ;
- `'fixed'` avec sa `fixedSeed` publiée ;
- `'random'` : n'importe quel monde de `mode`, classés ensemble ; la graine est tirée au départ et montrée ;
- `'daily'` : la graine du jour signée par le Bridge ;
- `'mystery'` : une graine à laquelle le Bridge s'engage avant le départ.

Chacun nomme le `mode` Remix d'où viennent ses mondes, et peut dire ce qu'il permet de la roue de code dans
`codeWheel` ([Niveaux de confiance](#trust)). Fixed et Daily classent chaque graine à part (`leaderboardKey`), et
`worldVerdict` vérifie le monde d'un run contre ce que sa catégorie permet. Le `seed: 'daily' | 'mystery'` de 4.1.15
sans `world` est lu comme ce monde (un run aléatoire dedans), avec un avertissement de dépréciation du validateur.

<a name="timing"></a>

## Le temps : RTA, IGT, IGT actif

- **RTA** : l'horloge monotone de la page, du déclencheur de départ à l'arrivée. Jamais reproductible, jamais une
  autorité : un run chronométré en `rta` se rejoue valide mais reste hors classement sans témoin.
- **IGT** (`logicalTime`) : la somme des durées déclarées de ce que le moteur a exécuté
  ([`src/engine/core/timing.ts`](../../src/engine/core/timing.ts), `TIMING_VERSION = 1`) : une réplique 2,2 s quels que
  soient son texte et sa langue, une marche sa distance divisée par la vitesse de marche entre ancres logiques, un
  `wait`, une animation, un panoramique, un mouvement leurs millisecondes ; une cinématique passée ne coûte rien. Le
  temps de réflexion n'y est pas. En microticks (1 ms = 1 000), un `bigint` écrit en chaîne décimale.
- **IGT actif** : l'IGT moins ce qui a tourné dans une cinématique.
- **Pas logiques** : un par entrée de la session.

L'horloge du run (`Engine.runClock`) observe le moteur et n'écrit jamais l'état (D24).

<a name="splits-routes"></a>

## Splits, routes, records et fantôme

Les splits sont automatiques : chacun se déclenche une fois, la première fois que son déclencheur correspond après le
départ ; un split qui ne se déclenche jamais est marqué manqué et le run continue. Un `parent` en fait un sous-split.
Les records comparent un run au meilleur personnel (avance ou retard à chaque split), gardent le meilleur segment de
chaque split et leur somme.

Une **route** est un fichier `.wsroute` (JSON canonique) : les entrées d'un run, éventuellement ses splits. L'onglet
Play du Studio exporte la session de son cadre comme route, en importe une et en compare deux (première entrée
différente, écarts des splits). Le témoin du solveur devient une **route logique** (`kind: 'logical'`) : une référence
pour le routage, jamais un record.

<a name="proof"></a>

## La preuve : `.wsrun`

Schéma 2 depuis 4.1.16 (`SpeedrunEnvelopeV2`, ADR 0019). Il contient le jeu, son empreinte (le jeu tel qu'écrit, avant
tout monde), les versions du moteur, du générateur et des durées, la catégorie et la version de ses règles, la graine du
générateur du run (`runSeed`), le monde exact joué (`variant`, affectations comprises, jamais régénéré depuis une graine)
et, pour un monde Daily ou Mystery, les jetons signés du Bridge (`worldEvidence`) ; le temps (RTA, pas, IGT, IGT actif,
les pauses, menus, arrière-plans et chargements déclarés), les splits, les entrées en chunks de 500 chaînés par SHA-256
de `H0` (les règles) à `Hn`, les chargements, les entrées utilisées, les signaux Reality, le hash de l'état final et la
preuve finale.

`H0` scelle aussi le monde (son hash, la politique de monde de la catégorie, le hash des preuves, la version de
l'algorithme Remix) : les mêmes entrées dans deux mondes font deux runs. Chaque hash porte sur `canonicalJson`. La
confiance exportée est toujours `local`. Un fichier de schéma 1 (4.1.14, 4.1.15) se lit toujours, comme un run Story.

> [!GUARANTEE id=schema1-not-requalified]
> Un run de schéma 1 présenté à une catégorie Remix est refusé (`legacy-world-missing`), jamais requalifié d'après sa
> graine.

Le format, champ par champ, est dans [Formats de fichiers](engine.file-formats.md).

<a name="verify"></a>

## Vérifier un run

Le vérificateur recharge la catégorie depuis le jeu, vérifie le monde du run contre le jeu (`loadVariant`) et contre
sa catégorie (`worldVerdict`, le jeton du jour ou l'engagement et la révélation Mystery vérifiés avec la clé que nomme
`remix.daily`), reconstruit ce monde, rejoue les entrées avec la graine du run (les tirages aléatoires sont refaits,
jamais pris dans le fichier), recalcule l'horloge, les splits, l'état final et la chaîne, puis vérifie les règles, et
nomme le classement où va le run (`world.leaderboardKey` : la catégorie, et pour Fixed et Daily la graine).

| Verdict | Codes |
|---|---|
| `valid` | `ok` |
| `valid-unranked` | `rta-unverifiable`, `mystery-unwitnessed` (un run Mystery : son heure de départ est la parole du client), `physical-wheel-unwitnessed` |
| `invalid-category-rule` | `unknown-category`, `hints-forbidden`, `saves-forbidden`, `pauses-forbidden`, `reload-forbidden`, `foreign-load`, `input-forbidden`, `reality-forbidden`, `seed-policy`, `start-trigger`, `world-policy`, `legacy-world-missing`, `daily-proof-missing`, `daily-proof-invalid`, `mystery-commitment`, `mystery-reveal`, `mystery-start-window`, `code-wheel-rule`, `code-wheel-proof` |
| `invalid-replay` | `envelope-shape`, `chunk-order`, `chunk-hash`, `chain`, `replay-diverged`, `rnd-mismatch`, `time-mismatch`, `splits-mismatch`, `final-state`, `not-finished`, `world-missing`, `world-shape`, `world-hash`, `world-value`, `world-constraint`, `world-stale`, `world-forged`, `world-algorithm`, `minigame-transcript` |
| `modified-game` | `fingerprint` |
| `missing-reality-proof` | `signal-missing`, `signal-signature`, `signal-mismatch` |
| `unsupported-version` | `schema`, `engine-version`, `prng-version`, `timing-version`, `rules-version` |
| `inconclusive` | `timeout`, `crash`, `no-keyring`, `package-not-approved` (le worker du Bridge) |

`inconclusive` n'est jamais valide.

<a name="trust"></a>

## Niveaux de confiance

`local` (chronométré par la machine du joueur) → `replay-valid` (un vérificateur autre que le client l'a rejoué) →
`server-witnessed` (le serveur a daté les chunks du run pendant qu'il était joué : réservé, aucun code ne le pose
encore) → `moderator-verified` (un humain muni du jeton d'administration du classement l'a regardé). Seul quelqu'un
d'autre que le client élève un niveau ; une enveloppe qui en réclame davantage est lue comme `local`. Le niveau
s'affiche dans les records, le Studio et le classement.

Ce que prouve `replay-valid` (4.1.17) : le run se rejoue sur le jeu, la catégorie et le monde qu'il nomme ; sa chaîne,
ses tirages, son état final et son temps logique concordent ; chaque résultat de minijeu venu avec un **transcript**
est celui que ses réponses donnent (les réponses de la roue, par leur place dans la liste de l'auteur, jugées à nouveau
sur la roue que fait le monde ; [ADR 0020](../../docs/dev/adr/0020-minigame-transcripts.md)). Il ne prouve pas qu'une
personne a donné ces réponses, que `inputsUsed`, les pauses ou le RTA sont complets, qu'une roue imprimée a servi, ni
que l'enveloppe n'a pas été fabriquée hors du lecteur : c'est `server-witnessed` ou `moderator-verified`, jamais
« anti-triche ».

La roue de code dans le `world.codeWheel` d'une catégorie (`{ enabled, skip, medium, proof? }`) :

- `enabled: false` la veut non jouée (passée ou désactivée) ; jouée quand même : `code-wheel-rule`.
- `skip: false` la veut gagnée.
- `proof: 'transcript'` refuse un résultat de roue sans ses réponses (`code-wheel-proof`) ; un transcript falsifié est
  `invalid-replay` (`minigame-transcript`).
- `medium: 'physical'` : un run qui a joué la roue est `valid-unranked` (`physical-wheel-unwitnessed`) tant qu'un
  modérateur ne l'a pas classé. `digital` et `either` sont la parole du joueur, non vérifiée.

La catégorie `wheel-proved` du chapitre de référence veut la roue gagnée et prouvée chaque fois qu'elle est jouée (la
roue reste facultative : une route qui n'ouvre jamais la carte ne la joue pas) ; ses autres catégories gardent la règle
de 4.1.16.

<a name="reality-policies"></a>

## Politiques Reality

- `forbidden` : aucun signal extérieur ; un signal dans le run est `reality-forbidden`.
- `recorded` : chaque signal appliqué est gardé avec son JWS signé, l'id de sa clé et son hash ; le vérificateur
  vérifie la signature avec les clés publiques du Bridge (`--keys`, `GET /v1/keys`). Sans preuve :
  `missing-reality-proof`.
- `live` : la même preuve, dans une catégorie à part (la latence et la disponibilité d'un signal en direct ne sont pas
  reproductibles). Sans les clés, le vérificateur ne peut pas conclure (`no-keyring`).

Ce que le Bridge garantit sur les signaux est dans [Garanties du Bridge](bridge.guarantees.md).

<a name="leaderboards"></a>

## Classements sur le Bridge

[`bridge/src/runs.ts`](../../bridge/src/runs.ts) est monté par `npm run bridge -- serve` quand la configuration a une
section `runs` (4.1.16 ; l'option `runs` de `bridgeServer` pour un hôte à soi) ;
[`bridge/src/daily.ts`](../../bridge/src/daily.ts) par une section `daily`. Les deux gardent leurs enregistrements dans
le store SQL (`--store=sqlite:<fichier>` pour une machine, ou `BRIDGE_STORE=postgres://…` pour plusieurs instances ;
`serve` les refuse sur le journal JSON-lines), migrations 0002 à 0004. Ils survivent à un redémarrage.

```json
"runs": {
  "games": { "reference": { "dir": "/srv/games/reference", "fingerprint": { "logic": "…", "trustedExtensions": "…", "presentation": "…", "engine": "…" } } },
  "worker": ["/usr/bin/node", "/srv/quest-n-click/node_modules/tsx/dist/cli.mjs", "/srv/quest-n-click/tools/speedrun/worker.ts"],
  "workers": 2
},
"daily": { "games": { "reference": { "daily": "daily", "mystery": "mystery" } }, "kid": "daily-2026", "keyFile": "daily.jwk", "secretFile": "daily.secret" }
```

`keyFile` (la JWK privée Ed25519 dont le manifeste du jeu nomme la moitié publique dans `remix.daily`) et `secretFile`
(le secret des jours) sont à côté de `config.json`, en mode 0600. Faire tourner la clé du jour, c'est publier le jeu
avec la nouvelle clé publique : le joueur et le vérificateur n'acceptent que la clé que nomme le manifeste, et un jeton
d'un autre `kid` est refusé.

**Soumettre.** `POST /v1/runs` avec `{ player, envelope }` rend l'id du run et un jeton de suppression. Les workers de
toutes les instances partagent une seule file : un run est **créé une fois** (sa clé est unique : deux instances qui
reçoivent le même run en créent un), **réclamé par un seul worker** sous un bail, et **réclamé de nouveau** quand son
worker est mort et que le bail a expiré ; un worker qui a perdu son bail ne peut pas enregistrer de verdict. Le
processus HTTP ne rejoue jamais.

**Le worker.** Chaque worker est un processus isolé ([`tools/speedrun/worker.ts`](../../tools/speedrun/worker.ts)) : un
tas borné, tué avec son groupe de processus à son budget de temps, un environnement qui ne contient que `PATH`, le
dossier du paquet du jeu et la taille du tas (aucun secret du Bridge), fetch, WebSocket, TCP, UDP et DNS refusés dans
le processus, le paquet vérifié contre son empreinte approuvée, sa réponse signée par une clé à usage unique.

> [!LIMIT id=worker-not-sandbox]
> Les refus réseau du worker sont une défense en profondeur, pas un bac à sable : voir le worker des speedruns dans
> [Sécurité du Bridge](bridge.security.md).

**Identité d'un run.** Un run est identifié par son jeu, sa catégorie, la graine du run et ses entrées (hors leurs
horodatages RTA), jamais par son monde : le premier qui le soumet le garde ; une copie réhorodatée ou rescellée dans un
autre monde est refusée.

**Limites.** Un client peut soumettre `perMinute` runs par minute (10 par défaut) ; un doublon ou un run invalide coûte
un jeton, un refus dit `Retry-After`. La file tient au plus `maxQueued` runs en attente ou en vérification (100 par
défaut). Avec `bridge serve` sur un store SQL, les deux valent pour toutes les instances ensemble (4.1.17) :
`maxQueued` est compté et écrit dans une seule transaction sous le verrou du tenant, et `perMinute` est un compteur par
client dans la table `run_quota`. Le client est l'adresse du socket, ou celle que nomme un proxy de confiance
(`--trust-proxy`) ; seul un HMAC en est gardé, avec un secret que chaque instance du tenant dérive de sa clé
d'événements. Faire tourner la clé d'événements (`kid`) fait tourner ce secret : chaque client repart d'un compteur
neuf (au plus une minute de quota en plus), et les anciens compteurs sont purgés avec les inactifs. Un hôte qui embarque
la bibliothèque sans limiteur SQL compte par instance. Une limite globale au proxy reste utile devant le tout.
L'enveloppe est jetée une fois le verdict enregistré ; les vieux runs sont purgés chaque heure.

**Lire un classement.** `GET /v1/runs?game=&category=[&key=][&limit=]` : runs valides seulement, le meilleur de chaque
**pseudonyme** (le Bridge ne connaît aucune identité de joueur : deux personnes qui choisissent le même pseudonyme font
une seule ligne), sur la **clé du vérificateur** (`world.leaderboardKey` : la catégorie, et pour un monde Fixed ou
Daily `<catégorie>:<graine>`). Des temps égaux partagent un rang, puis la soumission la plus ancienne passe devant. Le
store classe tous les runs avant de couper la réponse (4.1.17 : jusque-là, un run plus rapide soumis après les 10 000
premiers manquait) ; la réponse a 100 lignes, `&limit=` jusqu'à 1 000. Un temps est gardé canonique (décimal, sans zéro
de tête, 30 chiffres au plus) et ordonné comme un décimal, au-delà de `Number.MAX_SAFE_INTEGER` aussi. Un run Daily
envoyé après son jour est un entraînement (valide, non classé) ; un run Mystery est `valid-unranked` sans témoin
serveur. `&seed=fixed|random` filtre toujours les runs de 4.1.14.

**Un run.** `GET /v1/runs/<id>` le lit, `DELETE /v1/runs/<id>` avec `x-delete-token` le supprime,
`POST /v1/runs/<id>/moderate` avec le jeton d'administration élève un run valide à `moderator-verified`. Soumissions,
verdicts, modérations et suppressions sont des lignes d'audit du journal du Bridge.

**Le défi du jour.** `GET /v1/daily?game=[&date=]` signe la graine du jour (un vrai jour UTC, aujourd'hui ou dans
`retentionDays`, 30 par défaut) ; `POST /v1/commit` et `GET /v1/reveal/<id>` s'engagent sur une graine Mystery et la
révèlent, signés tous les deux. Jetons et engagements sont écrits une seule fois dans le même store SQL : toutes les
instances répondent la même chose. Le joueur garde le jeton d'un monde Daily à côté du monde, et un speedrun dans ce
monde le porte. Depuis 4.1.17, le menu Remix a une entrée **Monde mystère** : elle demande au Bridge du jeu un
engagement puis sa révélation, vérifie les deux hors ligne avec la clé du défi du jour, construit le monde et garde les
deux jetons à côté. Un speedrun lancé dans ce monde (dans la minute que la révélation permet : passé ce délai, la page
le dit et ne lance pas le run) les porte avec son heure de départ. Sans témoin serveur, un tel run est `valid-unranked`
(`mystery-unwitnessed`).

Un run interrompu puis repris garde son monde et sa preuve : le reprendre dans un autre monde, ou avec une autre
preuve, est refusé (`npm run e2e:remix-speedrun` le fait dans chaque monde). Faire tourner le Bridge lui-même est dans
[Installer et lancer le Bridge](bridge.install-run.md#leaderboards).

<a name="policies"></a>

## Politiques

- **Mods et extensions** : une catégorie nomme les composants d'empreinte qu'un run doit égaler. `logic` seul admet un
  mod qui change les images ou la musique ; `trustedExtensions` refuse celui qui change le code du jeu ;
  `presentation` refuse tout changement d'image. Un run dont les composants diffèrent est `modified-game`.
- **Anciennes versions du moteur** : un run est rejoué par le moteur sur lequel il a été enregistré. Le vérificateur
  ne rejoue que sa propre version et dit `unsupported-version` (`engine-version`) pour une autre : rejouez-le avec
  l'archive de cette version.
- **Rétention** : un classement garde un run 90 jours par défaut (`retentionDays`) et le supprime sur demande avec le
  jeton donné à la soumission.
- **Anonymat** : un classement montre un pseudonyme (2 à 32 lettres, chiffres, espaces, `_ . -` ; un email est refusé)
  et jamais rien d'autre du joueur. Les pseudonymes ne sont **pas authentifiés** : n'importe qui peut soumettre sous
  n'importe quel nom, et soumettre le premier un run publié sous le sien.
- **Fantômes sur cibles sémantiques** : un fantôme montre des lieux, des actions sur des ids et l'inventaire, jamais
  une traînée de pixels ; il est désactivé la première fois qu'une catégorie est jouée.

<a name="fairness"></a>

## Accessibilité et équité

Une catégorie déclare ses entrées (souris, tactile, clavier, manette, macros). Une option d'accessibilité n'est
**jamais une triche implicite** : la vitesse et la taille du texte, la réduction des animations et la police lisible ne
changent rien au temps de jeu (une réplique coûte le même temps logique à toutes les vitesses), et les cibles du clavier
et du lecteur d'écran sont les mêmes actions. Une catégorie qui interdit une entrée le dit ; les entrées utilisées par
un run sont déclarées par le client (sa parole, comme le RTA). Les options d'accessibilité du joueur sont dans
[Accessibilité](play.accessibility.md).

<a name="limits"></a>

## Limites

> [!LIMIT id=integrity-not-authenticity]
> Intégrité n'est pas authenticité : la chaîne prouve qu'un fichier n'a pas été modifié après son scellement, pas que
> le client a été honnête ; un client peut la recalculer. Pauses, menus, sauvegardes, RTA et entrées utilisées sont la
> parole du client.

- **`replay-valid` admet les runs assistés par outil** : un run dont un script ou le solveur a choisi les entrées se
  rejoue valide (le run de référence versionné est la route du solveur), tout comme un run repris après un crash (les
  entrées perdues après son dernier chunk ne sont pas dans son temps). Seuls un témoin ou un modérateur les écartent.
- **La graine d'une catégorie à graine aléatoire est le choix du client** : un joueur peut chercher hors ligne une
  graine facile. Les graines Mystery et Daily, données par un serveur, sont la réponse (depuis 4.1.15).
- **Pas encore fait** : le témoin en direct (`server-witnessed`), le rejeu par version épinglée dans le worker, de
  vraies sessions OBS et LiveSplit et des tests terrain par des speedrunners (passes humaines). Ce que 4.1.14 listait
  ici et qui a été fait depuis : un stockage SQL des runs et le montage de `/v1/runs` dans `bridge/src/server.ts`
  (4.1.16), l'e2e multi-navigateur (`npm run e2e:speedrun`) en CI.

<a name="references"></a>

## Références

- [ADR 0016](../../docs/dev/adr/0016-run-clock-and-envelope.md), [ADR 0017](../../docs/dev/adr/0017-speedrun-verdicts-and-trust.md),
  [ADR 0019](../../docs/dev/adr/0019-run-world-binding.md), [ADR 0020](../../docs/dev/adr/0020-minigame-transcripts.md).
- Les types : [`src/engine/core/types/speedrun.ts`](../../src/engine/core/types/speedrun.ts) ; le vérificateur :
  [`src/engine/tools/speedrun/verify.ts`](../../src/engine/tools/speedrun/verify.ts) et
  [`tools/speedrun/verify.ts`](../../tools/speedrun/verify.ts).
- [Remix](create.remix.md), [Formats de fichiers](engine.file-formats.md), [Speedrun pour les joueurs](play.speedrun.md),
  [Installer et lancer le Bridge](bridge.install-run.md).
