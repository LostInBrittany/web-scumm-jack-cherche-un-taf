# Notes de mise à jour : 4.1

Ce que chaque release de la ligne 4.1 a changé, de la 4.0 à la 4.1.20, conservé tel quel. La ligne 4.1 pouvait encore
casser, chaque rupture avec sa migration ([Stabilité et support](start.stability.md)) ; le SemVer strict commence à la 4.2.0. Deux ruptures
comptent pour un jeu qui la traverse : l'enveloppe de sauvegarde v4 (4.1.15, §27 ; toute sauvegarde plus ancienne se
charge encore) et le schéma 2 des `.wsrun` (4.1.16, §28). Les autres visent un hôte qui a écrit son propre `RunStore`
(§28, §29) et l'opérateur d'un Bridge (§31, §32).

Pour mettre à jour un jeu 4.1.x aujourd'hui, suivez [Mettre à jour](install.upgrade.md) : `quest-n-click migrate` fait
ce que ces notes demandent aux sources d'un jeu (le `tsconfig.json` de la 4.1.8, l'ancien nom de la 4.3.0). Lisez ces
notes pour ce qu'un hôte, un opérateur de Bridge ou un outil à vous doit changer. Les noms `web-scumm…` qu'elles
emploient sont `quest-n-click…` depuis la 4.2.5 ([Venir de web-scumm](install.from-web-scumm.md)). Les numéros de
section sont ceux de l'ancien `docs/fr/UPGRADING.md` : « §27 » retrouve donc sa section.

<a name="from-4-0-to-4-1"></a>

## 12. De la 4.0 à la 4.1 « Clarity »

Rien à changer dans un jeu. Le format du contenu, l'enveloppe de sauvegarde, les quatre entrées publiques et les outils
MCP sont ceux de la 4.0.0 (`tests/api-surface.json` est identique) ; `npm install` du nouveau paquet est toute la mise
à jour, et une sauvegarde 4.0 se charge. Dans ce dépôt : `npm run lint` est désormais `npm run lint:content` (l'alias
reste pendant toute la 4.x), et `npm run quality` ajoute Biome et le TypeScript plus strict à ce que la CI vérifie.

<a name="from-4-1-0-to-4-1-1"></a>
<!-- applies: 4.1.1.. -->

## 13. De la 4.1.0 à la 4.1.1 « Reality Bridge »

