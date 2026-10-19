# Migrer un jeu de v2 vers v3

La v3 casse volontairement une fois le contrat d'écriture afin de rendre ensuite les sauvegardes durables. Faire la
migration sur une branche, garder une sauvegarde v2 représentative et ne pas traduire ni réordonner le contenu avant
d'avoir posé les ids ci-dessous.

## 1. Établir la référence v2

Sur le dernier commit v2, exporter des sauvegardes aux checkpoints importants et garder une session complète. Noter :

```bash
GAME=<id> npm run validate
GAME=<id> npm run solve
GAME=<id> npm test
```

Ne jamais committer dans ce dépôt public le contenu du jeu privé ni les sauvegardes exportées des joueurs.

## 2. Activer le schéma v3

Ajouter `schemaVersion: 3` à `defineGame({...})`. `compileGame` clone et normalise la source ; la valeur v3 compilée
est figée. Une intégration ne doit donc plus dépendre de `engine.game === source` ni la modifier après construction.

Laisser l'outil écrire les ids, puis les relire :

```bash
npm run ids                  # simulation : ce qui serait écrit, ce qui reste à faire à la main
npm run ids -- --write --map # écrit les ids dans rooms/*.ts, rules.ts, game.ts ; renomme les clés de locales/*.json ;
                             # écrit ids.migration.json (renameSeen / renameCounter) et ids.paths.json
```

