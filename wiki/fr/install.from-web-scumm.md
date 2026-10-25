# Venir de web-scumm

quest'n'click s'appelait **web-scumm** jusqu'à la 4.2.4 (D47). La 4.2.5 a renommé les paquets, les commandes et les
imports, en gardant les anciens noms comme alias pendant toute la 4.2.x ; **la 4.3.0 a retiré ces alias**. Un jeu qui
dit encore `web-scumm` passe avec une commande, `npx quest-n-click migrate`. Les sauvegardes des joueurs ne sont pas
touchées : les formats ont gardé leur nom.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un projet de jeu qui dépend de `@quest-n-click/engine`, importe `@quest-n-click/engine/…`, appelle `quest-n-click` dans ses scripts, et
se construit et se joue comme avant, les sauvegardes de ses joueurs retrouvées là où elles étaient.

<a name="context-and-versions"></a>

## Contexte et versions

- Un **projet créé** avec `create-web-scumm` (ou `web-scumm create`), passé à un moteur 4.3.0 ou plus récent.
- Jusqu'à la 4.2.4, tous les noms étaient `web-scumm…`. Depuis la 4.2.5, les nouveaux noms existent, et chaque release
  4.2.x livrait aussi les archives sous les anciens noms, dont les commandes tournaient après une ligne d'avertissement
  (« web-scumm is now quest-n-click; the old name works until 4.3 »). Depuis la 4.3.0, il n'y a plus d'archive, de
  commande ni d'import `web-scumm`.
