# Stabilité et support

Ce que quest'n'click promet, surface par surface, jusqu’où chaque promesse est prouvée, comment les versions la font
évoluer, et combien de temps une version est suivie. À la 4.4.0 (22 octobre 2026). Les sources uniques sont
[`docs/dev/contracts.json`](../../docs/dev/contracts.json) (le registre des statuts),
cette page (la politique : le registre cite son tableau des surfaces, et `tests/contracts.test.ts` vérifie les citations) et la fiche
des passes humaines de la release, [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md).

<a name="overview"></a>

## Cinq statuts, jamais un seul bandeau

Une surface (le lecteur de jeu, la PWA, le Bridge, le Studio Server…) n’est jamais simplement « expérimentale » ou
« stable ». On en dit cinq choses, séparément, et chaque page de ce wiki qui repose sur une surface les montre dans son
en-tête :

1. **Statut du contrat** : expérimental, stable ou déprécié. Ce que le projet promet de ne pas casser.
2. **Environnements vérifiés** : les navigateurs, systèmes et hébergements sur lesquels la CI la fait tourner, à une
   version et une date données.
3. **Vérifications automatiques** : les jobs de CI et de candidat et les fichiers de test qui la couvrent.
4. **Passes humaines** : les vérifications que seule une personne sur un vrai appareil peut faire, avec le ticket qui
   suit chacune, et leur état pour la release (faite, échouée, pas faite).
5. **Limites connues** : les blocs `[!LIMIT]` des pages.

Un contrat stable dont les passes ne sont pas faites est ce que les anciennes pages du projet appellent **limité** :
la promesse est faite, et une personne ne l’a pas encore confirmée sur de vrais appareils.

<a name="what-is-stable"></a>

## Ce qui est stable

**L’API publique** ([API publique](engine.api.md)) : les entrées `@quest-n-click/engine/content`, `/player`, `/minigames`,
`/testing` et, depuis la 4.1.1, `/reality` ; le schéma d’écriture (`schemaVersion: 3`) ; l’enveloppe de sauvegarde ;
les schémas des outils du Studio et du MCP ; et la commande `quest-n-click`. Tout le reste sous `src/engine` est
interne : cela peut changer à n’importe quelle release, et un jeu qui y accède par l’alias `@engine/*` en prend le
risque.