Il nomme d'après le contenu (`house.open-pantry`, `house.grandma.where-is-the-key`, `house.open-pantry.once`,
`clock.wait`), de façon unique dans le jeu et déterministe. Ce qu'il pose : un `id` sur chaque `Rule` de lieu ou
globale, `TalkTopic`, `Choice`, `EventRule`, bloc `once` / `nth` / `cycle` / `random` ; sur chaque script, une entrée
`stepIds` par commande de premier niveau. Les listes construites par du code (un spread, un `.map(...)`) sont sautées
et rapportées avec l'id attendu par le moteur : ajoutez-le dans le générateur. Puis trois lignes à la main dans
`game.ts` : `schemaVersion: 3`, `saveVersion` + 1, `migrations: [idsMigration]` avec `import idsMigration from
'./ids.migration.json'`. `npm run validate` refuse un jeu v3 avec un id manquant ou en double ; `npm run ids` se
relance à volonté (rien n'est renommé deux fois). Les règles de sortie générées reçoivent des ids déterministes.

## 3. Migrer les sauvegardes volontairement

Le navigateur stocke une enveloppe `web-scumm-save` de schéma 3 dans IndexedDB. Au premier lancement v3, l'ancienne
autosauvegarde localStorage `<jeu>.save` est importée une fois et supprimée seulement après relecture de l'écriture.
Les emplacements manuels (`saves.slots`) vivent dans la même base, en enveloppes, vérifiés de la même façon ; les
entrées v2 `<jeu>.slot.<n>` sont importées une fois aussi. Un fichier importé depuis le menu de sauvegarde atterrit
en plus dans le premier emplacement libre.

Incrémenter `saveVersion` pour tout changement d'état et fournir une `Migration` par étape entière. En plus des champs
v2, la v3 sait migrer :

```ts
migrations: [{
  from: 2,
  renameCounter: { 'maison:on3.0': 'garde_manger.premiere_ouverture' },
  renameSeen: { 'topic.maison/grandmere[0]': 'topic.grandmere.demander_cle' },
  renameScript: { vieille_horloge: 'horloge' },
  renameScriptStep: { horloge: { 'step.1': 'carillon' } },
  renamePlayer: { enfant: 'laverne' },
  renameCharacter: { ancienne_grandmere: 'grandmere' },
  dropCounter: ['gag_temporaire'],
  dropSeen: ['choix_supprime'],
  dropScript: ['ronde_supprimee'],
}],
```

Ne convertir une ancienne clé positionnelle de compteur, sujet ou script que si le contenu v2 et son sens sont connus.
Il n'existe aucune conversion universelle sûre après un réordonnancement ou une traduction. Une référence facultative
périmée non mappée est élaguée avec un avertissement visible ; JSON mal formé, autre jeu, lieu courant absent ou joueur
actif inconnu sont refusés sans remplacer la session courante.

## 4. Mettre à jour traductions et mini-jeux

En v3 les chemins de traduction nomment par id (`room:house/on.house.open-pantry.do[1]`, `talk.grandma.<id>.topic`,
`.choice.<id>.text`, `events.<id>.do`) ; `npm run ids -- --write` a renommé les tables existantes (`ids.paths.json`
garde la correspondance). Lancer `npm run i18n -- extract --lang <xx>` pour chaque langue livrée. La v3 extrait aussi les libellés/mots de liaison
des verbes et les chemins déclarés dans `textParams` par chaque mini-jeu. Lancer ensuite `npm run i18n -- status` et
traduire toute nouvelle entrée.

Un mini-jeu personnalisé doit déclarer `required` et `textParams` afin que validation et traduction comprennent ses
paramètres. Les ids d'assets gardent la convention `planche/case` et sont découverts par les outils d'assets.

## 5. Mettre à jour les commandes de développement et de CI

- `npm run dev` et `npm run studio` sont limités à la boucle locale.
- Utiliser `dev:lan` / `studio:lan` depuis un téléphone et ouvrir l'URL avec jeton affichée.
- `npm test` est la suite Node ; `npm run test:assets` est la suite d'assets adossée à Python.
- `npm run build` exige validation et chemin gagnant, pas une preuve illimitée de l'espace d'états.
- `npm run prove:game` prouve graphes global et par chapitre et échoue sur softlock ou troncature.
- `npm run release-check` inclut prérequis, build, preuve exhaustive et audit des dépendances.

Ne pas activer de réduction d'ordre partiel en mode preuve tant que son équivalence avec l'exploration de référence
n'est pas démontrée pour la classe de jeux concernée.

## 6. Vérifier le jeu migré

```bash
GAME=<id> npm run doctor
GAME=<id> npm run build
GAME=<id> npm run prove:game
GAME=<id> npm run e2e -- http://127.0.0.1:5173/ --prod
```

Charger chaque sauvegarde v2 représentative et vérifier lieu, joueur actif, inventaires, choix persistants et étape de
script. Dans un fixture de test, réordonner une règle, un sujet, un choix et une étape de script : la même sauvegarde v3
doit garder son sens. Enfin, tester la PWA de production en ligne, hors ligne dans un lieu jamais visité
(`npm run e2e:pwa` le fait) et pendant une mise à jour. Le jeu entier est mis en cache après la première visite,
sauf si le jeu dit `offline: 'nearby'` (décision D5).

## 7. En un coup d'œil

**Ce qui migre tout seul.** L'autosave v2 est importée dans IndexedDB au premier lancement v3 et vérifiée avant que
l'ancienne clé disparaisse. Une sauvegarde qui cite quelque chose que le contenu n'a plus est élaguée avec un toast
(`ui.saveAdjusted`), jamais refusée. Sans `id`, un bloc `once` / `nth` / `cycle` / `random` garde sa clé v2 par position,
les compteurs v2 survivent. Le témoin du solveur est inchangé (le jeu privé de référence : 59 actions, 355 états, 0,3 s
dans les deux versions).

| v2 | v3 |
|---|---|
| `npm run dev` écoute le réseau | `npm run dev` écoute 127.0.0.1 ; `npm run dev:lan` / `studio:lan` impriment une URL à jeton de session pour le téléphone |
| `npm test` lance tout | `npm test` = tests Node ; `npm run test:assets` = tests d'images (Python) ; `npm run check` = tsc + tests Node |
| `npm run build` = tsc + tests + vite | `npm run build` = `check` + `test:assets` + `verify:game` (validate, solve, `--chapters`, i18n status) + vite + spoilers + audit des assets |
| — | `npm run prove:game` = `--prove` et `--prove --chapters`, la porte exhaustive des softlocks, lancée par `release-check`, jamais par `build` |
| `npm run audit` | `npm run audit` (assets, noms privés) + `npm run audit:deps` (npm audit, dépendances de production) |
| — | `npm run doctor`, `npm run e2e:smoke`, `npm run e2e:pwa`, `npm run release-check` |

**Codes de sortie du solveur.** `0` résolu sans invariant cassé ; `1` non résolu, softlocks, erreurs ou invariant
cassé ; `2` tronqué. `--json` gagne `status`, `mode`, `softlocks`, `assumptions` ; la sortie humaine gagne une ligne
après le verdict (`Witness status:` / `Proof status:`), rien d'autre ne change.

| Où | Champ | Utilisé par |
|---|---|---|
| une règle de `on` (lieu ou jeu) | `id` | sauvegardes, graphe de puzzles, heatmap du solveur (`rule:<id>`) |
| une option de `choice` | `id` | choix `once` dans les sauvegardes, traductions, fichiers de voix |
| un sujet de dialogue | `id` | sujets `seen` dans les sauvegardes, traductions |
| un écouteur de `events` | `id` | écouteurs `once` dans les sauvegardes |
| `once` / `nth` / `cycle` / `random` | `id` | leurs compteurs dans les sauvegardes (`key` v2 encore lu, déprécié) |
| un script | `stepIds`, un par commande de `do` | la sauvegarde reprend au pas nommé après un réordonnancement |

**Nouvelles clés `ui`** (défaut anglais si absentes) : `saveFailed`, `saveAdjusted`, `updateAvailable`, `updateNow`, `advance`, `offlineStatus`, `offlineComplete`, `offlineRetry` (3.1.1 : la ligne « hors ligne » du menu pause)
(3.1, le repère « toucher pour continuer » pour les lecteurs d'écran), `shareSession` (3.1, la ligne playtest du menu pause).

## 8. Un jeu qui embarque le moteur (une copie de `src/engine`)

Votre `src/main.ts` ne recopie plus l'amorçage : il appelle `bootGame` (`src/engine/boot.ts`) et ne dit que ce qui
est propre à votre build :

```ts
import { bootGame } from '@engine/boot';
import { game, layouts, manifest, minigames, commands, locales } from '@game';

void bootGame({
  game, layouts, manifest, minigames, commands, locales, version: __ASSETS_VERSION__,
  dev: { enabled: (q) => import.meta.env.DEV && (q.has('dev') || q.has('edit')) },
  sw: { register: () => import('virtual:pwa-register') },   // ou `sw: false` sans vite-plugin-pwa
});
```

`bootGame` choisit la langue (`?lang=`, le choix sauvegardé du joueur, le navigateur), attend les polices, ouvre le
stockage IndexedDB vérifié (ses premières erreurs atteignent l'App dès qu'elle existe ; sans IndexedDB, l'adaptateur
`localStorage` vérifié prend le relais), construit l'`App`, expose `window.__game` pour les pilotes e2e, lance les
outils de dev quand `dev.enabled` le dit (`dev.patch` peut remplacer le jeu, les layouts et le stockage avant, comme
la démo du Studio), affiche le titre, et enregistre le service worker par le module que vous injectez, la mise à jour
n'étant proposée qu'après une sauvegarde vérifiée. Les briques sont exportées séparément (`pickLanguage`,
`waitFonts`, `openStore`) quand un jeu a besoin d'un autre ordre.

Ce que votre build garde : `vite.config.ts` avec `server.host` sur `127.0.0.1` sauf `WEB_SCUMM_LAN=1`, l'écriture
des layouts et chaque route `/__studio` derrière `authorizeStudioRequest` (`tools/studio/security.ts`), et VitePWA en
`registerType: 'prompt'`, `injectRegister: false`, `skipWaiting: false` (obligatoire avec la proposition de mise à
jour) ; `package.json` avec les scripts de la section 7 (`tools/doctor.ts`, `tools/serve.ts`, `scripts/e2e-pwa.mjs`) ;
`scripts/e2e/lib.mjs` (`E2E_BROWSER`, `--prod` ; un script qui lit la sortie humaine de `npm run solve` continue de
marcher) ; `env.d.ts` avec `/// <reference types="vite-plugin-pwa/client" />`. Le `game` du moteur est un clone
compilé (`compileGame`), gelé quand `schemaVersion` vaut 3 : un outil qui modifiait l'objet passé à `Engine` doit
passer par l'API du moteur.

## 9. Ids de lignes (3.2) : des traductions et des voix qui survivent à une insertion

Chaque `say`, `toast` et `guide` peut porter un `id` stable (`house.open-door.l-just-a-door` : son propriétaire, puis
le début de son texte). Une table de traduction et un clip de voix sont alors indexés par lui : insérer, déplacer ou
supprimer une ligne ne décale jamais les autres. `npm run ids -- --lines --write --map` donne leurs ids aux objets qui
n'en ont pas et renomme les clés de `locales/*.json` (une seconde passe renomme depuis les chemins courants ; rien de
déjà consigné dans `ids.migration.json` / `ids.paths.json` n'est perdu) ; `--lines=all` transforme d'abord chaque
ligne en chaîne nue en `{ say: ['hero', texte], id }` : exigé pour un jeu livré dans une autre langue que la sienne
(`game.lang`, `en` par défaut) ou doublé ; la démo l'a fait en 3.2.1. `audio.voices[<id de ligne>]` joue sans écrire
`voice` sur la ligne. `npm run validate -- --release` signale une ligne sans id (une erreur, chaînes nues comprises,
dans un jeu traduit ou doublé : lancer `--lines=all` une fois ; un avertissement sinon) ; `npm run i18n -- voices` liste les lignes avec un id et sans clip, et les clips qu'aucune ligne ne réclame.

## 10. Lignes de listes (3.3) : regards, indices, réponses par défaut et réactions par sorte

Les lignes que le moteur tire d'une liste (une liste de regard, les lignes d'un indice, `rules.fallbacks.<verbe>`)
peuvent être `{ id, text }` au lieu d'une chaîne nue, un indice peut porter un `id`, et une réaction par sorte aussi
(`rules.kinds[i]`). Leurs traductions sont alors indexées par l'id (`room:house/look.pantry.<id>`,
`room:house/hints.<id d'indice>.lines.<id>`, `item:key/look.<id>`, `rules/fallbacks.look.<id>`,
`rules/kinds.<id>.say`), et `audio.voices[<id>]` les double. `npm run ids -- --lines=all --write --map` convertit les
chaînes nues des listes dans `rooms/*.ts`, `items.ts`, `rules.ts` et `game.ts`, nomme indices et sortes, et renomme les
clés de `locales/*.json` (`--lines` seul n'ajoute d'ids qu'aux objets qui n'en ont pas). Une ligne de regard unique
(`look: { door: '…' }`) est déjà indexée par son propriétaire et reste une chaîne. Une release traduite ou doublée les
exige, comme les lignes `say` (`validate -- --release`). Le Studio édite une ligne `{ id, text }` au même chemin qu'une
ligne nue (`look.pantry[1]`). La démo : 109 ids, 91 clés de traduction renommées par langue, français toujours à 400/400.