- Le dépôt est `github.com/Quest-n-Click/quest-n-click` ; les anciens liens `github.com/wanoo/web-scumm` redirigent, y compris
  les téléchargements de release. Le jeu d'exemple et la démo du Studio sont maintenant sur
  `https://quest-n-click.cleverapps.io/demo/` (depuis la 4.5.2 ; les adresses GitHub Pages d'avant sont abandonnées) :
  mettez à jour vos favoris et vos liens.

<a name="names"></a>

## Les noms, avant et après

| Avant (jusqu'à la 4.2.4) | Depuis la 4.2.5 |
|---|---|
| paquet `web-scumm`, commande `web-scumm` | `quest-n-click`, commande `quest-n-click` |
| imports `web-scumm/content`, `/player`, `/minigames`, `/testing`, `/reality` | `quest-n-click/content`, … |
| `create-web-scumm` | `create-quest-n-click` |
| `web-scumm-bridge` (paquet et commande) | `quest-n-click-bridge` |
| `web-scumm-connectors`, commande `web-scumm-connector` | `quest-n-click-connectors`, commande `quest-n-click-connector` |
| `web-scumm-studio-server`, `web-scumm-studio-worker` | `quest-n-click-studio-server`, `quest-n-click-studio-worker` |
| fichiers de release `web-scumm-<version>.tgz`, `web-scumm-<tag>-…` | `quest-n-click-<version>.tgz`, `quest-n-click-<tag>-…` |

À partir de la 4.5.2, les paquets portent le scope de l'organisation npm (D53) : `@quest-n-click/engine`,
`@quest-n-click/create`, `@quest-n-click/bridge`, `@quest-n-click/connectors`, `@quest-n-click/studio-server`, et les
imports sont `@quest-n-click/engine/content`, … ; les commandes et les fichiers de release gardent les noms ci-dessus.
En 4.5.2 ou après, `migrate` amène un projet `web-scumm` directement aux noms à scope.

<a name="kept-names"></a>

## Ce qui garde son nom

Les formats sont des identifiants à l'intérieur des fichiers et des stockages, pas le nom du projet : les renommer
casserait les sauvegardes, les fichiers et les déploiements existants. Une sauvegarde reste une enveloppe
`web-scumm-save`, une session `web-scumm-session`, un run un fichier `.wsrun` au format `web-scumm-speedrun`, un monde
Remix `web-scumm-remix-1` ; un signal reste `web-scumm-world-signal`, un manifeste de réalité
`web-scumm-reality-manifest`. Le navigateur garde ses bases IndexedDB (`web-scumm-saves`, `web-scumm-runs`) et ses clés
de stockage `web-scumm.…` : les sauvegardes et les runs d'un joueur sont retrouvés là où ils étaient. Les en-têtes
`X-Web-Scumm-*` du Bridge, les contextes des signatures, les variables d'environnement `WEB_SCUMM_*` et les tables du
Studio Server ne changent pas.

Les releases jusqu'à la v4.2.4 gardent les noms de leurs fichiers et leurs attestations, qui nomment le dépôt
`wanoo/web-scumm` ; de la v4.2.5 à la v4.5.1, elles nomment `wanoo/quest-n-click`, et depuis la v4.5.2, après le passage
dans l'organisation Quest-n-Click, `Quest-n-Click/quest-n-click` (`ship verify` demande celui sous lequel chaque release
a été signée ; les attestations d'avant le passage sont cherchées sous l'utilisateur `wanoo`). Les crédits du jeu d'exemple et du chapitre de référence disent quest'n'click :
leur empreinte de présentation a bougé et leur run de référence a été réenregistré. L'empreinte d'un jeu ne bouge que
si son propre texte change.

<a name="prerequisites"></a>

## Prérequis

- Le projet commité : `migrate` réécrit des fichiers sur place.
- Les [Prérequis](install.requirements.md) de la version cible.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dossier du projet créé, sur votre machine.

<a name="steps"></a>

## Étapes

<!-- step: uninstall-old -->
1. Retirez l'ancien paquet :

   ```bash
   # dans le projet créé
   npm uninstall web-scumm
   ```

<!-- step: install-new -->
2. Installez le moteur sous son nouveau nom, depuis l'archive de la release :

   ```bash
   # dans le projet créé
   npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.4.0/quest-n-click-4.4.0.tgz
   ```

<!-- step: migrate -->
3. Renommez ce que dit encore le projet, vérifiez, et réinstallez :

   ```bash
   # dans le projet créé
   npx quest-n-click migrate
   npx quest-n-click migrate --check
   npm install
   npm run verify
   ```

   `migrate` renomme, dans chaque fichier source du projet (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`,
   `.cjs` ; `node_modules`, `dist`, `public` et les dossiers cachés laissés de côté), les imports `web-scumm/…` en
   `@quest-n-click/engine/…` (`quest-n-click/…` avant la 4.5.2), quel que soit le style de guillemets ; dans `tsconfig.json`, le chemin `web-scumm/*` et les cibles
   `node_modules/web-scumm/…` ; dans `package.json`, les commandes des scripts (`web-scumm dev` devient
   `quest-n-click dev`, `web-scumm-bridge serve` devient `quest-n-click-bridge serve`), et il retire la dépendance à un
   ancien paquet quand le nouveau est installé. Toute chaîne qui commence par `web-scumm/` entre guillemets est
   renommée, import ou pas ; `web-scumm-save` et les autres noms de formats ne le sont pas. Il se relance ensuite dans
   un nouveau processus, qui lit le `tsconfig.json` renommé, pour la suite de la migration.

> [!GUARANTEE id=former-name-imports]
> `migrate` renomme les imports `web-scumm/…` quel que soit le style de guillemets, et rien de ce qui ne fait que
> leur ressembler (`web-scumm-save` reste). Le test lance la fonction de renommage sur des textes d'exemple ; le
> renommage d'un projet entier est couvert par les autres tests du même fichier et par l'`external-consumer` du
> candidat, pas par celui-ci.

<!-- step: commands-you-type -->
4. Changez de la même façon les commandes que vous tapez et vos scripts : `npx web-scumm …` devient
   `npx quest-n-click …` ; `npx web-scumm-bridge`, `npx web-scumm-connector`, `npx web-scumm-studio-server`,
   `npx web-scumm-studio-worker` deviennent `npx quest-n-click-bridge`, `npx quest-n-click-connector`,
   `npx quest-n-click-studio-server`, `npx quest-n-click-studio-worker`.

<!-- step: hosts -->
5. L'hôte d'un Bridge, des connecteurs ou du Studio Server installe les archives `quest-n-click-…` et appelle les
   nouvelles commandes dans ses fichiers d'unité et ses scripts.

<a name="by-hand"></a>

## À la main, sans `migrate`

Depuis le dossier du projet, les imports dans les deux styles de guillemets, noms avec espaces compris (`grep` et `sed`
GNU comme BSD), puis `tsconfig.json` et `package.json` comme ci-dessous :

```bash
# dans le projet créé
grep -rl --null -E --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.cts' --include='*.js' \
  --include='*.jsx' --include='*.mjs' --include='*.cjs' --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=public --exclude-dir='.*' "['\"]web-scumm/" * \
  | xargs -0 sed -i.bak -e "s#'web-scumm/#'@quest-n-click/engine/#g" -e 's#"web-scumm/#"@quest-n-click/engine/#g'
find . -name '*.bak' -not -path './node_modules/*' -delete
```

- `package.json` : la dépendance `"web-scumm": "<spec>"` devient `"@quest-n-click/engine": "<spec>"`, son archive
  `quest-n-click-<version>.tgz` ; les scripts `web-scumm dev`, `web-scumm build`… deviennent `quest-n-click dev`,
  `quest-n-click build`….
- `tsconfig.json` : le chemin `web-scumm/*` devient `@quest-n-click/engine/*`, qui pointe sur
  `./node_modules/@quest-n-click/engine/src/engine/api/*` ; `@engine/*` pointe sur
  `./node_modules/@quest-n-click/engine/src/engine/*` ; `include` nomme
  `node_modules/@quest-n-click/engine/src/env.d.ts`.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`migrate` affiche `✔  the former names renamed @quest-n-click/… in <fichiers> (then: npm install)` (de la 4.3.0 à la
4.5.1, `✔  the former name web-scumm renamed quest-n-click in <fichiers> (then: npm install)`), puis la ligne du
schéma. `npx quest-n-click migrate --check` sort avec 0 ; `grep -rn "web-scumm/" game` ne trouve rien ;
`npm run verify` passe.

<a name="common-errors"></a>

## Erreurs fréquentes

`migrate` dit ce qu'il vous laisse, chaque point sur une ligne `✖`, et `--check` ne déclare jamais un tel projet
propre :

| Ce qu'il dit | Que faire |
|---|---|
| `package.json depends on web-scumm: npm uninstall web-scumm && npm install @quest-n-click/engine` | Étapes 1 et 2 : le nouveau paquet n'était pas installé |
| `package.json has both a web-scumm and a quest-n-click script: the web-scumm one is left as it is` | Supprimez ou renommez vous-même le script `web-scumm` |
| `<chemin>: a symbolic link out of the project, not renamed (rename what it leads to by hand)` | Renommez les fichiers liés là où ils sont |
| `<chemin>: a symbolic link that leads nowhere, not renamed` | Supprimez ou réparez le lien |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Les fichiers sources du projet qui contenaient `web-scumm/…`, `tsconfig.json`, `package.json` (son indentation et sa
marque d'ordre des octets gardées), `package-lock.json` après `npm install`. Rien dans les navigateurs des joueurs.

<a name="recovery"></a>

## Reprise ou retour arrière

`git reset --hard` au commit fait avant, puis `npm install`. Un moteur 4.3.0 ou plus récent ne relit jamais les anciens
imports : revenir en arrière veut donc dire revenir aussi à un moteur 4.2.x.

<a name="hosted-game"></a>

## Un jeu sur un Studio hébergé

Un jeu sur un Studio hébergé qui importe encore `web-scumm/…` ne se charge plus en 4.3.0 (sa santé n'est pas verte et
ses écritures sont refusées) tant que son propriétaire n'a pas lancé la mise à jour du moteur
(`POST /api/engine/migrate`). La mise à jour renomme d'abord ses imports, en une révision à part jugée seulement sur le
fait que le jeu se charge (et, s'il se chargeait avant, sur l'absence de nouvelle erreur du validateur), jamais par le
solveur ; puis la migration du schéma, si elle est due, est jugée comme avant et peut encore être refusée (422, le
renommage gardé). Le renommage ne s'annule pas : faites une sauvegarde avant pour pouvoir revenir.
[Mettre à jour le moteur d'un jeu hébergé](team.upgrade-engine.md).

<a name="references"></a>

## Références

- [Mettre à jour](install.upgrade.md), [Notes de mise à jour : 4.2](install.upgrade-notes-4-2.md) (§38),
  [Notes de mise à jour : 4.3](install.upgrade-notes-4-3.md) (§39)
- [`tools/migrate-name.ts`](../../tools/migrate-name.ts), [`tools/migrate.ts`](../../tools/migrate.ts),
  [`tests/former-name.test.ts`](../../tests/former-name.test.ts)
