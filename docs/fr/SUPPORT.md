# Suivi et stabilité

Ce que web-scumm promet à partir de la 4.0, et comment cela change.

## Ce qui est stable

L'API publique (`docs/fr/API.md`) : les entrées `web-scumm/content`, `/player`, `/minigames`, `/testing` et, depuis
la 4.1.1, `/reality`, le
schéma d'écriture (`schemaVersion: 3`), l'enveloppe des sauvegardes, les schémas des outils du Studio et du MCP, et la
commande `web-scumm`. Tout le reste de `src/engine` est interne : il peut changer à chaque release, et un jeu qui y
accède par l'alias `@engine/*` en prend le risque.

## Versions

Versionnage sémantique de l'API publique :

- un **correctif** (4.0.x) répare ; il ne change jamais un nom public ni un format ;
- une **mineure** (4.x) ajoute ; elle peut déprécier, jamais retirer ;
- une **majeure** (5.0) peut retirer ce qu'une mineure a déprécié, et dit comment passer dans `docs/fr/UPGRADING.md`.

**La lignée 4.1.x est l'exception, dite une fois (D14).** Depuis la 4.1.1 le projet reste en 4.1.x jusqu'à la 4.2, la
version finale, et une release 4.1.x peut *ajouter* : une entrée, un champ, une route, une commande, un hook ou un
sous-objet optionnels (le `web-scumm/reality` de la 4.1.1, les options du Bridge de la 4.1.2, `destroy` et les hooks
de la 4.1.4, `sessions`, `camera` et `walker` de la 4.1.5, les deux commandes de la 4.1.6). Ce qu'elle ne peut pas
faire est ce qu'un correctif ne peut pas faire non plus : changer ou retirer un nom public ou un format. Chaque ajout
est optionnel, rien de la 4.1.0 ne change, et un jeu ou un hôte écrit pour n'importe quelle 4.1.x tourne sur chaque
4.1.x suivante, **jusqu'à la 4.1.7**. `docs/fr/UPGRADING.md` a une section par release qui dit ce qu'un hôte doit
savoir, s'il y a quelque chose.

**À partir de la 4.1.8, la lignée 4.1.x est une lignée d'incubation (D18, 7 octobre 2026).** Aucun jeu de production
ne dépend du moteur (le jeu du mainteneur reste en 3.1.0, D8) : une release du programme `docs/dev/PROGRAM-4.1.md`
(4.1.8 à 4.1.15) peut casser un nom public ou un format quand le programme l'exige. Chaque rupture est listée sous
« Breaking » dans le CHANGELOG, livrée avec une migration des jeux fournis et des sauvegardes quand elles sont
concernées, et a sa section dans `docs/fr/UPGRADING.md` ; une surface dont les passes humaines ne sont pas faites est
marquée expérimentale ici. Le socle du DSL est stabilisé en 4.1.12 et gelé après la 4.1.15. **La 4.2.0 « Stable
World » rétablit le SemVer strict** : à partir d'elle, une mineure ajoute et une majeure retire, comme ci-dessus. Les
versions les plus risquées ont d'abord une release candidate (`4.1.8-rc.1`, une pré-release GitHub avec les mêmes
fichiers et les mêmes contrôles).

Suivies : la dernière mineure de la majeure en cours reçoit les correctifs ; la mineure précédente reçoit les
correctifs de sécurité trois mois après la sortie de la suivante. La lignée 3.x s'est terminée avec la 3.9 ; ses jeux
passent en 4.0 avec `web-scumm migrate` (rien à réécrire pour un jeu déjà en schéma 3).

## Matrice de support