## 11. La scène (3.4) : rien à réécrire

Le `decor` d'un lieu est son calque de fond, et le `walk` de son layout est la zone de marche `main` (`stageOf`,
src/engine/core/stage.ts) : un ancien lieu garde son image (`npm run e2e:visual`) et ses sauvegardes (une scène
n'ajoute rien à l'état). Calques, occulteurs, lumières, particules, plusieurs zones de marche et leurs liens s'ajoutent
quand un lieu en a besoin (CONTENT_GUIDE « La scène »). Un layout qui a `walk` et `walkZones` garde les zones
(`validate` avertit).


## 10. De la 3.x à la 4.0

La 4.0 ne change aucun format : le schéma d'écriture reste 3, l'enveloppe des sauvegardes reste en schéma 3, et toute
sauvegarde 3.x se charge. Ce qui change, c'est ce qui est promis (`docs/fr/SUPPORT.md`) :

1. **Importer depuis l'API publique.** `web-scumm/content` (`defineGame`, `defineRoom`, chaque type de contenu),
   `web-scumm/player` (`bootGame`, `AssetManifest`), `web-scumm/minigames` (`Minigame`), `web-scumm/testing`
   (`Engine`, `solve`, `parseSave`…). Les chemins `@engine/*` marchent toujours mais sont internes. Dans un jeu de ce
   dépôt : `sed -i.bak -E "s#'@engine/core/(types|define|custom)'#'web-scumm/content'#" games/<id>/*.ts games/<id>/rooms/*.ts`, puis les
   autres à la main (`docs/fr/API.md` dit quel nom est dans quelle entrée).
