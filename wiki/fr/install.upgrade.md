# Mettre à jour

Passer un jeu à un moteur plus récent tient en trois commandes : installer le nouveau moteur, `migrate`, `verify`.
Cette page les donne avec les vérifications autour, d'abord pour un projet créé, puis pour un jeu à l'intérieur du
dépôt du moteur et pour un jeu sur un Studio hébergé.

<a name="overview"></a>

## En bref

```bash
# dans le projet créé
npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v<version>/quest-n-click-<version>.tgz
npx quest-n-click migrate
npm run verify
```

Une fois le moteur sur npm, la première ligne devient `npm install @quest-n-click/engine@<version>`. Lisez d'abord les notes de
mise à jour de chaque version franchie ; le reste de cette page est la même procédure avec ses vérifications.

<a name="what-you-get"></a>

## Ce que vous obtenez

Votre jeu sur la nouvelle version du moteur : ses sources au format d'écriture de ce moteur, vérifiées par `verify`,
et les sauvegardes de ses joueurs qui se chargent toujours.

<a name="context-and-versions"></a>

## Contexte et versions

- Un **projet créé** (le moteur sous `node_modules/@quest-n-click/engine`). Un jeu à l'intérieur du dépôt du moteur et un jeu
  sur un Studio hébergé ont leur propre section plus bas.
- Cette procédure vaut pour une cible en 4.3.0 ou après, où `quest-n-click migrate` renomme aussi un projet encore sous
  l'ancien nom `web-scumm`. Si vous venez d'avant la 4.2.5, lisez aussi [Venir de web-scumm](install.from-web-scumm.md).
- Ce que change chaque version est dans les notes de mise à jour : [4.5](install.upgrade-notes-4-5.md),
  [4.4](install.upgrade-notes-4-4.md), [4.3](install.upgrade-notes-4-3.md), [4.2](install.upgrade-notes-4-2.md), [4.1](install.upgrade-notes-4-1.md),
  [v3](install.upgrade-notes-v3.md), [v2 vers v3](install.upgrade-notes-v2-to-v3.md). Quelles versions sont suivies, et
  combien de temps dure une dépréciation : voir [Stabilité](start.stability.md).
- Chaque mise à jour est vérifiée avant une release : le candidat crée un jeu avec une release plus ancienne, y fait une
  sauvegarde, passe le projet aux nouvelles archives comme ci-dessous, et joue l'ancienne sauvegarde jusqu'à la fin
  (`npm run upgrade-check`, `scripts/external-consumer.mjs`, sous Ubuntu, macOS et Windows).

<a name="prerequisites"></a>

## Prérequis

- Le projet commité (ou copié) : `migrate` réécrit des sources sur place.
- Les [Prérequis](install.requirements.md) de la nouvelle version (Node 22.12, 22.13 pour le Studio local).
- Les notes de mise à jour de chaque version entre la vôtre et la cible, lues pour ce qui touche votre jeu.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dossier du projet créé, sur votre machine.

<a name="steps"></a>

## Étapes

<!-- step: commit -->
1. Commitez le projet tel qu'il est, pour que la mise à jour soit un seul changement relisible :

   ```bash
   # dans le projet créé
   git add -A && git commit -m "Before the engine upgrade"
   ```

<!-- step: install-new-engine -->
2. Installez le nouveau moteur, depuis npm à partir de la 4.5.2 (`npm install @quest-n-click/engine@<version>`,
   [Installer depuis npm](install.from-npm.md)) ou depuis l'archive de la release :

   ```bash
   # dans le projet créé
   npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.4.0/quest-n-click-4.4.0.tgz
   ```

   Une fois le moteur sur npm, cette étape devient `npm install @quest-n-click/engine@<version>`.

<!-- step: migrate -->
3. Amenez les sources au format du moteur installé. `--check` dit d'abord ce qui est dû et n'écrit rien :

   ```bash
   # dans le projet créé
   npx quest-n-click migrate --check
   npx quest-n-click migrate
   ```

   `migrate` fait, dans l'ordre : rend `tsconfig.json` acceptable pour TypeScript 7 (retire `baseUrl`, rend les chemins
   relatifs, 4.1.8) ; renomme ce qui dit encore `web-scumm` (imports, `tsconfig.json`, commandes de `package.json`,
   4.3.0) ; puis, pour un jeu encore au schéma d'écriture 2, écrit ses ids stables (`ids --write --map`) et affiche ce
   qui reste à faire à la main. Un jeu déjà au schéma 3 obtient
   `✔  [<id>] authoring schema 3: up to date with this engine`.

<!-- step: reinstall -->
4. Si `migrate` a renommé `package.json`, réinstallez : `npm install`.

<!-- step: verify -->
5. Vérifiez le jeu, puis refaites ses assets si les notes le demandent :

   ```bash
   # dans le projet créé
   npm run verify
   npm run assets
   ```

<!-- step: check-saves -->
6. Chargez une sauvegarde faite avant la mise à jour. Dans `npm run dev`, reprenez une sauvegarde automatique ou un
   emplacement, ou importez une sauvegarde exportée depuis le menu de pause, et continuez à jouer.

<!-- step: build -->
7. Construisez : `npm run build`, puis commitez la mise à jour.

