# Matrice de support

Ce que les gates automatiques exécutent, et ce que seules des personnes vérifient. Le premier tableau est la matrice de
support telle que le projet la tient à la main ; les sections qui suivent sont générées depuis le registre des statuts,
[`docs/dev/contracts.json`](../../docs/dev/contracts.json) (`npm run wiki -- generate reference.support-matrix`) :
pour chaque surface du produit, cinq statuts tenus à part. Ce que promettent « stable » et « expérimental » est
expliqué dans [start.stability](start.stability.md) ; comment se déroule la passe d’une personne, dans
[contribute.field-passes](contribute.field-passes.md).

<a name="matrix"></a>

## La matrice

Depuis la 4.1.9, la CI exécute chaque ligne ci-dessous sur `main` et sur chaque tag. Une pull request exécute le niveau
rapide (lint, types, la suite unitaire, le build et la preuve du jeu d'exemple) et seulement les lignes que son
changement peut toucher, selon le classement du diff par [`tools/ci-plan.ts`](../../tools/ci-plan.ts) : une pull
request de docs seules n'ouvre aucun navigateur, aucun runner Windows ni Node 24 ([contribute.ci](contribute.ci.md)).

| | Vérifié par la CI (sur `main` et les tags ; sur une pull request quand son changement peut le toucher) | Vérifié par des personnes (pas encore fait) |
|---|---|---|
| Joueur, téléphone | Chromium et WebKit à la taille d'un téléphone, tactile et clavier, français ; la PWA installée, mise à jour après une sauvegarde durable, réinstallée, dans Chromium, WebKit et Firefox ; le jeu ouvert hors ligne (Chromium, Firefox) | un vrai téléphone Android, un vrai iPhone installé depuis Safari et mis à jour, Safari hors ligne sur l'appareil |
| Joueur, bureau | Chromium, souris et clavier | — |
| Joueur, lecteur d'écran | axe-core sur chaque écran (pas une conformité WCAG) | une passe VoiceOver ou NVDA |
| Firefox | la PWA seulement : installation, mise à jour, réinstallation, hors ligne (`npm run e2e:pwa`, le job `pwa-firefox`) ; le refus occasionnel par son worker d'une image en cache hors ligne est signalé par le job, pas compté | Firefox hors ligne sur une vraie machine ; rien d'autre de promis |
| Node | 22.12 ou plus : 22 et 24 sur Ubuntu ; macOS pour l'usage quotidien du mainteneur | — |
| Windows | un job `windows-latest` (4.1.8 ; sur une pull request, quand du code a changé) : `doctor`, les types, la suite unitaire moins six fichiers qui supposent POSIX (modes de fichier, `/` dans les chemins ; nommés dans `ci.yml`) et, depuis 4.1.9, les tests Telnet et SSH, et, depuis 4.2.1, l'application de traitement du Studio Server et ses prévisualisations (Linux seulement), `build`, le serveur de production qui répond | `npm run dev` et le Studio sous Windows ; les six fichiers de tests, portés |
| Python | optionnel : les outils d'image et le pipeline audio, Pillow, NumPy, SciPy épinglés dans `requirements.txt` | — |
| Reality Bridge | Node 22.12+, e2e Chromium et WebKit, une contre-vérification Rust du protocole (`SignalV2` compris) | un Bridge derrière HTTPS avec un vrai connecteur |
| Bridge, profil `local` (4.1.10) | SQLite via `node:sqlite` (Node 22.13+) : le contrat du store, les tenants croisés en tests de propriété, trois processus sur un fichier dont un tué pendant 1 000 propositions, la sauvegarde en un seul instantané et la restauration tout ou rien (4.1.19) ; le backup schéma 4, store entier et quota compris, et deux modes de restauration, `merge` et `replace-store`, sous un lease de maintenance (4.1.20) ; une charge de 50 000 propositions chaque nuit | une installation de longue durée sur une vraie machine |
| Bridge, profil `distributed` (4.1.10, `experimental`) | Postgres 16 en CI (`bridge-postgres`) : le même contrat, les tenants et la diffusion entre instances ; la charge de nuit ; le profil de qualification (`ops/qualify/` : HTTPS, trois instances, le classement, un worker tué en pleine vérification, une restauration après destruction de la topologie) dans le workflow `qualify` ; depuis 4.1.20 le profil complet dans chaque candidat qu'un tag peut nommer (les deux modes de restauration sous le bail de maintenance), `--short` dans celui d'une pull request | un vrai déploiement : jusque-là, `experimental` |
| Connecteurs (4.1.9), **expérimental** (D19) | email (webhook signé, IMAP), Telnet, SSH, Open Badges 2 et 3 : le même contrat pour les quatre, tests d'abus et de fuzz, une exécution sous `--disallow-code-generation-from-strings`, les replays du chapitre d'exemple ; les quatre joués depuis leur archive dans le candidat (4.1.19) ; les tests Telnet et SSH pas encore sous Windows | un vrai fournisseur d'email, un vrai badge d'un vrai émetteur, SSH et Telnet exposés dans un environnement contrôlé |
| Documentation (4.5.0), **expérimental** | `npm run wiki -- check` à chaque changement (liens et ancres, les deux langues pareilles, les références générées confrontées au code, les pages de transition de `docs/`) ; les questions d’acceptation (`wiki -- acceptance --strict`) ; le paquet de documentation dans le package, lu par MCP depuis un projet installé hors du dépôt (`external-consumer`) | une personne débutante qui la lit pour faire un premier jeu (`docs-beginner-reader`) |

> [!LIMIT id=matrix-scope]
> Une ligne dit ce qui est vérifié, pas plus : un navigateur, une plateforme ou un déploiement que la matrice ne nomme
> pas n’est pas vérifié par la CI, et une case « vérifié par des personnes » reste ouverte tant que sa passe n’est pas
> faite pour la version que vous utilisez.

<a name="surfaces"></a>

## Les surfaces et leurs cinq statuts

Chaque surface ci-dessous donne, à part : son **contrat** (expérimental, stable ou déprécié), les **environnements**
que la CI vérifie pour elle (à la date de la matrice de support que cite le registre), les **vérifications
automatiques** qui la couvrent (gates de ci:plan, jobs de CI et du candidat, fichiers de test), les **vérifications par
des personnes** qu’elle attend (leur état dans la feuille de passes de cette version, et l’issue qui suit chacune), et
où se trouvent ses **limites connues**. Une page de ce wiki qui documente une surface montre les mêmes cinq statuts
dans son en-tête.

<!-- generated:begin -->

<a name="content-format"></a>

### Le format du contenu et ses outils

- Contrat : **stable** (`content-format`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Node 22 et 24 sous Ubuntu ; Windows (windows-latest) : la suite unitaire moins six fichiers POSIX.
- Vérifications automatiques : gates de ci:plan `node24`, `windows`, `secondGame`, `freshInstall`, `upgrade`, `reference` ; jobs de CI et du candidat `check`, `coverage`, `second-game`, `upgrade` ; fichiers de test [`tests/validate-stage.test.ts`](../../tests/validate-stage.test.ts), [`tests/solver-contract.test.ts`](../../tests/solver-contract.test.ts), [`tests/save-v3.test.ts`](../../tests/save-v3.test.ts), [`tests/hero-choice.test.ts`](../../tests/hero-choice.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `heroes-two-languages` : pas encore faite, [#237](https://github.com/Quest-n-Click/quest-n-click/issues/237).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="public-api"></a>

### L'API publique

- Contrat : **stable** (`public-api`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Node 22 et 24 sous Ubuntu.
- Vérifications automatiques : gates de ci:plan `node24`, `freshInstall` ; jobs de CI et du candidat `check`, `external-consumer` ; fichiers de test [`tests/api-surface.test.ts`](../../tests/api-surface.test.ts), [`tests/api-doc.test.ts`](../../tests/api-doc.test.ts).
- Vérifications par des personnes : aucune demandée.
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="player-dom"></a>

### Le joueur (peintre DOM)

- Contrat : **stable** (`player-dom`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Chromium de bureau, souris et clavier ; Chromium et WebKit à la taille d'un téléphone, tactile et clavier (émulés) ; axe-core sur chaque écran (pas une conformité WCAG).
- Vérifications automatiques : gates de ci:plan `e2e` ; jobs de CI et du candidat `e2e` ; fichiers de test [`tests/dom/a11y.test.ts`](../../tests/dom/a11y.test.ts), [`tests/dom/presenter.test.ts`](../../tests/dom/presenter.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `phone-both-renderers` : pas encore faite, [#83](https://github.com/Quest-n-Click/quest-n-click/issues/83).
  - `code-wheel-human` : pas encore faite, [#78](https://github.com/Quest-n-Click/quest-n-click/issues/78).
  - `blind-playtesters` : pas encore faite, [#76](https://github.com/Quest-n-Click/quest-n-click/issues/76).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="player-canvas"></a>

### Le peintre Canvas

- Contrat : **expérimental** (`player-canvas`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Chromium en CI, le même jeu dessiné et joué.
- Vérifications automatiques : gates de ci:plan `e2e` ; jobs de CI et du candidat `e2e` ; fichiers de test [`tests/dom/render-canvas.test.ts`](../../tests/dom/render-canvas.test.ts), [`tests/dom/renderer-contract.test.ts`](../../tests/dom/renderer-contract.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `phone-both-renderers` : pas encore faite, [#83](https://github.com/Quest-n-Click/quest-n-click/issues/83).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="pwa"></a>

### Le jeu installé (PWA) et hors ligne

- Contrat : **stable** (`pwa`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Chromium, WebKit et Firefox : installée, mise à jour après une sauvegarde durable, réinstallée ; Hors ligne dans Chromium et Firefox.
- Vérifications automatiques : gates de ci:plan `e2e`, `pwaFirefox` ; jobs de CI et du candidat `e2e`, `pwa-firefox` ; fichiers de test [`tests/offline.test.ts`](../../tests/offline.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `safari-ios-offline-update` : pas encore faite, [#86](https://github.com/Quest-n-Click/quest-n-click/issues/86).
  - `firefox-real-offline` : pas encore faite, [#80](https://github.com/Quest-n-Click/quest-n-click/issues/80).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="bridge-local"></a>

### Le Reality Bridge, profil `local` (SQLite)

- Contrat : **stable** (`bridge-local`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Node 22.13+ avec node:sqlite, sous Ubuntu ; Chromium et WebKit de bout en bout.
- Vérifications automatiques : gates de ci:plan `reality` ; jobs de CI et du candidat `reality`, `reality-xcheck` ; fichiers de test [`tests/bridge-store.test.ts`](../../tests/bridge-store.test.ts), [`tests/bridge-backup.test.ts`](../../tests/bridge-backup.test.ts).
- Vérifications par des personnes : aucune demandée.
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="bridge-distributed"></a>

### Le Reality Bridge, profil `distributed` (Postgres)

- Contrat : **expérimental** (`bridge-distributed`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Postgres 16 en CI ; Le profil de qualification : HTTPS, trois instances (ops/qualify/).
- Vérifications automatiques : gates de ci:plan `reality` ; jobs de CI et du candidat `bridge-postgres`, `deployment-smoke` ; fichiers de test [`tests/bridge-postgres-isolation.test.ts`](../../tests/bridge-postgres-isolation.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `bridge-postgres-https` : pas encore faite, [#77](https://github.com/Quest-n-Click/quest-n-click/issues/77).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="connectors"></a>

### Les connecteurs (email, Telnet, SSH, Open Badges)

- Contrat : **expérimental** (`connectors`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Node 22 sous Ubuntu (Telnet et SSH pas sous Windows).
- Vérifications automatiques : gates de ci:plan `reality` ; jobs de CI et du candidat `connectors`, `connector-archive-e2e` ; fichiers de test [`tests/connectors-sdk.test.ts`](../../tests/connectors-sdk.test.ts), [`tests/connectors-email.test.ts`](../../tests/connectors-email.test.ts), [`tests/connectors-ssh.test.ts`](../../tests/connectors-ssh.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `connectors-real-security` : pas encore faite, [#79](https://github.com/Quest-n-Click/quest-n-click/issues/79).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="speedrun-remix"></a>

### Speedrun et Remix

- Contrat : **stable** (`speedrun-remix`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Replays dans quatre environnements d'exécution (cross-runtime).
- Vérifications automatiques : gates de ci:plan `e2e` ; jobs de CI et du candidat `cross-runtime`, `e2e` ; fichiers de test [`tests/speedrun-verify.test.ts`](../../tests/speedrun-verify.test.ts), [`tests/remix-worlds.test.ts`](../../tests/remix-worlds.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `runs-real-players` : pas encore faite, [#85](https://github.com/Quest-n-Click/quest-n-click/issues/85).
  - `run-resume-power-cycle` : pas encore faite, [#84](https://github.com/Quest-n-Click/quest-n-click/issues/84).
  - `mystery-deployed` : pas encore faite, [#82](https://github.com/Quest-n-Click/quest-n-click/issues/82).
  - `livesplit-obs` : pas encore faite, [#81](https://github.com/Quest-n-Click/quest-n-click/issues/81).
  - `code-wheel-human` : pas encore faite, [#78](https://github.com/Quest-n-Click/quest-n-click/issues/78).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="voices-music"></a>

### Voix et musique

- Contrat : **stable** (`voices-music`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Le directeur musical dans Chromium et WebKit.
- Vérifications automatiques : gates de ci:plan `e2e` ; jobs de CI et du candidat `e2e` ; fichiers de test [`tests/voices.test.ts`](../../tests/voices.test.ts), [`tests/voice-locale.test.ts`](../../tests/voice-locale.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `voices-listening` : pas encore faite, [#87](https://github.com/Quest-n-Click/quest-n-click/issues/87).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="archives-install"></a>

### Les archives des paquets et leur installation

- Contrat : **stable** (`archives-install`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Installées hors du dépôt sous Ubuntu (Node 22 et 24), macOS et Windows.
- Vérifications automatiques : gates de ci:plan `freshInstall` ; jobs de CI et du candidat `external-consumer`, `fresh-install` ; fichiers de test [`tests/pack-locks.test.ts`](../../tests/pack-locks.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `archive-human-install` : pas encore faite, [#75](https://github.com/Quest-n-Click/quest-n-click/issues/75).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="studio-local"></a>

### Le Studio local

- Contrat : **stable** (`studio-local`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Chromium de bout en bout (les vérifications du Studio) ; Windows : la suite unitaire seulement.
- Vérifications automatiques : gates de ci:plan `e2e`, `windows` ; jobs de CI et du candidat `e2e`, `windows` ; fichiers de test [`tests/hero-matrix.test.ts`](../../tests/hero-matrix.test.ts), [`tests/studio-assistant.test.ts`](../../tests/studio-assistant.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `studio-hero-matrix` : pas encore faite, [#238](https://github.com/Quest-n-Click/quest-n-click/issues/238).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="studio-server"></a>

### Le Studio Server (Studio d'équipe hébergé)

- Contrat : **expérimental** (`studio-server`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : Postgres, S3 et Keycloak en CI ; Chromium et Firefox (job studio-hosted) ; WebKit sous macOS, à la main seulement.
- Vérifications automatiques : gates de ci:plan `studioHosted` ; jobs de CI et du candidat `studio-hosted`, `studio-install-smoke` ; fichiers de test [`tests/studio-server.test.ts`](../../tests/studio-server.test.ts), [`tests/studio-backup.test.ts`](../../tests/studio-backup.test.ts), [`tests/studio-collab.test.ts`](../../tests/studio-collab.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `studio-hosted` : pas encore faite, [#149](https://github.com/Quest-n-Click/quest-n-click/issues/149).
  - `studio-collab` : pas encore faite, [#150](https://github.com/Quest-n-Click/quest-n-click/issues/150).
  - `studio-preview` : pas encore faite, [#166](https://github.com/Quest-n-Click/quest-n-click/issues/166).
  - `studio-assets-hosted` : pas encore faite, [#167](https://github.com/Quest-n-Click/quest-n-click/issues/167).
  - `studio-mcp-remote` : pas encore faite, [#196](https://github.com/Quest-n-Click/quest-n-click/issues/196).
  - `studio-oidc-generic` : pas encore faite, [#197](https://github.com/Quest-n-Click/quest-n-click/issues/197).
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<a name="documentation"></a>

### La documentation : le wiki, son bundle dans le paquet et sa recherche

- Contrat : **expérimental** (`documentation`).
- Environnements vérifiés par la CI (matrice de support de 4.4.0, 2026-10-23) : aucun de nommé.
- Vérifications automatiques : jobs de CI et du candidat `check`, `external-consumer` ; fichiers de test [`tests/wiki-manifest.test.ts`](../../tests/wiki-manifest.test.ts), [`tests/wiki-check.test.ts`](../../tests/wiki-check.test.ts), [`tests/wiki-access.test.ts`](../../tests/wiki-access.test.ts), [`tests/wiki-proofs.test.ts`](../../tests/wiki-proofs.test.ts), [`tests/wiki-acceptance.test.ts`](../../tests/wiki-acceptance.test.ts), [`tests/mcp-docs.test.ts`](../../tests/mcp-docs.test.ts).
- Vérifications par des personnes (états lus dans [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)) :
  - `docs-beginner-reader` : pas demandée pour cette version.
- Limites connues : les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`).

<!-- generated:end -->