2. **Un jeu dans son propre projet** (`docs/fr/PACKAGE.md`) : `npx create-web-scumm`, déplacer `games/<id>/*` dans
   `game/`, `npm install`, `npx web-scumm verify`.
3. **`RevealDef`** est déprécié : utiliser `EndingDef` (retiré en 5.0).
4. `npx web-scumm migrate --check` (ou `npm run migrate -- --check` ici) dit si quelque chose est dû.

## 12. De la 4.0 à la 4.1 « Clarity »

Rien à changer dans un jeu. Le format du contenu, l'enveloppe de sauvegarde, les quatre entrées publiques et les outils
MCP sont ceux de la 4.0.0 (`tests/api-surface.json` est identique) ; `npm install` du nouveau paquet est toute la mise
à jour, et une sauvegarde 4.0 se charge. Dans ce dépôt : `npm run lint` est désormais `npm run lint:content` (l'alias
reste pendant toute la 4.x), et `npm run quality` ajoute Biome et le TypeScript plus strict à ce que la CI vérifie.

## 13. De la 4.1.0 à la 4.1.1 « Reality Bridge »

Rien à changer : chaque ajout est optionnel. Un jeu qui veut des signaux de l'extérieur déclare `reality`
(`docs/fr/REALITY.md`), ajoute des scénarios sous `reality/scenarios/`, et fait tourner un Bridge (`web-scumm bridge`, ou
le paquet `web-scumm-bridge`). Une sauvegarde 4.1.0 se charge ; elle reçoit un état `reality` seulement quand un signal
est appliqué.