> [!GUARANTEE id=migrate-check-says-due]
> `migrate --check` sur un jeu encore au schéma d'écriture 2 sort avec le code 1 et dit `authoring schema 2: a
> migration to 3 is due`.

Le test le lance sur un jeu de test au schéma 2. Que rien ne soit écrit se lit dans le code (`--check` sort avant
l'écriture des ids) ; le test ne l'affirme pas.

<a name="saves"></a>

## Les sauvegardes des joueurs

- Une sauvegarde de n'importe quelle release 3.x ou 4.x se charge dans toute 4.x ultérieure. Depuis la 4.1.15, une
  sauvegarde s'écrit en enveloppe de schéma 4 ; le schéma 3 (toute sauvegarde d'avant la 4.1.15) se lit toujours et
  s'ouvre dans le monde de l'histoire. Le jeu d'exemple garde une sauvegarde par release, de la 3.0.0 à la 4.4.0, et
  chacune doit se charger sur le moteur actuel et atteindre la fin (`tests/save-v3.test.ts`, « golden saves »).
- Une sauvegarde plus récente que le jeu est refusée, jamais lue à moitié : avec un `saveVersion` supérieur à celui du
  jeu, aucune chaîne de migrations n'atteint la version du jeu, et le chargement s'arrête sur
  `save version <n> cannot be migrated to <m>` (`src/engine/core/save.ts`) ; la partie en cours reste telle quelle.
- Quand **votre** contenu change d'une façon qui casse les sauvegardes, vous augmentez `saveVersion` et ajoutez une
  étape `migrations` par version : [État et sauvegardes](create.state-saves.md).
- Revenir en arrière n'est pas pris en charge : une sauvegarde faite par un moteur plus récent peut ne pas se charger
  sur un plus ancien (une sauvegarde 4.1.15 ne se charge pas en 4.1.14).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`npx quest-n-click help` affiche la nouvelle version sur sa première ligne. `npx quest-n-click migrate --check` sort
avec 0. `npm run verify` passe. Une ancienne sauvegarde se charge et se joue.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `npm error 404 Not Found - GET https://registry.npmjs.org/quest-n-click` | `npm install @quest-n-click/engine@<version>` : pas sur npm | Installez l'URL de l'archive (étape 2) |
| ✖ tsconfig.json has baseUrl, which TypeScript 7 refuses: a migration is due | Un projet fait avant la 4.1.8 | `npx quest-n-click migrate` |
| `✖  still under the former name web-scumm: …` | Un projet fait avant la 4.2.5 | `npx quest-n-click migrate`, puis `npm install` ([Venir de web-scumm](install.from-web-scumm.md)) |
| `✖  [<id>] authoring schema <n> is newer than this engine's (3): install a newer quest-n-click` | Le jeu a été écrit pour un moteur plus récent | Installez ce moteur-là, pas un plus ancien |
| Un import de `web-scumm/content` (ou d'un autre `web-scumm/…`) ne se résout plus | Des imports sous l'ancien nom, retiré en 4.3.0 | `npx quest-n-click migrate` |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`package.json` et `package-lock.json` (la version du moteur) ; ce que réécrit `migrate` : `tsconfig.json`, les scripts
de `package.json`, les sources du jeu (les imports, et les ids stables pour un jeu au schéma 2, avec
`ids.migration.json` et `ids.paths.json`) ; `public/assets/` après `assets`. Les sauvegardes des joueurs restent dans
leurs navigateurs : rien de votre côté ne les réécrit ; le nouveau moteur les lit.

<a name="recovery"></a>

## Reprise ou retour arrière

Avant la sortie de la release : `git reset --hard` au commit de l'étape 1, puis `npm install` pour remettre l'ancien
moteur. Une fois que des joueurs ont joué sur la nouvelle version, revenir en arrière n'est pas pris en charge : leurs
sauvegardes peuvent déjà être dans un format que l'ancien moteur ne lit pas.

<a name="engine-repository"></a>

## Un jeu à l'intérieur du dépôt du moteur

Dans le dépôt du moteur, le moteur est le checkout lui-même : passez-le à la nouvelle version (`git pull`, ou
`git checkout v<version>`), puis :

```bash
# à la racine du dépôt du moteur
npm ci
GAME=<id> npm run migrate -- --check
GAME=<id> npm run migrate
npm run verify:game
```

<a name="hosted-studio"></a>

## Un jeu sur un Studio hébergé

Le propriétaire met à jour le moteur d'un jeu hébergé depuis le Studio (`POST /api/engine/migrate`) : la migration
tourne sur l'application de traitement, est jugée comme une révision, et s'écrit en une seule opération annulable, ou
est refusée (422) sans rien écrire : [Mettre à jour le moteur d'un jeu hébergé](team.upgrade-engine.md). La mise à jour
du serveur lui-même est décrite dans [Mettre à jour le serveur](clever.upgrade-server.md).

<a name="references"></a>

## Références

- Les notes de mise à jour : [4.5](install.upgrade-notes-4-5.md), [4.4](install.upgrade-notes-4-4.md), [4.3](install.upgrade-notes-4-3.md),
  [4.2](install.upgrade-notes-4-2.md), [4.1](install.upgrade-notes-4-1.md), [v3](install.upgrade-notes-v3.md),
  [v2 vers v3](install.upgrade-notes-v2-to-v3.md)
- [Stabilité](start.stability.md), [État et sauvegardes](create.state-saves.md), [Journal des versions](reference.changelog.md)
- [`tools/migrate.ts`](../../tools/migrate.ts), [`scripts/upgrade-check.mjs`](../../scripts/upgrade-check.mjs),
  [`tests/save-v3.test.ts`](../../tests/save-v3.test.ts)