Rien à changer : chaque ajout est optionnel. Un jeu qui veut des signaux de l'extérieur déclare `reality`
([Le Reality Bridge : ce que c'est](bridge.what-it-is.md)), ajoute des scénarios sous `reality/scenarios/`, et fait tourner un Bridge (`web-scumm bridge`, ou
le paquet `web-scumm-bridge`). Une sauvegarde 4.1.0 se charge ; elle reçoit un état `reality` seulement quand un signal
est appliqué.

<a name="from-4-1-1-to-4-1-2"></a>
<!-- applies: 4.1.2.. -->

## 14. De la 4.1.1 à la 4.1.2 « Bridge fiable »

Rien à changer dans un jeu. Pour un Bridge : un `config.json` 4.1.1 sert et accorde encore (`grant` y lit la clé racine
tant qu'`init` n'a pas écrit un `root.key`) ; derrière un proxy inverse, lancer `serve --trust-proxy` pour que les
limites par adresse voient l'adresse du client ; `doctor` lit le journal, `compact` le réduit, Bridge arrêté. Le paquet
`web-scumm-bridge` tourne sur Node seul désormais (sans `tsx`). Une sauvegarde 4.1.1 se charge ; elle reçoit l'id de son
joueur au signal suivant.

<a name="from-4-1-2-to-4-1-3"></a>
<!-- applies: 4.1.3.. -->

## 15. De la 4.1.2 à la 4.1.3 « Gates honnêtes »

Rien à changer dans un jeu ni un Bridge. Dans ce dépôt : `npm test` ne lance plus les tests lourds du solveur
(`npm run test:heavy` le fait, chaque nuit) ; `npm run build:game` construit un jeu sans la suite unitaire ;
`release-check` est plus long (couverture, cross-check Rust, mutation du cœur). Les contributions à `main` passent par
une pull request.

<a name="from-4-1-3-to-4-1-4"></a>
<!-- applies: 4.1.4.. -->

## 16. De la 4.1.3 à la 4.1.4 « Moteur honnête »

Rien à changer dans un jeu. Un hôte qui embarque le moteur ou le joueur gagne `destroy()` pour les terminer, `onError`
pour entendre ce qui échoue, et `beforeSave` / `onLoad` là où il remplaçait `store.save` ou `engine.load` (ne le
faites plus : les hooks se composent). Les lignes de repli, de sorte et de don peuvent utiliser `{item}`, `{target}`,
`{name}` ; `{objet}`, `{cible}`, `{nom}` marchent toujours. Une sauvegarde 4.1.3 se charge telle quelle.

<a name="from-4-1-4-to-4-1-5"></a>
<!-- applies: 4.1.5.. -->

## 17. De la 4.1.4 à la 4.1.5 « Cœur réel »

Rien à changer dans un jeu, ni dans un hôte qui passe par l'API publique : `engine.session`, `begin`, `choose`,
`rand`, `destroy`, les hooks sont là où ils étaient. Un hôte qui atteignait les champs `@internal` `feed`, `open` ou
`sessionT0` du moteur les trouve sur `engine.sessions` (`feed`, `open`, `t0`) ; un qui atteignait `toScreen`,
`toLogical`, `setCamera`, `followHero`, `onCamera` ou `cam` de la vue de pièce les trouve sur `view.camera`, et
`walkTo`, `motion` et `clampFloor` (désormais `clamp`) sur `view.walker`. Une sauvegarde 4.1.4 se charge telle quelle.

<a name="from-4-1-5-to-4-1-6"></a>
<!-- applies: 4.1.6.. -->

## 18. De la 4.1.5 à la 4.1.6 « Outil de studio »

Rien à changer dans un jeu. Dans un checkout, les chemins `@game` de tsconfig.json passent par `.cache/game`, le lien
que `npm run game` crée (`dev`, `check` et `build` le créent aussi), et se rabattent sur `games/demo` quand il n'y en
a pas ; un `package.json` dont `config.game` nommait un jeu compte toujours, après le lien et `GAME`.
`npm run build` ne lance plus les tests pixel (`npm test` et la CI le font). `npm run doctor` sort 0 quand seuls
Python, ffmpeg ou WebKit manquent. `requirements.txt` épingle ses modules : `pip install -r requirements.txt` à
nouveau si les vôtres sont plus anciens. Une sauvegarde 4.1.5 se charge telle quelle.

<a name="from-4-1-6-to-4-1-7"></a>
<!-- applies: 4.1.7.. -->

## 19. De la 4.1.6 à la 4.1.7 « Docs pour un studio »

Rien à changer dans un jeu ni dans un hôte : la 4.1.7 change la documentation, les tests et les modèles du dépôt,
aucun code qu'un jeu exécute. Une sauvegarde 4.1.6 se charge telle quelle. Si vous gardez une copie d'`AGENTS.md`, sa
règle 14 et la section « Working in pairs » ont disparu ; [Votre premier jeu](create.first-game.md) est la page à donner à un nouveau
venu.

<a name="from-4-1-7-to-4-1-8"></a>
<!-- applies: 4.1.8.. -->

## 20. De la 4.1.7 à la 4.1.8 « Foundation Reset »

Une sauvegarde 4.1.7 se charge telle quelle. Le `tsconfig.json` d'un projet écrit par `create-web-scumm` avant la 4.1.8
a `baseUrl: "."` et des `paths` non relatifs, que TypeScript 7 refuse (TS5102, TS5090) : `web-scumm migrate` le
réécrit (la même configuration, dite relativement au fichier ; un commentaire du fichier n'est pas gardé), `--check` dit quand c'est dû. Les vérifications de types
du moteur tournent sur TypeScript 7 (`npm run tsc`) ; un outil à vous qui importe l'API du compilateur (`import ts from
'typescript'`) ne trouve pas d'API dans `typescript@7` et importe `@typescript/typescript6` à la place jusqu'à la 7.1
(docs/dev/MIGRATION-4.1.8.md). Vite 8 et Vitest 5 demandent Node 22.12 ou plus. Le service worker prend le contrôle
de la page à sa première activation (`clientsClaim`), donc le préchargement d'une première visite remplit les caches ;
une mise à jour attend toujours la bannière, après une sauvegarde durable. Chaque nom de
`web-scumm/{content,player,minigames,testing,reality}` porte `@public` ou `@extension` dans [API publique](engine.api.md) : ce que
`src/engine` exporte sans qu'une entrée le réexporte est interne, et environ quatre-vingts exports de ce genre ont
été dé-exportés ou retirés (aucune des cinq entrées n'a changé ; `tests/api-surface.json` est identique).
`npm run doctor -- --release` exige Python, ses modules et ffmpeg ; `npm run quality:baseline` écrit les trois chiffres
des README avec le JSON, donc un test de plus est suivi de cette commande. Un signal livré et non acquitté est livré
de nouveau depuis le curseur durable : un transport maison qui implémente `WorldSignalPort` garde la séquence
acquittée, pas la séquence reçue ([Le Reality Bridge : ce que c'est](bridge.what-it-is.md)).

<a name="from-4-1-8-to-4-1-9"></a>
<!-- applies: 4.1.9.. -->

## 21. De la 4.1.8 à la 4.1.9 « Gateways »

Une sauvegarde 4.1.8 se charge telle quelle ; aucun nom public des cinq entrées n'a bougé (`tests/api-surface.json`
identique). Un jeu peut déclarer `reality.connectors` (les mots que ses connecteurs peuvent proposer : optionnel,
validé). Les connecteurs sont un quatrième paquet, `web-scumm-connectors`, installé à côté du Bridge sur un serveur,
jamais dans le joueur : `npm run build` refuse désormais le JavaScript d'un jeu qui porte du code serveur
(`verify:dist`). Le script d'installation de `ssh2` tente une compilation native et échoue faute d'en-têtes : aucun
fichier `.node` n'en résulte, et `--ignore-scripts` est l'installation documentée ([Vue d'ensemble des connecteurs](bridge.connectors.md)). Un
contributeur écrit `changes/<slug>.md` au lieu de modifier le CHANGELOG (`changes/README.md`).

<a name="from-4-1-9-to-4-1-10"></a>
<!-- applies: 4.1.10.. -->

## 22. De la 4.1.9 à la 4.1.10 « Constellation »

Une sauvegarde, un jeu et une configuration de Bridge 4.1.9 continuent de fonctionner. **Le joueur** accepte
`WorldSignalV1` et le nouveau `WorldSignalV2` (ADR 0010 : le signal nomme son tenant, son environnement, son origine,
son lien et sa clé ; `verifySignal` refuse un V2 signé pour un autre contexte avec `audience-mismatch`, et un `keyId`
autre que celui de l'en-tête avec `key`). Un vérificateur ou un transport à vous qui lit le contenu voit `schema: 2`
venant d'un Bridge multi-tenant ou du simulateur du Studio, qui signe en V2 par défaut (`signalVersion: 1` garde le
V1). L'attente de `verifySignal` prend `versions`, `tenantId`, `environment`, `audience` et `sessionId` ;
`RealityClient` les prend en `context` et vérifie l'origine de la page par défaut. **Rupture annoncée (4.1.12) :** un
Bridge à un seul tenant signe en V1 par défaut pendant la 4.1.10 et la 4.1.11 (`init --signal-version=2` pour passer
au V2) ; à partir de la 4.1.12 tout Bridge signe en V2 et le joueur n'accepte plus que le V2. Un jeu en 4.1.10 ou plus
gère les deux : mettre à jour le jeu avant le Bridge.

**Le Bridge** lit et écrit par `RealityStore` (ADR 0009) : un code qui appelait directement les méthodes de `Bridge`
les attend désormais (`startPairing`, `claimPairing`, `revoke`, `forgetPlayer`, `exportPlayer`, `ack`, `unlink`,
`subscribe`, `streamAlive`, `playerOf`) ; les routes HTTP `/v1/*` ne changent pas. `Bridge.start` accepte un
`BridgeStore` de la 4.1.9 (comme tenant `default`) ou un `RealityStore`. La capacité est tirée quand le joueur réclame
son code (la réclamation renvoie aussi le `sessionId` du lien). Un `config.json` de la 4.1.9 sert depuis son journal
comme avant ; `npm run bridge -- migrate --from=jsonl --to=sqlite` (Bridge arrêté) le déplace dans SQLite, qui demande
Node 22.13 (`node:sqlite`). `--trust-proxy` seul ne fait plus confiance qu'à la boucle locale ; nommer les autres
proxies avec `--trust-proxy=<adresses ou réseaux>`. **Derrière un proxy qui n'est pas sur la boucle locale (le routeur d'un PaaS, un
répartiteur sur un autre hôte), tous les clients tombent désormais dans l'unique compartiment du proxy** (60 requêtes
anonymes par minute pour tout le monde) tant que `--trust-proxy=<son réseau>` ne le nomme pas. Plusieurs tenants et plusieurs instances : [Installer et lancer le Bridge](bridge.install-run.md).

<a name="from-4-1-10-to-4-1-11"></a>
<!-- applies: 4.1.11.. -->

## 23. De la 4.1.10 à la 4.1.11 « Viewport »

Une sauvegarde 4.1.10 se charge telle quelle ; les noms des cinq entrées sont additifs (`SceneFrame`, `Renderer`,
`Intent` sur `web-scumm/player` en `@extension` ; `SemanticEvent`, `SemanticJournal` sur `web-scumm/testing` ;
`Engine.journal`, `Engine.sessionSeq`). Ce qui a bougé : le crochet de test de la page `window.__game.inventory(…)`
devient `window.__game.presenter.inventory(…)` (un script e2e à vous qui l'appelait change une ligne) ; un fichier de
session porte désormais le journal sémantique et `npm run replay` sort en 1 quand celui du rejeu diffère (une session
de plus de 10 000 événements est exportée avec `journalTruncated: true` et sans journal) ; `npm run validate` refuse
une mise en page dont le polygone de masque d'occlusion ne ferme aucune surface (points colinéaires, arêtes qui se
croisent) ou dont une salle a une zone de marche qu'aucun lien ne joint, là où la 4.1.10 l'acceptait : corrigez la
mise en page dans l'onglet Rooms du Studio (couches, masques, zones, portails) ou à la main. Le JavaScript de la
première visite pèse 122 Ko gzippés (120 en 4.1.10).

<a name="from-4-1-11-to-4-1-12"></a>
<!-- applies: 4.1.12.. -->

## 24. De la 4.1.11 à la 4.1.12 « Language »

Aucun format d'écriture ne change : `web-scumm migrate --check` trouve à jour les jeux fournis et le gabarit
(`tests/migrate-official.test.ts` ; un projet 4.1.11 n'a rien à migrer non plus), et une sauvegarde 4.1.11 se charge telle quelle (les objectifs accomplis ne sont pas dans la sauvegarde : ce
qui est vrai au chargement compte comme fait). Ce qui est nouveau s'ajoute. Un jeu peut déclarer `objectives`
(ADR 0014, CONTENT_GUIDE « Objectifs et journal de quêtes ») : le menu pause les liste, le journal sémantique dit
`objectiveCompleted`, `npm run solve -- --goal=100%` les atteint, le validateur refuse celui qui ne peut jamais
s'accomplir. Un hôte abonné à `Engine.journal` voit ce genre pour un tel jeu. Le menu pause a une ligne d'empreinte
dans chaque jeu (`ui.fingerprint`, « Build » par défaut en anglais) : un jeu dont la langue de sortie n'est pas
l'anglais ajoute cette clé, et `ui.objectives` s'il déclare des objectifs, à son `ui` et à ses tables
(`npm run i18n -- status` liste les clés laissées aux valeurs anglaises). `web-scumm/content` gagne `compileIR`,
`canonicalJson`, `provenanceOf`, `logicView`, `completionGoal` et les types de l'IR ; `web-scumm/testing` gagne
`fingerprint`, `fingerprintGame`, `presentationOf`, `hashSources`, `sha256Hex`, `shortFingerprint` ; MCP gagne
`get_ir`, et `set_value` écrit les objectifs avec `id: "@game"`. Un build livre désormais `site.json` (celui du jeu,
avec l'empreinte des extensions de confiance et la version du moteur), que `npm run verify:dist` attend. Le cache de
preuves du solveur est indexé par `canonicalJson` : les entrées de 4.1.11 ne sont pas reprises, le prochain passage le
remplit de nouveau. Le DSL est stabilisé (D22, `docs/dev/DSL-STABILITY.md`) : désormais, changer un nom ou un sens
stable s'accompagne de sa migration.

<a name="from-4-1-12-to-4-1-13"></a>
<!-- applies: 4.1.13.. -->

## 25. De la 4.1.12 à la 4.1.13 « Solver Research »

Une sauvegarde, un jeu et un Bridge 4.1.12 continuent de fonctionner ; aucun nom public n'a bougé
(`tests/api-surface.json` additif). La commande du solveur gagne `--checkpoint=<fichier>`, `--checkpoint-every`,
`--resume`, `--mem=<Mo>`, `--profile`, `--symmetry`, `--workers` et `--representation=objects` (le stockage de la
4.1.8, pour comparer) ; une recherche coupée par un budget est `truncated`, jamais `proved`, avant comme après une
reprise. `npm run test:heavy` gagne le cas checkpoint de la matrice et `npm run prove:matrix` (le job `matrix` de la
nuit) prouve les douze instances de `docs/dev/PROOF-MATRIX.md`. Une cause de softlock dans `npm run solve -- --json`
porte désormais ses entrées de session, que `npm run replay` rejoue.

<a name="from-4-1-13-to-4-1-14"></a>
<!-- applies: 4.1.14.. -->

## 26. De la 4.1.13 à la 4.1.14 « Time Attack »

Pas de changement du format d'écriture : un jeu 4.1.13 et ses sauvegardes se chargent tels quels, et `speedrun` est un
champ facultatif ([Speedrun pour les auteurs](create.speedrun.md)). Ce qu'un hôte ou un outil peut voir changer :

- **`SESSION_MAX` vaut 500, plus 5 000.** La 501e entrée d'une session ouvre une nouvelle session depuis l'état courant
  (de genre `load`), comme la 5 001e le faisait. Un hôte qui lit `Engine.session` (ou `Engine.sessions`) pour exporter
  un rapport de bug obtient au plus les 500 dernières entrées : un long playtest fait plusieurs fichiers de session, et
  un speedrun garde tout son historique en chunks chaînés de 500 (`web-scumm-runs` dans IndexedDB). `replay()` suit
  désormais une session au travers de son renouvellement.
- **`engine.random` est à graine par défaut.** Il tire dans le flux `logic` du run (xoshiro128**, `core/prng.ts`), plus
  dans `Math.random`. Un hôte ou un test qui veut l'ancien comportement pose `engine.random = Math.random` ; celui qui
  veut une suite connue pose `engine.sessions.nextSeed = '<graine>'` avant `newGame()` ou `checkpoint()` (la session
  écrit alors `Session.seed`). Une session que personne n'a semée s'écrit comme avant (sans `seed`), et les tirages
  enregistrés (`rnd[]`) la rejouent toujours.
- **L'horloge du run** (`Engine.runClock`) est nouvelle et ne fait qu'observer ; `Engine.clock` garde son sens.
- **`RealityClientOptions.onSigned(jws, entry)`** est appelé avec le JWS signé de chaque signal avant qu'il soit
  appliqué (le speedrun le garde comme preuve Reality) ; un client à soi peut l'ignorer.
- **De nouveaux textes d'interface** pour un jeu avec `speedrun` : `ui.speedrun`, `ui.exportRun`, `ui.abandonRun`
  (valeurs anglaises par défaut « Speedrun », « Export run », « Abandon run ») ; un jeu dans une autre langue les ajoute.
- **La release porte un neuvième fichier**, `web-scumm-<tag>-reference-any.wsrun` : un run Any% complet du chapitre de
  référence, vérifié par `npm run speedrun:verify` avant d'être attaché. Un outil qui compte les fichiers d'une release
  le compte.
- **Nouveaux noms publics** : `SpeedrunManifest`, `SpeedrunCategory`, `SpeedrunSplit`, `SpeedrunTrigger`,
  `SemanticTrigger` (content), `RunClock`, `verifyRun`, `isRankable`, `VerifyContext`, `SpeedrunVerifyResult`,
  `SpeedrunVerdict`, `SpeedrunEnvelope`, `TrustLevel` (testing) ; l'outil MCP `speedrun_verify` ; le
  `web-scumm speedrun verify` de la CLI.

<a name="from-4-1-14-to-4-1-15"></a>
<!-- applies: 4.1.15.. -->

## 27. De la 4.1.14 à la 4.1.15 « Remix »

**Une rupture de la ligne 4.1 : l'enveloppe de sauvegarde v4.** Une sauvegarde s'écrit désormais en
`SaveEnvelopeV4` (`schema: 4`) : l'enveloppe v3 et le `WorldVariant` dans lequel la partie a été jouée. `parseSave` lit
v3 et v4 ; une sauvegarde v3 (toute sauvegarde faite avant 4.1.15) migre vers le monde **histoire**
(`upgradeEnvelope`) et se charge comme avant ; les sauvegardes de référence de 3.0.0 à 4.1.9 se chargent sur 4.1.15
(`tests/save-v3.test.ts`). Ce qui casse : un code qui écrivait ou lisait lui-même `schema: 3` (un hôte qui range les
sauvegardes ailleurs, un outil qui vérifie le schéma de l'enveloppe) voit maintenant `schema: 4` et un champ `variant` ;
une sauvegarde faite dans un monde Remix refuse de se charger dans un autre monde (`SaveWorldMismatch`, qui nomme le
monde à reconstruire avec `applyVariant`). Une sauvegarde 4.1.15 ne se charge pas sur 4.1.14 (son schéma y est
inconnu) : revenir en arrière n'est pas pris en charge.

**Tout le reste est additif.** Un jeu peut déclarer `remix` (un manifeste de variance) et ses salles `anchors`
([Remix](create.remix.md)) ; sans eux rien ne change : un seul monde, l'histoire, la même IR et la même empreinte. Les
drapeaux réservés `remix.*` sont écrits par le moteur : un jeu qui utilisait déjà un drapeau nommé
`remix.<quelque chose>` le renomme (le validateur refuse une commande qui en pose un ; aucun dans les jeux livrés). Un jeu avec un
manifeste montre un bouton **Remix** sur son écran titre et une ligne de monde dans son menu pause : un jeu dont la
langue de release n'est pas l'anglais ajoute les clés `ui.remix*` (`remix`, `remixTitle`, `remixStory`, `remixRandom`,
`remixSeed`, `remixDaily`, `remixPlay`, `remixInvalid`, `remixWorld`, `remixHidden`, `remixCopied`, `remixNoBridge`) à
son `ui` et à ses tables (`npm run i18n -- status` liste celles laissées à l'anglais). Les minijeux livrés gagnent
`code-wheel`. Ils tirent de `MinigameCtx.random` (le flux `minigame:<id>`
de la partie) au lieu de `Math.random` : le minijeu propre d'un jeu peut faire de même (`random(ctx)` se replie sur un
flux fixe quand un hôte n'en donne pas). `Session.variant` et `IrVariantSlot.variant` sont de nouveaux champs optionnels ; `ir.world.remix` et
`ir.rooms[].anchors` apparaissent quand un jeu les déclare. Nouvelles commandes : `npm run remix`, `npm run
verify:variants` (dans `verify:game`), `npm run code-wheel`, `npm run e2e:remix`.

**Le DSL et l'IR sont gelés** (D28, `docs/dev/DSL-STABILITY.md`) : 4.1.15 est la release candidate de 4.2. Désormais
un changement de nom ou de sens du DSL ou de l'IR attend le SemVer strict de 4.2.0, avec sa migration.

<a name="from-4-1-15-to-4-1-16"></a>
<!-- applies: 4.1.16.. -->

## 28. De la 4.1.15 à la 4.1.16 « Convergence »

**Une rupture de la lignée 4.1 : l'enveloppe `.wsrun` de schéma 2.** Un run s'écrit maintenant avec `schema: 2` : la
graine du générateur du run est `runSeed` (c'était `seed`), le monde exact où il s'est joué est `variant`, et un run
Daily ou Mystery porte les jetons signés du Bridge dans `worldEvidence` ; le tout est scellé dans `h0`. Un fichier de
schéma 1 (4.1.14, 4.1.15) se lit et se vérifie toujours, comme un run Story ; présenté à une catégorie Remix il est
refusé (`legacy-world-missing`). Ce qui casse : un outil qui lisait `envelope.seed` lit `runSeed` en schéma 2 ; une
enveloppe avec un champ qu'elle ne définit pas est refusée (`envelope-shape`). Un recorder repris depuis un point de
reprise de la 4.1.15 refuse de continuer (son monde n'y est pas) : recommencer le run.

**Une rupture pour les hôtes qui écrivaient leur propre `RunStore`** (bibliothèque du Bridge) : le store est celui de
la file durable (`create`, `claimNext`, `complete`, `setTrust`, `queued`, `board`, `summary`) ; `MemoryRunStore` et
`SqlRunStore` sont fournis. `DailyStore` est asynchrone (`get`, `putIfAbsent`) ; `SqlDailyStore` prend le tenant. Une
base du Bridge migre au schéma 2 (`runs`, `daily_kv`) à son prochain démarrage ; `bridge migrate --schema=1` revient.

**Additif.** Une catégorie de speedrun peut nommer son monde (`world: { policy, mode, fixedSeed?, codeWheel? }`, D29) ;
le `seed: 'daily' | 'mystery'` de la 4.1.15 sans `world` se lit comme ce monde, avec un avertissement du validateur.
Le résultat d'un minijeu est enregistré (`SessionEntry.mg`) et écrit dans le drapeau réservé `minigame.<id>` (une
commande n'en pose jamais : le validateur la refuse) ; dans le joueur, chaque minijeu joué laisse ce drapeau dans la
sauvegarde. Une révélation Mystery du Bridge porte un `token` signé. `bridge serve` monte `/v1/runs` et le défi du
jour quand la configuration a des sections `runs` et `daily` (store SQL). Nouvelles commandes : `npm run
e2e:remix-speedrun`, `npm run docs:truth`, `npm run test:mutation:reality`, `test:mutation:remix`,
`test:mutation:speedrun`. La sauvegarde de référence de la 4.1.16 rejoint `tests/save-v3.test.ts` ; toutes les plus
anciennes se chargent encore.

<a name="from-4-1-16-to-4-1-17"></a>
<!-- applies: 4.1.17.. -->

## 29. De la 4.1.16 à la 4.1.17 « Stabilization »

**Une rupture pour les hôtes qui ont écrit leur propre `RunStore`** (bibliothèque du Bridge) : `board(tenantId, gameId,
categoryId, key, limit)` devient `board(query: LeaderboardQuery)` et rend des lignes classées `{ run, rank }` (le
meilleur de chaque pseudonyme, les ex aequo au même rang, puis la limite) ; `admit(run, maxQueued)` (`created |
duplicate | full`, une seule étape sous le verrou du tenant) est nouveau et c'est lui qu'appelle `RunQueue.submit`.
`MemoryRunStore` et `SqlRunStore` implémentent les deux. Une base du Bridge migre vers le schéma 3 (les temps classés
rendus canoniques, un index) et 4 (`run_quota`) au démarrage suivant ; `bridge migrate --schema=2` revient en arrière.

**Comportement.** `GET /v1/runs` répond 100 lignes par défaut, `&limit=` jusqu'à 1 000 (il lisait jusqu'à 10 000 runs
dans l'ordre de soumission, et pouvait manquer un temps plus rapide). Un temps classé est gardé canonique (`"00042"`
est `"42"`). `perMinute` vaut pour toutes les instances d'un tenant avec `bridge serve` sur un store SQL (un hôte qui
embarque la bibliothèque garde le `MemoryLimiter` par instance sauf s'il passe un `SqlLimiter`) ; un 429 dit
`Retry-After`. `runs.adminTokenFile` est nécessaire à la route de modération, et `serve` refuse un fichier absent, trop
court ou lisible par d'autres.

**Ajouts.** Un minijeu peut rendre `{ result, transcript }` depuis `Presenter.minigame` ; la roue de code le fait, et
la session garde `SessionEntry.mgt` à côté de `mg` (ADR 0020) ; une catégorie de speedrun peut demander
`codeWheel.proof: 'transcript'` ; `medium: 'physical'` rend `valid-unranked` sans modérateur un run qui a joué la
roue. Le menu Remix a une entrée Monde mystère. Nouvelles commandes : `npm run runs:load`, `npm run
e2e:worker-container`, `npm run release-check:local`, `npm run test:mutation:runs`, `npx tsx tools/oracle-case.ts`,
`node tools/speedrun/container.mjs`. Pour les mainteneurs : `ship tag` demande `--candidate=<id du run>` d'un run
`candidate` vert lancé sur main pour ce SHA. La sauvegarde figée de la 4.1.17 rejoint `tests/save-v3.test.ts` ; toutes
les plus anciennes se chargent toujours.

<a name="from-4-1-17-to-4-1-18"></a>
<!-- applies: 4.1.18.. -->

## 30. De la 4.1.17 à la 4.1.18 « Dress Rehearsal »

**Rien à changer dans un jeu.** Aucun nom public ni format ne bouge ; une sauvegarde 4.1.17 se charge et atteint sa
fin, et un projet 4.1.17 se met à niveau avec `migrate` (le candidat le fait sur trois systèmes).

**Pour un opérateur de Bridge.** `BRIDGE_STORE_FILE` lit l'URL du store depuis un fichier (un secret monté en
fichier) ; nommé mais absent ou vide, il arrête le Bridge en disant pourquoi ; `--store=` et `BRIDGE_STORE` passent
avant lui. `backup` écrit le schéma 2 sur un store SQL : les classements (`runs`) et les enregistrements du défi du jour
aussi, qu'une sauvegarde 4.1.17 oubliait — en refaire une après la mise à niveau ; `restore` lit les deux schémas et
refuse des runs déjà présents sans `--force`. `ops/qualify/` est un déploiement de
référence (HTTPS, trois instances, Postgres) à porter ailleurs ; `npm run ops:qualify` le répète. La release joint
aussi `web-scumm-connectors-<version>.tgz`.

**Pour les mainteneurs.** Les passes humaines sont des rapports du Field Kit (`npm run field:init|check|report|bundle`,
[Passes de terrain](contribute.field-passes.md)) et des issues `field-pass` ouvertes ; les notes de release ne comptent comme fait que `passed`.
Chaque ensemble de mutation est bloquant (`connectors` et `reality-store` aussi) ; `release.yml` lit le `GATED` du tag.
`npm run external-consumer` installe les quatre archives hors du dépôt. La sauvegarde de référence de la 4.1.18
rejoint `tests/save-v3.test.ts`.

<a name="from-4-1-18-to-4-1-19"></a>
<!-- applies: 4.1.19.. -->

## 31. De la 4.1.18 à la 4.1.19 « Field Closure »

**Rien à changer dans un jeu.** Aucun nom ni sens de l'écriture ne bouge (la fenêtre DSL de D33 n'a rien admis) ; une
sauvegarde 4.1.18 se charge et atteint sa fin, et un projet 4.1.18 se met à niveau avec `migrate`. Le candidat porte
vers les nouvelles archives des jeux créés en 4.1.17, 4.1.16 et 4.1.18-rc.1, chaque ancien moteur vérifié d'abord
contre les sommes de sa release.

**Pour un opérateur de Bridge.**

- `backup` écrit le **schéma 3** (ADR 0021) : un seul instantané en lecture seule de chaque tenant, run et
  enregistrement du jour, avec le backend, les versions du Bridge et du schéma SQL, les comptes et un SHA-256 de la
  charge utile, écrit dans un fichier temporaire puis renommé. `--max-rows` et `--max-bytes` le bornent. Refaire une
  sauvegarde après la mise à niveau.
- `restore` lit les schémas 1, 2 et 3, de façon bornée, vérifie chaque ligne avant d'ouvrir le store, et écrit tout
  dans une seule transaction comparée au fichier avant le commit. Un échec laisse le store tel qu'il était et dit
  « rien de restauré » ; le code de sortie 3 signifie que l'issue du commit est inconnue, ou que la relecture qui le suit
  diffère (un P0) : vérifier le store avant de recommencer. Un enregistrement du jour déjà présent est désormais un conflit : refusé sans `--force`, remplacé avec.
- **Rupture :** `restore` vers le journal JSON lines est refusé. Migrer d'abord le journal
  (`migrate --from=jsonl --to=sqlite`), puis restaurer.
- Les archives du Bridge et des connecteurs portent leur `npm-shrinkwrap.json` : une installation ne résout rien.
- La release joint l'image de qualification du Bridge telle que le candidat l'a construite et qualifiée :
  `web-scumm-bridge-image-<tag>.tar`, ses identités dans `web-scumm-bridge-image-<tag>.json` (empreinte de la config,
  du manifeste OCI, SHA-256 de l'archive) et son SBOM. Le Caddy d'`ops/qualify/` tourne sans privilège et en lecture
  seule.
- `npm run ops:qualify` répète aussi Daily et Mystery entre instances, un run vérifié, son doublon et sa modération,
  une instance tuée pendant que son worker vérifie, le quota de soumission partagé, 20 000 runs, une restauration après
  la destruction de la topologie, et un store écrit par le Bridge 4.1.17 (`--old-bridge=<tgz>` hors ligne). `--short`
  (le `deployment-smoke` du candidat) laisse de côté la reprise, le quota et le store 4.1.17, et met 200 runs au
  classement.

**SBOM.** Cinq fichiers CycloneDX, produits par le candidat depuis le contenu de chaque archive :
`web-scumm-<tag>-sbom.cdx.json`, `create-web-scumm-<tag>-sbom.cdx.json`, `web-scumm-bridge-<tag>-sbom.cdx.json`,
`web-scumm-connectors-<tag>-sbom.cdx.json` et `web-scumm-bridge-image-<tag>-sbom.cdx.json`. Le premier garde son nom
mais change de sens : il décrit le **paquet du moteur** tel qu'un jeu l'installe (Vite et ses outils compris), et non
plus les dépendances d'exécution de la racine du dépôt. Un outil qui le lisait ainsi lit désormais le `package.json` de
la racine.

**Pour les mainteneurs.**

- L'ensemble de mutation `connectors` devient `connectors-pure` ; l'ancien nom reste un alias jusqu'à la 4.2
  (`--set=connectors` marche encore, et `release.yml` traduit le nom d'un tag plus ancien). `connectors-edge` et
  `reality-store-postgres` sont mesurés chaque nuit et ne bloquent rien encore (`docs/dev/MUTANTS.md`).
- Les locks du Bridge et des connecteurs vivent dans `scripts/locks/` (`npm run locks`, puis commit) ; un lock qui ne
  correspond plus à son `package.json` arrête `pack`.
- Un bundle du Field Kit est au schéma 2 : il porte le manifeste du candidat et son attestation, et
  `npm run field:verify-bundle` le vérifie à partir du seul bundle (hors ligne contre une racine de confiance
  enregistrée, ou en ligne). `ship` et le Field Kit partagent `tools/release/provenance.mjs`.
- `npm run connector-archive-e2e` joue les quatre connecteurs depuis leurs archives. La configuration Vite ne charge plus
  le Studio ; un plugin à vous qui importait du code du Studio depuis `vite.config.ts` le charge par le serveur de dev.
- La sauvegarde de référence de la 4.1.19 rejoint `tests/save-v3.test.ts`.

<a name="from-4-1-19-to-4-1-20"></a>
<!-- applies: 4.1.20.. -->

## 32. De la 4.1.19 à la 4.1.20 « Last Mile »

**Pour qui exploite un Bridge.**

- **`restore` dit son mode.** `restore --from=<fichier>` sans `--mode` est refusé (code de sortie 2) et ne restaure
  rien. Un script de la 4.1.19 ajoute `--mode=merge` : la restauration de la 4.1.19 inchangée pour un fichier de
  schéma 1 à 3 (`--force` compris) ; un fichier de schéma 4 parle aussi des quotas de speedrun de ses tenants, sauf
  s'il vient d'un journal (`tenants-only`). `--mode=replace-store --yes-replace-store --safety-out=<nouveau fichier>` est nouveau : il fait du store la
  sauvegarde ([Installer et lancer le Bridge](bridge.install-run.md)).
- **Une sauvegarde est de schéma 4.** Elle porte le quota des speedruns, dit ce qu'elle contient (`completeness`) et a
  une empreinte de toute l'enveloppe. Les fichiers des schémas 1 à 3 sont toujours lus, pour `--mode=merge` seulement :
  rien sous leur empreinte ne dit qu'ils contiennent chaque famille, donc `replace-store` les refuse. Deux sauvegardes
  du même store n'ont plus la même empreinte, puisqu'elle couvre leurs dates. **Un Bridge 4.1.19 ne lit pas un
  fichier de schéma 4** : revenir à la 4.1.19 après une sauvegarde prise par la 4.1.20 demande une sauvegarde prise par
  la 4.1.19 (ou `pg_dump`).
- **Baux de maintenance (schéma 5).** Le store passe au schéma 5 dès qu'un Bridge ou une commande 4.1.20 l'ouvre
  (migration 0005, la table `maintenance`). Dès lors, `restore` refuse tant qu'une instance sert ou qu'une commande
  écrit. **Arrêter tous les Bridges antérieurs à la 4.1.20 avant la première restauration** : un ancien Bridge ne prend
  aucun bail et ne serait pas vu. `migrate --schema=4` (ou moins) défait d'abord 0005 ; arrêter alors tous les
  écrivains, comme avant la 4.1.20.