## 14. De la 4.1.1 à la 4.1.2 « Bridge fiable »

Rien à changer dans un jeu. Pour un Bridge : un `config.json` 4.1.1 sert et accorde encore (`grant` y lit la clé racine
tant qu'`init` n'a pas écrit un `root.key`) ; derrière un proxy inverse, lancer `serve --trust-proxy` pour que les
limites par adresse voient l'adresse du client ; `doctor` lit le journal, `compact` le réduit, Bridge arrêté. Le paquet
`web-scumm-bridge` tourne sur Node seul désormais (sans `tsx`). Une sauvegarde 4.1.1 se charge ; elle reçoit l'id de son
joueur au signal suivant.

## 15. De la 4.1.2 à la 4.1.3 « Gates honnêtes »

Rien à changer dans un jeu ni un Bridge. Dans ce dépôt : `npm test` ne lance plus les tests lourds du solveur
(`npm run test:heavy` le fait, chaque nuit) ; `npm run build:game` construit un jeu sans la suite unitaire ;
`release-check` est plus long (couverture, cross-check Rust, mutation du cœur). Les contributions à `main` passent par
une pull request.

## 16. De la 4.1.3 à la 4.1.4 « Moteur honnête »

Rien à changer dans un jeu. Un hôte qui embarque le moteur ou le joueur gagne `destroy()` pour les terminer, `onError`
pour entendre ce qui échoue, et `beforeSave` / `onLoad` là où il remplaçait `store.save` ou `engine.load` (ne le
faites plus : les hooks se composent). Les lignes de repli, de sorte et de don peuvent utiliser `{item}`, `{target}`,
`{name}` ; `{objet}`, `{cible}`, `{nom}` marchent toujours. Une sauvegarde 4.1.3 se charge telle quelle.