**Le DSL** ([Référence du DSL](create.dsl.md#stability)) : depuis la 4.1.12, ses noms et leurs sens sont stables
(D22) ; en changer un est une rupture livrée avec la migration des jeux fournis et des sauvegardes. Ce qui pouvait
encore grandir jusqu’à la 4.1.15, ce qui est gelé depuis, et pourquoi chaque primitive proposée a été admise ou refusée
sont dans [`docs/dev/DSL-STABILITY.md`](../../docs/dev/DSL-STABILITY.md). Une nouvelle primitive entre avec une courte
décision écrite et atteint le moteur, le validateur, le solveur, le rejeu, le Studio, le MCP et la référence du DSL
(`tests/propagation.test.ts` le vérifie).

<a name="surfaces"></a>

## Surface par surface (4.4.0)

Statut du contrat et vérifications tirés de `docs/dev/contracts.json` (à la 4.4.0, 23 octobre 2026) ; passes tirées
de `docs/dev/passes/4.4.0.md`, où **aucune des 21 passes n’a été faite**.

| Surface | Contrat | Ce que promet SUPPORT (D38) | Vérifiée par la CI sur | Vérifications (jobs de CI) | Passes humaines (ticket), état à la 4.4.0 |
|---|---|---|---|---|---|
| Le format du contenu et ses outils | stable | Stable | Node 22 et 24 sous Ubuntu ; Windows : la suite unitaire moins six fichiers POSIX | check, coverage, second-game, upgrade | `heroes-two-languages` (#237) : pas faite |
| L’API publique | stable | Stable, en SemVer | Node 22 et 24 sous Ubuntu | check, external-consumer | aucune |
| Le lecteur de jeu (peintre DOM) | stable | Limité jusqu’à ses passes : téléphones et lecteurs d’écran | Chromium sur ordinateur, souris et clavier ; Chromium et WebKit à la taille d’un téléphone, toucher et clavier (émulés) ; axe-core sur chaque écran (pas une conformité WCAG) | e2e | `phone-both-renderers` (#83), `code-wheel-human` (#78), `blind-playtesters` (#76) : pas faites |
| Le peintre Canvas | expérimental | Expérimental | Chromium, le même jeu dessiné et joué | e2e | `phone-both-renderers` (#83) : pas faite |
| Le jeu installé (PWA) et le jeu hors ligne | stable | Stable sur Chromium d’ordinateur ; limité sur Safari et Firefox (la PWA seulement) | Chromium, WebKit et Firefox : installé, mis à jour après une sauvegarde durable, réinstallé ; hors ligne dans Chromium et Firefox | e2e, pwa-firefox | `safari-ios-offline-update` (#86), `firefox-real-offline` (#80) : pas faites |
| Le Bridge Reality, profil `local` (SQLite) | stable | Stable | Node 22.13+ avec `node:sqlite` sous Ubuntu ; Chromium et WebKit de bout en bout | reality, reality-xcheck | aucune |
| Le Bridge Reality, profil `distributed` (Postgres) | expérimental | Expérimental | Postgres 16 en CI ; le profil de qualification (HTTPS, trois instances, `ops/qualify/`) | bridge-postgres, deployment-smoke | `bridge-postgres-https` (#77) : pas faite |
| Les connecteurs (email, Telnet, SSH, Open Badges) | expérimental | Expérimental | Node 22 sous Ubuntu (Telnet et SSH pas sous Windows) | connectors, connector-archive-e2e | `connectors-real-security` (#79) : pas faite |
| Speedrun et Remix | stable | Limité jusqu’à leurs passes | Rejeux dans quatre environnements d’exécution (cross-runtime) | cross-runtime, e2e | `runs-real-players` (#85), `run-resume-power-cycle` (#84), `mystery-deployed` (#82), `livesplit-obs` (#81), `code-wheel-human` (#78) : pas faites |
| Voix et musique | stable | Limité jusqu’à sa passe | Le directeur musical dans Chromium et WebKit | e2e | `voices-listening` (#87) : pas faite |
| Les archives des packages et leur installation | stable | Limité jusqu’à ce qu’une personne les installe | Installées hors du dépôt sous Ubuntu (Node 22 et 24), macOS et Windows | external-consumer, fresh-install | `archive-human-install` (#75) : pas faite |
| Le Studio local | stable | Partiel sous Windows | Chromium de bout en bout (les vérifications du Studio) ; Windows : la suite unitaire seulement | e2e, windows | `studio-hero-matrix` (#238) : pas faite |
| Le Studio Server (Studio d’équipe hébergé) | expérimental | Expérimental dans son ensemble | Postgres, S3 et Keycloak en CI ; Chromium et Firefox (job `studio-hosted`) ; WebKit sous macOS, à la main seulement | studio-hosted, studio-install-smoke | `studio-hosted` (#149), `studio-collab` (#150), `studio-preview` (#166), `studio-assets-hosted` (#167), `studio-mcp-remote` (#196), `studio-oidc-generic` (#197) : pas faites |
| La documentation (ce wiki, son paquet, sa recherche) | expérimental | Expérimental, depuis la 4.5.0 | `npm run wiki -- check` et les questions d’acceptation ; le paquet lu par MCP depuis un projet installé hors du dépôt | check, external-consumer | `docs-beginner-reader` : demandée à partir de la 4.5.0 |

Les lignes de la matrice de support derrière la colonne « Vérifiée par la CI », avec ce que des personnes vérifient
pour chacune : [Matrice de support](reference.support-matrix.md). Chaque passe est un ticket ouvert avec l’étiquette
[`field-pass`](https://github.com/Quest-n-Click/quest-n-click/issues?q=label%3Afield-pass), fermé par le mainteneur une fois
testée ; seule une passe faite sur le candidat même que nomme une release qualifie une surface
([Passes humaines](contribute.field-passes.md)).

> [!LIMIT id=no-pass-run-at-440]
> À la 4.4.0, aucune passe humaine n’a réussi : chaque « limité » ci-dessus est une promesse que des machines
> vérifient et qu’aucune personne n’a encore confirmée sur de vrais appareils.

<a name="versions"></a>

## Versions

Versionnage sémantique sur l’API publique :

- un **correctif** (4.4.x) corrige ; il ne change jamais un nom public ni un format ;
- une **mineure** (4.x) ajoute ; elle peut déprécier, jamais retirer ;
- une **majeure** (5.0) peut retirer ce qu’une mineure a déprécié, et dit comment passer dans les notes de mise à jour
  ([Mettre à jour](install.upgrade.md)).

**Durée de suivi.** La dernière mineure de la majeure en cours reçoit tous les correctifs ; chaque mineure plus
ancienne reçoit les correctifs de sécurité pendant trois mois après la mineure qui l’a suivie. Ce que cela donne à la
4.5.0 (23 octobre 2026), le même tableau que la [politique de sécurité](contribute.security-policy.md#supported-versions) :

| Ligne | Correctifs | Jusqu’au |
| --- | --- | --- |
| 4.5 | tous les correctifs | la mineure suivante, puis trois mois de correctifs de sécurité |
| 4.4 | correctifs de sécurité | 23 janvier 2027 |
| 4.3 | correctifs de sécurité | 22 janvier 2027 |
| 4.2.5 | correctifs de sécurité, sur une branche partie de `v4.2.5` (SUPPORT, écrit à la 4.3.0) | 21 janvier 2027 |

La lignée 3.x s’est arrêtée à la 3.9 ; ses jeux passent à la
4.0 avec `quest-n-click migrate` (rien à réécrire pour un jeu déjà au schéma 3).

**Historique de la politique.** Chaque ligne ci-dessous a dit ce qu’elle changeait ; la plus récente d’abord.

<a name="v440"></a>

### 4.4.0 « Author's Desk »

Ne change le statut d’aucune surface (le registre est à la 4.4.0). N’ajoute que des champs facultatifs : `onTap: 'go'`
sur un hotspot, une liste de portraits et `joins` pour un lieu de la carte ; rien à changer dans un jeu (notes de mise
à jour §41). Deux nouvelles passes, `heroes-two-languages` et `studio-hero-matrix`.

<a name="v430"></a>

### 4.3.0 « Hero Choice » : la ligne 4.3 (D48)

Ne change le statut d’aucune surface. Ajoute au schéma d’écriture, en SemVer strict : le `name` d’une variante de
personnage, les aiguillages de texte et `{hero}`, `img` sur une option de choix, les clips de voix rangés par valeur
d’un drapeau (le choix du héros, ADR 0022, D49) et la `key` d’un verbe (#203), chacun facultatif, de présentation
seulement, sans nouvelle condition, commande ni état ; `schemaVersion` reste 3 et l’enveloppe de sauvegarde est celle
de la 4.2.0. Aucune passe humaine ne les couvre encore. La police d’interface par défaut est Galmuri11 (#204) : une
apparence, pas un format. Retire les alias `web-scumm`, comme la D47 l’annonçait : le seul retrait dans une mineure,
l’exception choisie par le mainteneur. `main` est devenue la ligne 4.3 (D48).

<a name="v425"></a>

### 4.2.5 : le nouveau nom (D47)

Renomme le projet quest'n'click et ne change le statut d’aucune surface. Les noms `web-scumm` (le package et sa
commande), `web-scumm/content`, `/player`, `/minigames`, `/testing`, `/reality`, `create-web-scumm`,
`web-scumm-bridge`, `web-scumm-connectors` (commande `web-scumm-connector`) et `web-scumm-studio-server` (commandes
`web-scumm-studio-server`, `web-scumm-studio-worker`) ont été des **alias dépréciés** de leurs noms `quest-n-click`
pendant toute la 4.2.x, chaque release de la ligne les livrant, et sont retirés en 4.3.0 : `quest-n-click migrate`
renomme les imports d’un jeu, les chemins de son tsconfig et les commandes de ses scripts, et la mise à jour du moteur
du Studio hébergé renomme les imports d’un jeu hébergé ([Venir de web-scumm](install.from-web-scumm.md)). Les
identifiants de format qui disent web-scumm (`web-scumm-save`, `web-scumm-session`, le `web-scumm-speedrun` des
`.wsrun`, `web-scumm-remix-1`, les noms des stockages et des en-têtes, `WEB_SCUMM_*`) font partie des formats, ce ne
sont pas des noms du projet : ils restent, et aucune 4.3 ne les retire.

<a name="v424"></a>

### 4.2.4 : des champs de présentation facultatifs (D46)

Ne change le statut d’aucune surface. Le format du contenu reste celui de la 4.2.0, lu avec une exception (D46) : une
4.2.x peut ajouter un champ de contenu facultatif, de présentation seulement, qui ne demande aucun changement de
schéma, d’enveloppe de sauvegarde ni d’IR, et laisse identique un jeu qui ne l’utilise pas. La 4.2.4 en ajoute trois :
`input.exitOnTap`, `onTap` sur une sortie et `actorGap`. `sheetBackground` dans `site.json` est un réglage des outils
d’image, pas du contenu. Renommer, retirer ou changer le sens d’un champ attend toujours une mineure.

<a name="v423"></a>

### 4.2.3 : la fin de la ligne 4.2.x

Termine la ligne 4.2.x du Studio Server (D40, D44). Aucune passe n’avait été faite, donc aucune surface n’a été
promue : ce que la 4.2.0 promettait est resté, et ce qui est venu après est expérimental. À la fin de la 4.2.x :

- **Stable** : le format du contenu et ses outils, le lecteur de jeu sur Chromium d’ordinateur et sa PWA, le profil
  `local` du Bridge, et l’API publique en SemVer.
- **Limité, jusqu’à leurs passes (#75–#87)** : le lecteur DOM sur téléphone et au lecteur d’écran, la PWA Safari,
  Firefox (la PWA seulement), speedrun et Remix, voix et musique, les quatre archives de packages installées par une
  personne.
- **Expérimental** : le peintre Canvas, le profil `distributed`, les quatre connecteurs ; le Studio sous Windows reste
  partiel.
- **Le Studio Server, expérimental dans son ensemble**, avec six passes : `studio-hosted` (#149) et `studio-collab`
  (#150) pour le serveur lui-même (le journal, les connexions et les rôles, les pans et les baux, le flux en direct,
  l’origine du jeu) ; `studio-preview` (#166) pour les prévisualisations, les sauvegardes d’une révision à l’autre, la
  santé, l’annulation personnelle et les builds publiés ; `studio-assets-hosted` (#167) pour Prepare sur le worker,
  depuis les archives depuis la 4.2.3, avec les envois et découpages de l’onglet Assets en jobs ; `studio-mcp-remote`
  (un agent par `/mcp`) et `studio-oidc-generic` (un second fournisseur OpenID, GitLab : la CI ne fait tourner que
  Keycloak).
- **Les autres ajouts de la 4.2.3**, expérimentaux avec le serveur et prouvés par les suites unitaires (SQLite)
  seulement : la révision lue et son 409 (un script ou le MCP qui n’envoie pas `x-studio-base` n’est pas vérifié
  ainsi), la carte du scénario, les commentaires, le diff sémantique, Git (testé sur un dépôt nu local ; un dépôt par
  instance ; LFS et sous-modules non lus), la mise à jour du moteur (une route, pas encore de bouton). Le job
  `studio-hosted` (Postgres, S3, Keycloak) ne les fait pas tourner.
- **Exploitation** : les métriques, la sauvegarde quotidienne vers le bucket et le guide d’exploitation ont tourné une
  fois sur l’organisation de test de Clever Cloud, pas sous une charge de production ; leurs chiffres sont dans
  [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md) (sur les plus petits plans : une
  restauration avec son rejeu en une minute environ, rien de perdu ; un p95 de prévisualisation de 44 s, pas les 5 s
  visées ; des écritures refusées 10 à 16 s lors d’un redéploiement, environ 2,5 min lors du premier vers la 4.2.3).
  Le jeu de mutation `studio-workshop` est bloquant depuis la 4.2.3.

Ce qui restait ouvert après la 4.2.x, et où il en est à la 4.4.0 :
[Feuille de route](start.roadmap.md#open-items).

<a name="v422"></a>

### 4.2.2 : l’atelier jouable

Le Studio Server reste expérimental : la 4.2.2 ajoute les passes `studio-preview` (des personnes jouent la révision
partagée, emportent une sauvegarde d’une révision à l’autre, lisent la santé, annulent leur propre travail, publient
un build) et `studio-assets-hosted` (`prepare` sur le worker de traitement). Leurs preuves machine : les suites
unitaires (SQLite) et le job `studio-hosted` (Postgres et S3 : un build, le `prepare` du worker, une sauvegarde
restaurée et son journal rejoué). Le jeu de mutation `studio-workshop` était mesuré, pas bloquant, en 4.2.2. Limites
dites alors : les planches de sprites et les envois restent sur un Studio local (levé en 4.2.3) ; la santé du jeu juge
le validateur et le solveur depuis une nouvelle partie, pas les parties de test ; une sauvegarde est une entrée de
confiance (elle peut ajouter des propriétaires) ; une restauration ne vaut que pour un stockage hébergé ; un worker
installé depuis les archives de la release ne pouvait pas lancer `prepare` (levé en 4.2.3). L’Assistant n’est toujours
pas sur un Studio hébergé, et une écriture refusée garde son brouillon sans diff à fusionner (la 4.2.3 a ajouté la
fusion proposée sur un 409).

<a name="v421"></a>

### 4.2.1 : le Studio Server, et l’exception 4.2.x (D40)

De la 4.2.1 à la 4.2.3, on peut **ajouter** (un outil, une commande, une route du Studio Server, un package) mais
jamais changer ni retirer un nom public ou un format : l’API publique (`src/engine/api`), le format du contenu et
l’enveloppe de sauvegarde restent ceux de la 4.2.0 (D40). Le **Studio Server** (l’archive
`quest-n-click-studio-server`) est **expérimental** : ses preuves machine sont le job de CI `studio-hosted` et le
`studio-install-smoke` du candidat ; il deviendra limité, puis stable, avec ses passes `studio-hosted` (un vrai
déploiement Clever Cloud, un vrai Safari) et `studio-collab` (trois personnes, une coupure, un redéploiement). Ses
tests de navigateur tournent dans Chromium et Firefox en CI, et dans WebKit sous macOS à la main : aucun WebKit ne les
fait tourner en CI, et WebKit sous Linux ne sait pas faire tourner le jeu dans son cadre. Le Studio et les outils qui
écrivent un jeu demandent Node 22.13+. Les dépendances de l’archive sont verrouillées pour une installation depuis le
registre ; installée depuis le fichier d’archive, npm les résout depuis leurs plages
(`quest-n-click-studio-server deps` dit lesquelles). En 4.2.1, le jeu du Studio hébergé était une prévisualisation en
direct (un build par révision depuis la 4.2.2) ; l’onglet Assets et l’Assistant n’y étaient pas ; une écriture refusée
gardait son brouillon à copier pour réessayer, sans diff à fusionner, et les éditeurs n’envoyaient pas la révision
qu’ils avaient lue (les deux sont venus en 4.2.3).

<a name="v420"></a>

### 4.2.0 « Stable World » : ce qui est promis (D38)

La 4.2.0 est sortie avant les passes humaines. Elle ne promet comme **stable** que ce qui ne demande aucune passe : le
format du contenu et ses outils, le lecteur de jeu sur Chromium d’ordinateur et sa PWA, et le profil `local` du Bridge
sur SQLite. **Limité** : le lecteur DOM sur téléphone et au lecteur d’écran, la PWA Safari, Firefox (la PWA
seulement), speedrun et Remix, voix et musique, les quatre archives de packages installées par une personne.
**Expérimental** : le peintre Canvas, le profil `distributed`, les quatre connecteurs. **Partiel** : le Studio sous
Windows. Chacun ne change qu’avec sa passe faite sur un candidat ([GO / NO-GO 4.2](../../docs/dev/GO-NO-GO-4.2.md)).
La promesse SemVer de l’API publique n’est pas touchée. La 4.2.0 a rétabli le **SemVer strict** : à partir d’elle, une
mineure ajoute et une majeure retire.

<a name="v41x"></a>

### La ligne 4.1.x (D14, D18)

À partir de la 4.1.1, le projet est resté sur la 4.1.x jusqu’à la 4.2. Jusqu’à la **4.1.7**, une release 4.1.x pouvait
*ajouter* une entrée, un champ, une route, une commande, un hook ou un sous-objet facultatif (le `@quest-n-click/engine/reality`
de la 4.1.1, les options du Bridge de la 4.1.2, `destroy` et les hooks de la 4.1.4, `sessions`, `camera` et `walker` de
la 4.1.5, les deux commandes de la 4.1.6), jamais changer ni retirer un nom public ou un format : un jeu écrit pour
l’une d’elles tourne sur toutes les suivantes jusqu’à la 4.1.7. **De la 4.1.8 à la 4.1.15, la ligne a été une ligne
d’incubation** (D18, 7 octobre 2026) : aucun jeu en production ne dépendait du moteur (le jeu du mainteneur reste en
3.1.0, D8), si bien qu’une release du programme pouvait casser un nom public ou un format quand il le fallait. Chaque
rupture est listée sous « Breaking » dans le changelog, livrée avec une migration des jeux fournis et des sauvegardes
quand elles sont concernées, et a ses notes de mise à jour ([Notes de mise à jour : 4.1](install.upgrade-notes-4-1.md)).
Le cœur du DSL a été stabilisé en 4.1.12 et gelé après la 4.1.15. Les versions les plus risquées ont d’abord eu une
release candidate (`4.1.8-rc.1`, une pré-release GitHub avec les mêmes fichiers et vérifications).

<a name="deprecation"></a>

## Dépréciation

Un nom ou une option à retirer est d’abord **déprécié** dans une mineure : marqué `@deprecated` dans son type (les
éditeurs le barrent), listé dans l’[API publique](engine.api.md) avec son remplaçant, et nommé dans la section
« Deprecated » du changelog. Il continue de marcher jusqu’à la fin de cette majeure, et disparaît à la suivante.
Déprécié en 4.0 : `RevealDef` (utilisez `EndingDef`). La seule exception, choisie par le mainteneur : les alias
`web-scumm`, dépréciés en 4.2.5 et retirés en 4.3.0 (D47).

<a name="saves"></a>

## Sauvegardes

Une sauvegarde écrite par n’importe quelle release de la lignée 3.x ou 4.x se charge dans toute 4.x suivante :
l’enveloppe est versionnée (schéma 4 depuis la 4.1.15, schéma 3 toujours lu), les `migrations` propres au jeu portent
ses identifiants, et `tests/save-v3.test.ts` charge une sauvegarde figée de chaque release depuis la 3.0.0 et la joue
jusqu’à la fin. Une sauvegarde plus récente que le jeu où on la charge est refusée, jamais lue à moitié. Le `.wsrun`
d’un speedrun est au schéma 2 depuis la 4.1.16 (le monde du run scellé dans sa preuve) ; un fichier au schéma 1 de la
4.1.14 ou de la 4.1.15 est toujours vérifié, comme un run d’Histoire. Pour un joueur : [Sauvegardes](play.saves.md) ;
pour un auteur : [État et sauvegardes](create.state-saves.md).

<a name="releases"></a>

## Releases

Chaque release est construite depuis le commit que son candidat a testé, porte ses licences dans l’archive, et joint
un manifeste des assets, cinq SBOM CycloneDX (le moteur, `@quest-n-click/create`, le Bridge, les connecteurs et l’image
du Bridge, depuis la 4.1.19), les sommes SHA-256 et une attestation de provenance. Depuis la 4.2.0, les tags sont signés
et les releases immuables : jamais remplacées une fois publiées. Ce que seules des personnes et de vrais appareils
peuvent vérifier est indiqué dans ses notes. Comment on fait une release : [Publier une release](contribute.releasing.md).

> [!LIMIT id=not-on-npm]
> À la 4.4.0, les packages ne sont pas publiés sur npm : le moteur s’installe depuis l’archive d’une release
> ([Installer depuis l’archive de la release](install.from-archive.md)).

<a name="references"></a>

## Références

- [Matrice de support](reference.support-matrix.md), [Feuille de route](start.roadmap.md),
  [Passes humaines](contribute.field-passes.md).
- [`docs/dev/contracts.json`](../../docs/dev/contracts.json), [`docs/dev/surfaces.json`](../../docs/dev/surfaces.json),
  [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md), [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md)
  (D14, D18, D22, D38, D40, D46, D47, D48).