Ce que les gates automatiques exécutent, et ce que seules des personnes vérifient (`docs/fr/FIELD.md`). Depuis la 4.1.9,
la CI exécute chaque ligne ci-dessous sur `main` et sur chaque tag ; une pull request exécute le niveau rapide (lint,
types, la suite unitaire, le build et la preuve du jeu d'exemple) et seulement les lignes que son changement peut
toucher, selon le classement du diff par `tools/ci-plan.ts` : une pull request de docs seules n'ouvre aucun navigateur,
aucun runner Windows ni Node 24 (`CONTRIBUTING.md`, « What CI runs ») :

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

## 4.2.2 : l'atelier jouable

Le Studio Server reste **expérimental** : la 4.2.2 ajoute deux passes aux deux de la 4.2.1, `studio-preview` (des
personnes jouent la révision commune, portent une sauvegarde d'une révision à l'autre, lisent la santé, défont leur
propre travail, publient un build) et `studio-assets-hosted` (`prepare` sur l'application de traitement). Leurs preuves
machine sont les suites unitaires (SQLite) et le job `studio-hosted` (Postgres et S3 : un build, le `prepare` de
l'application de traitement, une sauvegarde restaurée et son journal rejoué). Le set de mutation `studio-workshop` est
mesuré, pas bloquant, jusqu'à la lecture de ses survivants. Limites dites : la découpe de planches et les uploads
restent sur un Studio local (4.2.3) ; la santé du jeu juge le validateur et le solveur depuis une nouvelle partie, pas
les playtests ; une sauvegarde est une entrée de confiance (elle peut ajouter des propriétaires) ; une restauration ne
vaut que pour un stockage hébergé ; un worker installé depuis les archives de la release ne peut pas lancer `prepare`
(déployez-le depuis le dépôt ; la 4.2.3 livre le verrou). Des limites de la 4.2.1, l'aperçu vivant a disparu (un build
par révision) ; la découpe et les uploads de l'onglet Assets et l'Assistant ne sont toujours pas sur un Studio hébergé,
une écriture refusée garde toujours son brouillon sans diff à fusionner, et les éditeurs n'envoient toujours pas la
révision qu'ils ont lue.

## 4.2.1 : le Studio Server, et l'exception 4.2.x (D40)

Les 4.2.1 à 4.2.3 peuvent **ajouter** (un outil, une commande, une route du Studio Server, un paquet) mais jamais
changer ou retirer un nom public ou un format : l'API publique (`src/engine/api`), le format du contenu et l'enveloppe
de sauvegarde restent ceux de la 4.2.0 (D40). Le **Studio Server** (`docs/fr/STUDIO-SERVER.md`, l'archive
`web-scumm-studio-server`) est **expérimental** : ses preuves machine sont le job CI `studio-hosted` et le
`studio-install-smoke` du candidat ; il devient limité, puis stable, avec ses passes `studio-hosted` (un vrai
déploiement Clever Cloud, un vrai Safari) et `studio-collab` (trois personnes, une coupure, un redéploiement). Ses
tests navigateur tournent sous Chromium et Firefox en CI (job `studio-hosted`, sur main et chaque tag), et sous WebKit
sous macOS à la main : aucun WebKit ne les fait tourner en CI, et WebKit sous Linux ne peut pas afficher le jeu dans
son cadre. En 4.2.1 le jeu dans le Studio hébergé est un **aperçu vivant**, pas figé à une révision (P4 arrive en
4.2.2) ; l'onglet Assets et l'Assistant n'y sont pas encore ; une écriture refusée garde son brouillon à copier et à
réessayer (pas de diff à fusionner), et les éditeurs n'envoient pas la révision qu'ils ont lue (la base de P5). Le
Studio et les outils qui écrivent un jeu demandent Node 22.13+. Les dépendances de l'archive sont verrouillées pour une
installation depuis le registre ; installées depuis le fichier d'archive, npm les résout d'après leurs plages
(`web-scumm-studio-server deps` dit lesquelles).

## 4.2.0 : ce qui est promis (D38)

La 4.2.0 sort avant les passes humaines. Des surfaces ci-dessus, elle ne promet **stables** que celles qui n'en
demandent aucune : le format du contenu et ses outils, le lecteur sur Chromium de bureau et sa PWA, et le profil
`local` du Bridge sur SQLite. **Limités** : le lecteur DOM sur téléphone et au lecteur d'écran, la PWA Safari,
Firefox (la PWA seulement), speedrun et Remix, les voix et la musique, les quatre archives installées par une
personne. **Expérimentaux** : le peintre Canvas, le profil `distributed`, les quatre connecteurs. **Partiel** : le
Studio sous Windows. Chacun ne change qu'avec sa passe faite sur un candidat 4.2.x
([GO / NO-GO 4.2](../dev/GO-NO-GO-4.2.md)). La promesse SemVer de l'API publique ci-dessus n'est pas touchée.

## Dépréciation

Un nom ou une option à retirer est d'abord **déprécié** dans une mineure : marqué `@deprecated` dans son type (les
éditeurs le barrent), listé dans `docs/fr/API.md` avec son remplaçant, et nommé dans la section « Deprecated » du
CHANGELOG. Il continue de marcher pour le reste de cette majeure, et disparaît à la suivante. Déprécié en 4.0 :
`RevealDef` (utiliser `EndingDef`).

## Sauvegardes

Une sauvegarde écrite par n'importe quelle release des lignées 3.x ou 4.x se charge dans toute 4.x suivante :
l'enveloppe est versionnée (schéma 4 depuis 4.1.15, le schéma 3 toujours lu), les `migrations` du jeu portent ses ids, et `tests/save-v3.test.ts` charge une
sauvegarde figée de chaque release. Une sauvegarde plus récente que le jeu où on la charge est refusée, jamais lue à
moitié. Le `.wsrun` d'un speedrun est de schéma 2 depuis 4.1.16 (le monde du run scellé dans sa preuve) ; un fichier de
schéma 1 de 4.1.14 ou 4.1.15 est toujours vérifié, comme un run Story.

## Releases

Chaque release est construite depuis le commit que la CI a testé, porte ses licences dans l'archive, joint un manifeste
des assets, cinq SBOM CycloneDX (le moteur, `create-web-scumm`, le Bridge, les connecteurs et l'image du Bridge,
4.1.19), des sommes SHA-256 et une attestation de provenance, et n'est jamais remplacée une fois publiée
(`docs/fr/TOOLS.md`). Ce que seuls des gens et de vrais appareils vérifient est rapporté dans ses notes
(`docs/fr/FIELD.md`).