## 17. De la 4.1.4 à la 4.1.5 « Cœur réel »

Rien à changer dans un jeu, ni dans un hôte qui passe par l'API publique : `engine.session`, `begin`, `choose`,
`rand`, `destroy`, les hooks sont là où ils étaient. Un hôte qui atteignait les champs `@internal` `feed`, `open` ou
`sessionT0` du moteur les trouve sur `engine.sessions` (`feed`, `open`, `t0`) ; un qui atteignait `toScreen`,
`toLogical`, `setCamera`, `followHero`, `onCamera` ou `cam` de la vue de pièce les trouve sur `view.camera`, et
`walkTo`, `motion` et `clampFloor` (désormais `clamp`) sur `view.walker`. Une sauvegarde 4.1.4 se charge telle quelle.

## 18. De la 4.1.5 à la 4.1.6 « Outil de studio »

Rien à changer dans un jeu. Dans un checkout, les chemins `@game` de tsconfig.json passent par `.cache/game`, le lien
que `npm run game` crée (`dev`, `check` et `build` le créent aussi), et se rabattent sur `games/demo` quand il n'y en
a pas ; un `package.json` dont `config.game` nommait un jeu compte toujours, après le lien et `GAME`.
`npm run build` ne lance plus les tests pixel (`npm test` et la CI le font). `npm run doctor` sort 0 quand seuls
Python, ffmpeg ou WebKit manquent. `requirements.txt` épingle ses modules : `pip install -r requirements.txt` à
nouveau si les vôtres sont plus anciens. Une sauvegarde 4.1.5 se charge telle quelle.

## 19. De la 4.1.6 à la 4.1.7 « Docs pour un studio »

Rien à changer dans un jeu ni dans un hôte : la 4.1.7 change la documentation, les tests et les modèles du dépôt,
aucun code qu'un jeu exécute. Une sauvegarde 4.1.6 se charge telle quelle. Si vous gardez une copie d'`AGENTS.md`, sa
règle 14 et la section « Working in pairs » ont disparu ; `docs/fr/TUTORIAL.md` est la page à donner à un nouveau
venu.

## 20. De la 4.1.7 à la 4.1.8 « Foundation Reset »

