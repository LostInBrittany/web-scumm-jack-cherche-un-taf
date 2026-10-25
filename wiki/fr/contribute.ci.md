# La CI expliquée

Ce que GitHub Actions lance sur le dépôt du moteur, pourquoi un job a tourné ou a dit « not needed by the plan », et que
faire quand l'un d'eux est rouge. Les workflows sont dans [`.github/workflows/`](../../.github/workflows/ci.yml) ; le
plan qui décide de ce que lance une pull request est [`tools/ci-plan.ts`](../../tools/ci-plan.ts). Quelle suite de tests
tourne dans quel job, c'est [Quels tests tournent quand](contribute.which-tests.md).

<a name="workflows"></a>

## Les workflows

| Workflow | Démarre sur | Fait | Barrière de |
|---|---|---|---|
| `ci` | une pull request ; un push sur `main` ; un tag `v*` ; à la main | les trois paliers ci-dessous | la pull request (`pr-gate`) ; une release (le run du tag) |
| `candidate` | à la main sur `main` pour un SHA (`gh workflow run candidate --ref main -f sha=<sha complet>`) ; une pull request étiquetée `full-ci` (pour information) | toutes les familles lourdes sur un SHA exact, puis `candidate-gate`, qui écrit et atteste `candidate-manifest.json` | un tag doit nommer un run vert de ce workflow ([Publier une release](contribute.releasing.md)) |
| `release` | la fin de `ci` sur un tag `v*` | les ensembles de mutation, `release-check:ci`, la release faite avec les fichiers du candidat, `ship verify` ; puis `docs-publish` (4.5.0) | la publication |
| `nightly` | chaque jour à 03:17 UTC ; à la main | noms npm, suite lourde, fuzz des connecteurs (une minute chacun), corpus des abstractions (500 graines, quatre morceaux), chaque ensemble de mutation repris de zéro, charges du Bridge sur SQLite et Postgres, matrice de preuve, cross-runtime avec 500 graines Remix, le worker dans un conteneur | rien directement ; une nuit rouge est un bug à corriger avant la prochaine release |
| `prove` | chaque lundi à 04:00 UTC ; à la main (`game`, `rooms`) | `prove:game`, les playtests committés (`--strict`), et le banc d'essai sur un jeu généré de 100 lieux (téléversé sous `bench`) | jamais une barrière |
| `mutation` | à la main : `gh workflow run mutation --ref main -f set=<ensemble> -f ref=<branche ou SHA> [-f file=<chemin>]` | un ensemble de mutation, mesuré sur un runner, son rapport gardé en artefact | rien |
| `qualify` | une pull request ou un push sur `main` qui touche `ops/`, `scripts/ops-qualify*`, `scripts/pack.mjs`, `bridge/`, `package.json` ou le fichier de verrouillage ; à la main | `npm run ops:qualify` : le profil de qualification du Bridge sous Docker | le profil ne pourrit pas entre deux candidats |
| `docs-publish` | appelé par `release` après `ship verify` ; à la main (`revision`, `rollback`, `promote`, `preview`) | le wiki et l'enregistrement de publication (4.5.0) | la publication de la documentation |

<a name="tiers"></a>
<!-- applies: .. since 4.1.9 -->

## Les trois paliers de `ci`

**Le palier rapide, à chaque changement.** `plan` lit le diff ; `check` et `coverage` tournent à côté :

