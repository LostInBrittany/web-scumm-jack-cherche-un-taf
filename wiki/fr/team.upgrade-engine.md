# Mettre à jour le moteur d'un jeu hébergé

Un jeu importé dans un Studio d'équipe depuis un projet plus ancien peut être encore écrit pour un moteur plus ancien :
au schéma d'écriture 2 (un projet 4.1.x qui n'a jamais lancé `quest-n-click migrate`), ou avec des imports sous
l'ancien nom `web-scumm/…`. Un owner le met à niveau sur le serveur, en un appel, jugé avant que rien ne soit écrit.

Cette page parle du **contenu du jeu**. Passer le **serveur** à une nouvelle version du moteur est un redéploiement :
voir [Mettre à jour le serveur](clever.upgrade-server.md).

<a name="what-you-get"></a>

## Ce que vous obtenez

Le jeu hébergé au schéma d'écriture actuel (3, avec des identifiants stables), et ses imports sous le nom actuel, en une
ou deux révisions, ou bien un refus qui laisse la tête telle qu'elle était.

<a name="context-and-versions"></a>

## Contexte et versions

Un Studio hébergé avec son worker, depuis la 4.2.3 ; le renommage de l'ancien nom depuis la 4.3.0 (D47). Le code est
[`studio-server/src/server/engine-upgrade.ts`](../../studio-server/src/server/engine-upgrade.ts). Un Studio local n'a
pas cette route : lancez `quest-n-click migrate` dans le projet (voir [Mettre à jour](install.upgrade.md)).

Dans la ligne 4.2.x, le format du contenu est gelé (D40) : la migration du schéma vise un jeu fait sur une 4.1.x.

<a name="prerequisites"></a>

## Prérequis

- Le rôle `owner`.
- **Une sauvegarde faite juste avant**, comme chemin du retour (voir [Sauvegardes](clever.backups.md)).
- Un jeton d'accès : `npx quest-n-click-studio-server token --server <url>` depuis l'archive de la release, ou
  `npm run studio-server -- token --server <url>` dans le dépôt du moteur.
- `defineGame({...})` écrit dans `game.ts` (un jeu qui le définit ailleurs est refusé : migrez-le en local).

<a name="where-to-run"></a>

## Où lancer les commandes