Une sauvegarde 4.1.7 se charge telle quelle. Le `tsconfig.json` d'un projet écrit par `create-web-scumm` avant la 4.1.8
a `baseUrl: "."` et des `paths` non relatifs, que TypeScript 7 refuse (TS5102, TS5090) : `web-scumm migrate` le
réécrit (la même configuration, dite relativement au fichier ; un commentaire du fichier n'est pas gardé), `--check` dit quand c'est dû. Les vérifications de types
du moteur tournent sur TypeScript 7 (`npm run tsc`) ; un outil à vous qui importe l'API du compilateur (`import ts from
'typescript'`) ne trouve pas d'API dans `typescript@7` et importe `@typescript/typescript6` à la place jusqu'à la 7.1
(docs/dev/MIGRATION-4.1.8.md). Vite 8 et Vitest 5 demandent Node 22.12 ou plus. Le service worker prend le contrôle
de la page à sa première activation (`clientsClaim`), donc le préchargement d'une première visite remplit les caches ;
une mise à jour attend toujours la bannière, après une sauvegarde durable. Chaque nom de
`web-scumm/{content,player,minigames,testing,reality}` porte `@public` ou `@extension` dans `docs/fr/API.md` : ce que
`src/engine` exporte sans qu'une entrée le réexporte est interne, et environ quatre-vingts exports de ce genre ont
été dé-exportés ou retirés (aucune des cinq entrées n'a changé ; `tests/api-surface.json` est identique).
`npm run doctor -- --release` exige Python, ses modules et ffmpeg ; `npm run quality:baseline` écrit les trois chiffres
des README avec le JSON, donc un test de plus est suivi de cette commande. Un signal livré et non acquitté est livré
de nouveau depuis le curseur durable : un transport maison qui implémente `WorldSignalPort` garde la séquence
acquittée, pas la séquence reçue (`docs/fr/REALITY.md`).

## 21. De la 4.1.8 à la 4.1.9 « Gateways »

Une sauvegarde 4.1.8 se charge telle quelle ; aucun nom public des cinq entrées n'a bougé (`tests/api-surface.json`
identique). Un jeu peut déclarer `reality.connectors` (les mots que ses connecteurs peuvent proposer : optionnel,
validé). Les connecteurs sont un quatrième paquet, `web-scumm-connectors`, installé à côté du Bridge sur un serveur,
jamais dans le joueur : `npm run build` refuse désormais le JavaScript d'un jeu qui porte du code serveur
(`verify:dist`). Le script d'installation de `ssh2` tente une compilation native et échoue faute d'en-têtes : aucun
fichier `.node` n'en résulte, et `--ignore-scripts` est l'installation documentée (`docs/fr/CONNECTORS.md`). Un
contributeur écrit `changes/<slug>.md` au lieu de modifier le CHANGELOG (`changes/README.md`).

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
anonymes par minute pour tout le monde) tant que `--trust-proxy=<son réseau>` ne le nomme pas. Plusieurs tenants et plusieurs instances : `docs/fr/REALITY-OPS.md`.

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

## 25. De la 4.1.12 à la 4.1.13 « Solver Research »

Une sauvegarde, un jeu et un Bridge 4.1.12 continuent de fonctionner ; aucun nom public n'a bougé
(`tests/api-surface.json` additif). La commande du solveur gagne `--checkpoint=<fichier>`, `--checkpoint-every`,
`--resume`, `--mem=<Mo>`, `--profile`, `--symmetry`, `--workers` et `--representation=objects` (le stockage de la
4.1.8, pour comparer) ; une recherche coupée par un budget est `truncated`, jamais `proved`, avant comme après une
reprise. `npm run test:heavy` gagne le cas checkpoint de la matrice et `npm run prove:matrix` (le job `matrix` de la
nuit) prouve les douze instances de `docs/dev/PROOF-MATRIX.md`. Une cause de softlock dans `npm run solve -- --json`
porte désormais ses entrées de session, que `npm run replay` rejoue.
## 26. De la 4.1.13 à la 4.1.14 « Time Attack »

Pas de changement du format d'écriture : un jeu 4.1.13 et ses sauvegardes se chargent tels quels, et `speedrun` est un
champ facultatif (`docs/fr/SPEEDRUN.md`). Ce qu'un hôte ou un outil peut voir changer :

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
(`docs/fr/REMIX.md`) ; sans eux rien ne change : un seul monde, l'histoire, la même IR et la même empreinte. Les
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
`docs/fr/FIELD.md`) et des issues `field-pass` ouvertes ; les notes de release ne comptent comme fait que `passed`.
Chaque ensemble de mutation est bloquant (`connectors` et `reality-store` aussi) ; `release.yml` lit le `GATED` du tag.
`npm run external-consumer` installe les quatre archives hors du dépôt. La sauvegarde de référence de la 4.1.18
rejoint `tests/save-v3.test.ts`.


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

## 32. De la 4.1.19 à la 4.1.20 « Last Mile »

**Pour qui exploite un Bridge.**

- **`restore` dit son mode.** `restore --from=<fichier>` sans `--mode` est refusé (code de sortie 2) et ne restaure
  rien. Un script de la 4.1.19 ajoute `--mode=merge` : la restauration de la 4.1.19 inchangée pour un fichier de
  schéma 1 à 3 (`--force` compris) ; un fichier de schéma 4 parle aussi des quotas de speedrun de ses tenants, sauf
  s'il vient d'un journal (`tenants-only`). `--mode=replace-store --yes-replace-store --safety-out=<nouveau fichier>` est nouveau : il fait du store la
  sauvegarde (`docs/fr/REALITY-OPS.md`).
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


## 33. De la 4.1.20 à la 4.2.0 « Stable World »

Rien à changer : la 4.2.0 est le code de la 4.1.20 avec la version changée et un correctif du Field Kit. À partir de
la 4.2.0, le SemVer strict : une 4.2.x ne fait que corriger, une mineure 4.x ne fait qu'ajouter. Le moteur s'installe
toujours depuis l'archive de la release (`releases/download/v4.2.0/…`) ; la publication npm arrive dans une 4.2.x
ultérieure. Ce que la 4.2.0 dit stable, limité ou expérimental est dans `docs/fr/SUPPORT.md` (D38).

## 34. De la 4.2.0 à la 4.2.1 « Shared Floor »

Rien à changer dans un jeu : l'API publique, le format du contenu et l'enveloppe de sauvegarde sont ceux de la 4.2.0
(D40). Ce qu'un auteur peut remarquer :

- **Node 22.13 ou plus récent pour le Studio et les outils qui écrivent un jeu** (`ids`, `i18n`, `voices`,
  `import-layout`, `provenance`, les modifications du Studio) : leurs écritures passent désormais par le même journal
  que celles du Studio hébergé, gardé en local sous `.cache/studio-journal/` dans SQLite (`node:sqlite`, Node 22.13+).
  Jouer et construire un jeu tournent toujours sur 22.12.
- **Une modification qui ajouterait une erreur de validation est refusée** (422, avec les erreurs), dans le Studio et
  ses outils : le jeu sur disque reste valide.
- **L'éditeur de placement enregistre par l'API du Studio** (`PUT /__studio/api/room/<id>/layout`) ; la route
  `/__layout` a disparu et `layoutWriter()` (dans `tools/vite/plugins.ts`) ne fait plus rien, gardé pour qu'une
  configuration qui le nomme se charge encore.

Le moteur s'installe depuis `releases/download/v4.2.1/…`. Pour mettre un Studio en ligne pour une équipe, voir
`docs/fr/STUDIO-SERVER.md` (expérimental en 4.2.1).

## 35. De la 4.2.1 à la 4.2.2 « Playable Workshop »

Rien à changer dans un jeu : l'API publique, le format du contenu et l'enveloppe de sauvegarde sont ceux de la 4.2.0
(D40). Le moteur s'installe depuis `releases/download/v4.2.2/…`. Pour un Studio hébergé :

- **Vite a quitté le serveur** : l'origine du jeu sert les prévisualisations que construit l'application de
  traitement, une par révision. Celle-ci a besoin du Vite du moteur pour construire (son installation l'inclut).
- **La base migre au démarrage** (migrations 0006 à 0010 : prévisualisations, santé, annulation, builds, ensembles
  préparés).
- **Les outils d'assets sur l'application de traitement** : réglez son `CC_POST_BUILD_HOOK` comme le dit
  `docs/fr/STUDIO-SERVER.md` (leurs paquets Python, verrouillés par empreintes) ; sans lui, « Prepare assets » (le
  bouton de l'onglet Play) échoue et montre l'erreur de l'application de traitement. Ce worker se déploie depuis le
  dépôt : installé depuis les archives, il ne peut pas lancer `prepare` en 4.2.2 (la 4.2.3 livre le verrou).
- **Les builds** : `/play/<n>/` demande une session, sauf si `publicBuilds` est activé (désactivé par défaut).
- **La sauvegarde** : le journal part de lui-même dans le bucket ; faites un `studio-server backup` quotidien, gardé
  hors de l'instance (STUDIO-SERVER, « Sauvegarde et restauration »).