- `check` : sur une pull request, `changes -- --check` (le fragment, [Conventions](contribute.conventions.md#changes-fragments))
  et `field:carry -- --check-range` (aucune passe reportée ne change sa racine de confiance) ; puis `quality`
  (formatage, lint, knip, les deux configurations TypeScript, lint de contenu), `docs:truth`, ffmpeg, `build:game` (les
  barrières du jeu d'exemple, le bundle, `verify:dist`, la vérification des spoilers, l'audit des assets),
  `weight -- --release`, `quality:baseline -- --check --dist`, `prove:game`, `audit:deps` quand `package.json` ou le
  fichier de verrouillage a bougé, puis le build à deux entrées (jeu et démo du Studio) que jouent les lignes e2e,
  gardé comme artefact `dist`.
- `coverage` : la suite unitaire une fois, sous couverture V8 (`test:coverage`), puis le cliquet de couverture : un
  avertissement sur une pull request, un échec sur `main` et sur un tag ([Le cliquet de couverture](contribute.coverage-ratchet.md)).

**Le deuxième palier, ce que le changement peut casser.** Chaque job a besoin de `plan` (la plupart aussi de `check`)
et lit sa barrière dans le plan : il fait son vrai travail, ou une seule étape qui dit « not needed by the plan » et
réussit.

| Job | Barrière | Lance |
|---|---|---|
| `node-24` | `node24` | la suite unitaire sous Node 24 |
| `windows` | `windows` | le docteur, les vérifications de types, la suite unitaire sans les fichiers qui supposent POSIX, `build:game`, le serveur de production qui répond |
| `e2e` (six lignes) | `e2e` | le build de production joué au toucher : Chromium complet, WebKit générique, Chromium et WebKit au clavier, Chromium en français, Chromium avec le peintre Canvas ; avec des étapes de poids, musique, visuel, performance, Studio, accessibilité et PWA sur certaines lignes |
| `pwa-firefox` | `pwaFirefox` | le scénario PWA sous Firefox (installation, mise à jour, mise à jour interrompue, réinstallation, hors ligne) |
| `reference` (Chromium, WebKit), `reference-fr`, `heroes` | `reference` | le chapitre de référence construit, prouvé, joué au clavier, contre ses références visuelles, à 30 i/s ou plus avec le processeur ralenti 4× ; `reference-fr` le joue en français et avec les verbes génériques ; `heroes` construit, prouve et joue l'exemple `heroes` |
| `second-game` | `secondGame` | un jeu fait par `npm run new-game`, à travers toutes les barrières que passe le jeu d'exemple |
| `fresh-install` | `freshInstall` | le moteur empaqueté, un jeu créé hors du dépôt, installé, construit et joué |
| `external-consumer` (Ubuntu, macOS, Windows) | `freshInstall` | les archives installées hors du dépôt sur trois systèmes |
| `upgrade` | `upgrade` | un jeu de la release précédente passé à ce moteur, sa vieille sauvegarde jouée jusqu'au bout |
| `reality-xcheck`, `connectors`, `bridge-postgres`, `reality` (Chromium, WebKit) | `reality` | les échantillons de Biscuit en JavaScript et en Rust, les connecteurs contre un vrai Bridge avec leur fuzz, le Bridge sur Postgres 16, le jeu à signaux de bout en bout |
| `studio-hosted` | `studioHosted` | le Studio Server sur Postgres et S3 (SeaweedFS) avec un vrai Keycloak, puis le Studio hébergé sous Chromium et Firefox |
| `cross-runtime` | aucune (chaque changement) | le même texte canonique, les mêmes preuves de speedrun et les mêmes mondes Remix sous Node, Chromium, WebKit et Firefox |

**Le troisième palier, hors du chemin de la pull request** : les ensembles de mutation sur une pull request étiquetée
`full-ci`, la nightly, le candidat et la release.

**`pr-gate`** lit le résultat de chaque job : chacun doit être `success` ; les jobs de mutation peuvent être `skipped`
là où ils ne tournent pas. C'est la seule vérification qui résume une pull request.

Plus aucun job ne déploie GitHub Pages (4.5.2, voir [le site](#pages-only)).

<a name="the-plan"></a>
<!-- applies: .. since 4.1.9 -->

## Le plan (`npm run ci:plan`)

```sh
# dans le dépôt du moteur, sur votre branche
npm run ci:plan                    # contre origin/main
npm run ci:plan -- --base=<ref>
npm run ci:plan -- --files=src/engine/dom/room.ts,games/demo/rooms/garden.ts
```

Il affiche, sur la sortie d'erreur, une ligne par fichier changé avec la règle qui l'a pris et les barrières qu'il
ouvre, puis le plan ; sur la sortie standard, une ligne de JSON (`{"auditDeps":…,"node24":…,…,"all":…,"docs":…,"docsPages":[…]}`),
que le job `plan` écrit dans sa sortie. La première règle qui correspond à un chemin l'emporte, et un changement lance
l'union de ce que demandent ses fichiers :

| Un changement de | Ouvre |
|---|---|
| `.github/workflows/ci.yml`, `tools/ci-plan.ts`, `package.json`, le fichier de verrouillage, une configuration partagée (`tsconfig*.json`, `vite.config.ts`, `vitest*.ts`, `biome.json`, `knip.json`, `requirements.txt`, `.nvmrc`, `.gitattributes`), la coquille de l'app, `tools/vite/` | tout |
| `docs/`, `changes/`, `wiki/`, tout `.md`, `LICENSE*`, `.claude/`, `.cursor/`, `clevercloud/`, un autre fichier de `.github/` | le palier rapide seulement |
| l'exécution Reality | `reality`, `e2e`, `node24`, `windows` |
| les peintres, le directeur musical | `e2e`, `reference`, `node24`, `windows` |
| la PWA et le stockage (`boot.ts`, `dom/update`, `offline`, `save-store`, `storage`) | `e2e`, `pwaFirefox`, `upgrade`, `node24`, `windows` |
| tout autre fichier de `src/engine/` (le cœur) | tout |
| `src/studio/` | `e2e`, `studioHosted`, `node24`, `windows` |
| `bridge/` | `reality`, `freshInstall`, `node24`, `windows` (et `studioHosted` pour sa couche SQL) |
| `games/demo/` | `e2e`, `reference`, `node24`, `windows` |
| `games/reference/`, `games/heroes/` | `reference`, `node24` |
| `games/_template/`, `cli/`, `scripts/{pack,fresh-install,external-consumer,new-game}.mjs` | `secondGame`, `freshInstall`, `upgrade`, `node24`, `windows` |
| `studio-server/` | les barrières de création et `studioHosted` |
| les autres `tools/` et `scripts/` | les barrières de création (`node24`, `windows`, `secondGame`, `freshInstall`, `upgrade`, `reference`) |
| `tests/` | `node24`, `windows` |
| un chemin qu'aucune règle ne connaît | tout |

Une erreur de git lance tout aussi : le plan ne décide jamais qu'il n'a pas besoin d'être vérifié. **`docs`** est vrai
quand le changement touche la documentation, ses générateurs, ou un fichier sur lequel repose une page du wiki (un
motif `sources` de `wiki/manifest.json`) ; `docsPages` nomme ces pages, à relire. Il n'ouvre aucun job : le palier
rapide lance les tests de documentation à chaque changement.

<a name="full-ci"></a>

## Tout sur une pull request : l'étiquette `full-ci`

Sur `main`, sur un tag et sur une pull request étiquetée **`full-ci`**, le plan est `--all` : toutes les barrières
s'ouvrent. L'étiquette lance aussi les jobs de mutation de `ci`. Ajoutez
l'étiquette, puis poussez (elle s'applique au run suivant de `ci`). Ajouter l'étiquette lance aussi un run de
`candidate` pour information, une fois, sur la tête de la pull request à ce moment ; un push ultérieur n'en lance aucun :
retirez l'étiquette et remettez-la pour le relancer sur la nouvelle tête.

<a name="pages-only"></a>
<!-- applies: 4.5.2.. since 4.5.2 -->

## Le site, hors de `ci`

Depuis la 4.5.2, la `ci` du moteur ne déploie plus GitHub Pages (D52). Le site web du projet, `https://quest-n-click.cleverapps.io` (le dépôt
`Quest-n-Click/quest-n-click-site`), sert la démo sous `/demo/` depuis le `quest-n-click-v<version>-web.tar.gz` de la
dernière release (construit par le candidat sous `BASE_PATH=/demo/`, sommé et attesté par la release) et la dernière
documentation sous `/docs/<id de page>` (`/fr/docs/<id de page>` en français) ; il n'y a plus de documentation versionnée en ligne, la documentation
d'une version est le `quest-n-click-docs-<version>.tar.gz` de sa release. Le site prend une release de lui-même (son
`POST /api/revalidate`, sinon toutes les heures). Le job `pages` et les runs `pages-only` que lançait `docs-publish`
(de la 4.5.0 à la 4.5.1) ont disparu.

> [!LIMIT id=pages-fail-closed]
> `npm run wiki -- pages`, qui assemblait le `/docs/` versionné pour GitHub Pages jusqu'à la 4.5.1, ne prend toujours
> que les archives publiées et échoue quand l'une ne peut pas être téléchargée ou vérifiée ; aucun site ne déploie
> plus sa sortie depuis la 4.5.2.

<a name="job-failed"></a>

## Un job a échoué sur ma pull request

<!-- step: read-plan -->
1. **Lisez le résumé du plan** dans le job `plan` (ou lancez `npm run ci:plan` en local) : il dit pourquoi chaque job a
   tourné.

<!-- step: reproduce -->
2. **Reproduisez en local**, dans le dépôt du moteur, avec la commande du job :

   | Job rouge | En local |
   |---|---|
   | `check` | l'étape qui échoue : `npm run quality`, `npm run docs:truth`, `npm run build:game`, `npm run quality:baseline -- --check --dist` (après `npm run build:web`), `npm run prove:game`, `npm run changes -- --check` |
   | `coverage` | `npm run test:coverage` (un test, ou un seuil de `vite.config.ts` non atteint) |
   | `node-24` | `npm run test:node` sous Node 24 |
   | `e2e`, `reference`, `second-game` | `npm run build:game`, `npm run preview -- --port 5173 &`, puis la commande de la ligne `npm run e2e -- http://127.0.0.1:5173/ --game demo --prod …` (`E2E_BROWSER=webkit` pour une ligne WebKit) |
   | `fresh-install`, `external-consumer`, `upgrade` | `npm run fresh-install`, `npm run external-consumer`, `npm run upgrade-check -- --from=previous` |
   | `mutation (<ensemble>)` | `npm run test:mutation:core -- --set=<ensemble>` ([Tests de mutation](contribute.mutation-testing.md)) |

   Une ligne e2e qui échoue téléverse ses captures en artefact : lisez-les d'abord.

<!-- step: check-flake -->
3. **Regardez les instabilités connues ci-dessous** avant de relancer. Relancer un job rouge qui n'est pas une
   instabilité connue cache un bug.

<!-- step: fix -->
4. **Corrigez, poussez, relisez `pr-gate`.**

<a name="known-flakes"></a>

## Instabilités connues et leur traitement

| Symptôme | Où | Ce qui est fait | Depuis |
|---|---|---|---|
| `Context is stopped` de WebKit (ou `Cache API operation failed: Context is stopped`) une fois chaque vérification passée | `e2e:pwa` et `e2e` sous WebKit, pendant la fermeture | Signalé en avertissement (« reported, not counted »), seulement sous WebKit, seulement sous cette forme exacte et seulement après que chaque vérification a réussi ; toute autre erreur du navigateur fait toujours échouer. Vu sur #111, #118 (13 oct. 2026) et #139 (18 oct. 2026) | 4.1.20 (`e2e:pwa`), 4.2.1 (`e2e`) |
| La passe Firefox d'`e2e:studio-hosted` expire à l'étape 6d (préparer les assets) | `studio-hosted` | Un vrai bug (une interrogation d'état en retard écrasait le panneau), corrigé en 4.3.0 (#210). S'il revient, c'est une régression, pas une instabilité | corrigé en 4.3.0 |
| `apt-get update` reste bloqué de longues minutes sur le miroir Ubuntu du runner | chaque job qui installe ffmpeg | `scripts/ci-ffmpeg.sh` : apt limité à quatre minutes par essai, puis un ffmpeg statique depuis le CDN de GitHub (BtbN/FFmpeg-Builds) ; `release.yml` porte la même logique en ligne. Les étapes d'installation ont 20 minutes. Vu le 7 oct. 2026 | 4.1.15 |
| `toomanyrequests` en tirant une image de Docker Hub | `bridge-postgres`, `mutation`, les services de la nightly et du candidat | Images tirées de `mirror.gcr.io` au même condensé. Vu sur deux jobs le 9 oct. 2026 | 4.1.18 |
| `npm ci` ou `pip install` échoue sur une erreur réseau | tout job | Chaque étape d'installation est tentée trois fois, à 15 s d'intervalle | — |
| WebKit ne sait pas naviguer hors ligne sous Playwright | `e2e:pwa` WebKit, `reality` WebKit | `--allow-skip` : cette étape dit « skipped », jamais comptée comme une preuve ; une personne vérifie Safari hors ligne avant chaque release ([Passes de terrain](contribute.field-passes.md)) | 3.1.1 |

> [!LIMIT id=windows-not-required]
> Le job `windows` lance la suite unitaire sans les fichiers qui supposent POSIX ; ce n'est pas une vérification
> exigée par les règles du dépôt tant que le mainteneur ne l'y ajoute pas.

<a name="related"></a>

## Identifiants liés

- `npm run ci:plan`, l'étiquette `full-ci`, `pr-gate` ; l'entrée `pages-only`, disparue en 4.5.2.
- [Quels tests tournent quand](contribute.which-tests.md), [Avant une pull request](contribute.before-a-pr.md),
  [Publier une release](contribute.releasing.md), [Tests de mutation](contribute.mutation-testing.md).