Sur toute machine où la CLI est connectée au Studio (voir
[La ligne de commande du serveur](team.server-cli.md#login)). Il n'y a pas encore de bouton dans le Studio : la route
est le moyen d'y accéder.

<a name="steps"></a>

## Étapes

<!-- step: backup -->
1. **Faites une sauvegarde** et notez la révision (le « revision N » de l'en-tête).

<!-- step: call -->
2. **Appelez la route** en owner :

   ```bash
   curl -X POST -H "Authorization: Bearer $(npx quest-n-click-studio-server token --server https://studio.example)" \
     https://studio.example/api/engine/migrate
   ```

<!-- step: read-answer -->
3. **Lisez la réponse.**
   - `{ "changed": 0, "schema": {…} }` : le jeu était déjà au schéma 3 (et sous le nom actuel) ; rien n'a été écrit.
   - `{ "revision", "changed", "paths", "schema": { "from", "to" } }` : la migration a été écrite en une révision,
     `engine upgrade: authoring schema 2 → 3` ; `paths` sont les fichiers écrits. Avec `renamed`, les imports ont été
     renommés d'abord, dans une révision à part.
   - Une **422** avec `errors` (et `skipped`, `rev`, éventuellement `renamed`) : refusé, rien de la migration n'a été
     écrit.

<!-- step: replay-playtests -->
4. **Rejouez les playtests** ensuite : ils ne sont ni migrés ni jugés (une session enregistrée au schéma 2 peut nommer
   les anciennes clés positionnelles).

<a name="what-it-does"></a>

## Ce qu'elle fait

- **Exclusive.** Elle tourne sous le bail exclusif de l'owner (`*`) : personne d'autre n'écrit pendant ce temps. Les
  écritures des autres reçoivent une 423 avec le nom de l'owner, leurs brouillons restent chez eux, et ils écrivent de
  nouveau une fois qu'elle est finie. Une à la fois (429).
- **Sur le worker.** Le worker exécute la même migration que `quest-n-click migrate` sur le snapshot de la tête : les
  identifiants stables écrits dans `rooms/*.ts`, `rules.ts`, `items.ts` et `game.ts`, les clés des tables de traduction
  renommées, `ids.migration.json` et `ids.paths.json`, puis les trois lignes qu'UPGRADING laisse à l'auteur dans
  `game.ts` (`schemaVersion: 3`, `saveVersion` + 1, `migrations: [..., idsMigration]` et son import : les trois ou
  aucune, dites dans `skipped`). Rien n'est encore écrit, et rien d'autre que ces fichiers : le Studio refuse une
  réponse qui nomme un autre fichier, ou un fichier que le jeu n'a pas (le code du jeu tourne avant la migration et
  pourrait la façonner).
- **Jugée avant d'être écrite.** Le jeu migré est jugé sur le worker comme la santé juge une révision : le validateur,
  puis le solveur depuis une nouvelle partie, borné dans le temps. Un jeu que la migration casserait (un identifiant
  que l'outil n'a pas pu écrire, une liste construite par du code, un jeu qu'on ne peut plus finir), ou que le solveur
  ne peut pas juger à temps, est refusé par une 422 (`errors`, `skipped` : ce que l'outil n'a pas pu écrire), et la
  tête reste telle qu'elle était.
- **Une révision.** Sinon les fichiers modifiés sont écrits en une seule opération, à travers la garde de validation.

<a name="former-name"></a>
<!-- applies: 4.3.0.. -->

## L'ancien nom

Un jeu qui importe encore `web-scumm/…` ne se charge pas sur un Studio 4.3.0 ou plus récent (les alias ont disparu) :
sa santé n'est pas verte et la garde refuse ses écritures (une 422 : le jeu ne se charge toujours pas). La mise à
niveau renomme d'abord ces imports elle-même, dans toutes les sources TypeScript de la tête (sans exécuter le code du
jeu), en une révision à part, `engine upgrade: the former name's imports renamed`, jugée par le seul validateur : le
jeu doit se charger après et, s'il se chargeait avant, ne gagner aucune erreur. Le solveur ne la juge pas, si bien
qu'un jeu qu'on ne peut pas encore finir n'est jamais bloqué. La migration du schéma suit, jugée comme ci-dessus ; si
elle est refusée, le `body.renamed` de la réponse dit que le renommage est gardé.

À partir de la 4.5.2, le même renommage passe aussi les imports sans scope de la 4.5.1 et avant, `quest-n-click/…`, au
paquet à scope, `@quest-n-click/engine/…` (D53). Ceux-là se chargent encore sur un Studio 4.5.x d'ici là, si bien
qu'un tel jeu n'est pas refusé avant sa mise à jour.

Le renommage est écrit **sans annulation** (elle ramènerait des imports qui ne se résolvent plus), si bien que
l'historique antérieur de l'owner reste accessible ; une sauvegarde faite avant est le chemin du retour. Un worker qui
refuse, dépasse son délai ou ne laisse aucun résultat pendant que la garde l'interroge ne compte jamais comme un jeu
qui ne se charge pas : l'écriture échoue (503) et la suivante redemande.

> [!GUARANTEE id=engine-upgrade-judged-first]
> Un jeu que la migration casserait est refusé avant que rien ne soit écrit, et la tête reste intacte.

> [!LIMIT id=engine-upgrade-scope]
> Le `tsconfig.json` du projet (`baseUrl`, que `quest-n-click migrate` corrige aussi) ne fait pas partie d'un jeu
> hébergé et n'est pas touché. Les playtests (`playtests/`) ne sont ni migrés ni jugés. Un jeu dont le `defineGame`
> n'est pas dans `game.ts` est refusé : migrez-le sur un Studio local.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

L'en-tête montre la ou les nouvelles révisions ; l'historique liste `engine upgrade: …` ; la santé passe au vert pour
la nouvelle tête. Un second appel répond `{ "changed": 0 }`.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| 422 `refused: the migration would break the game (…); nothing was written` | Un identifiant que l'outil n'a pas pu écrire, une liste construite par du code, un jeu qu'on ne peut plus finir | Migrez-le sur un Studio local (`quest-n-click migrate`, puis `npm run ids` pour voir ce qui reste) et importez-le de nouveau, ou corrigez-le d'abord |
| 422 `refused: the migrated game cannot be judged (…); nothing was written` | Le solveur a manqué de temps | Pareil : migrez en local |
| 422 `refused: the game still does not load once its imports are renamed (…)` | Autre chose que le nom l'empêche de se charger | Corrigez le jeu en local |
| 422 `refused: renaming the imports adds N validation error(s)` | Le renommage ajouterait des erreurs | Corrigez-les en local |
| 429 `the engine's upgrade is running: try again when it is done` | Une autre mise à niveau tourne | Attendez |
| Des 423 pour les autres pendant qu'elle tourne | Le bail exclusif | Normal ; ils écrivent de nouveau une fois qu'elle est finie |
| 404 `the engine's upgrade needs a hosted Studio with its processing worker` | Pas de worker, ou un serveur local | Utilisez `quest-n-click migrate` en local |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`rooms/*.ts`, `rules.ts`, `items.ts`, `game.ts`, les tables de traduction, `ids.migration.json`, `ids.paths.json` ;
pour l'ancien nom, chaque source TypeScript qui importait `web-scumm/…` (à partir de la 4.5.2, ou `quest-n-click/…`).

<a name="recovery"></a>

## Revenir en arrière

- **La migration du schéma** : l'Undo de l'owner la reprend par une nouvelle révision (409 si quelqu'un a écrit l'un
  de ses fichiers depuis).
- **Le renommage** : pas d'annulation ; restaurez la sauvegarde faite avant (voir
  [Exercice de restauration](clever.restore-drill.md)).

<a name="references"></a>

## Références

- [Mettre à jour](install.upgrade.md), [Notes de mise à jour : 4.3](install.upgrade-notes-4-3.md).
- [`tests/studio-engine-upgrade.test.ts`](../../tests/studio-engine-upgrade.test.ts).
