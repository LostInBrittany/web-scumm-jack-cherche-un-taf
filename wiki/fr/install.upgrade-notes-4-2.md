# Notes de mise à jour : 4.2

Ce que chaque release de la ligne 4.2 a changé, de la 4.1.20 à la 4.2.5, conservé tel quel. Depuis la 4.2.0, le projet
suit le SemVer strict : une 4.2.x ne fait que corriger, une mineure ne fait qu'ajouter. Aucune de ces releases ne
demande de changer un jeu : l'API publique, le format du contenu et l'enveloppe de sauvegarde sont ceux de la 4.2.0
(D40). La plupart des notes visent l'opérateur d'un Studio hébergé (4.2.1 à 4.2.3) et le changement de nom en
quest'n'click (4.2.5, §38).

La mise à jour elle-même est [Mettre à jour](install.upgrade.md). Les numéros de section sont ceux de l'ancien
`docs/fr/UPGRADING.md` : « §38 » retrouve donc sa section. Quand une note cite `STUDIO-SERVER` ou `CONTENT_GUIDE`, le
même contenu se trouve désormais dans les pages Équipe, Clever et Créer de ce wiki.

<a name="from-4-1-20-to-4-2-0"></a>

## 33. De la 4.1.20 à la 4.2.0 « Stable World »

Rien à changer : la 4.2.0 est le code de la 4.1.20 avec la version changée et un correctif du Field Kit. À partir de
la 4.2.0, le SemVer strict : une 4.2.x ne fait que corriger, une mineure 4.x ne fait qu'ajouter. Le moteur s'installe
toujours depuis l'archive de la release (`releases/download/v4.2.0/…`) ; la publication npm arrive dans une 4.2.x
ultérieure. Ce que la 4.2.0 dit stable, limité ou expérimental est dans [Stabilité et support](start.stability.md) (D38).

<a name="from-4-2-0-to-4-2-1"></a>
<!-- applies: 4.2.1.. -->

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
[Ce qui tourne où](team.what-runs-where.md) (expérimental en 4.2.1).

<a name="from-4-2-1-to-4-2-2"></a>
<!-- applies: 4.2.2.. -->

## 35. De la 4.2.1 à la 4.2.2 « Playable Workshop »

Rien à changer dans un jeu : l'API publique, le format du contenu et l'enveloppe de sauvegarde sont ceux de la 4.2.0
(D40). Le moteur s'installe depuis `releases/download/v4.2.2/…`. Pour un Studio hébergé :

- **Vite a quitté le serveur** : l'origine du jeu sert les prévisualisations que construit l'application de
  traitement, une par révision. Celle-ci a besoin du Vite du moteur pour construire (son installation l'inclut).
- **La base migre au démarrage** (migrations 0006 à 0010 : prévisualisations, santé, annulation, builds, ensembles
  préparés).
- **Les outils d'assets sur l'application de traitement** : réglez son `CC_POST_BUILD_HOOK` comme le dit
  [Ce qui tourne où](team.what-runs-where.md) (leurs paquets Python, verrouillés par empreintes) ; sans lui, « Prepare assets » (le
  bouton de l'onglet Play) échoue et montre l'erreur de l'application de traitement. Ce worker se déploie depuis le
  dépôt : installé depuis les archives, il ne peut pas lancer `prepare` en 4.2.2 (la 4.2.3 livre le verrou).
- **Les builds** : `/play/<n>/` demande une session, sauf si `publicBuilds` est activé (désactivé par défaut).
- **La sauvegarde** : le journal part de lui-même dans le bucket ; faites un `studio-server backup` quotidien, gardé
  hors de l'instance (STUDIO-SERVER, « Sauvegarde et restauration »).

<a name="from-4-2-2-to-4-2-3"></a>
<!-- applies: 4.2.3.. -->

## 36. De la 4.2.2 à la 4.2.3 « Coordination »

Rien à changer dans un jeu : l'API publique, le format du contenu et l'enveloppe de sauvegarde sont ceux de la 4.2.0
(D40). Le moteur s'installe depuis `releases/download/v4.2.3/…`. Pour un Studio hébergé :

- **La base migre au démarrage** (migrations 0011 et 0012 : le client d'où vient une écriture, pour la révision lue ;
  les commentaires, gardés par la sauvegarde).
- **Ce redéploiement-là refuse les écritures environ 2 min 30** : une instance 4.2.2 garde le bail de service jusqu'à ce
  que Clever Cloud l'arrête. À partir de la 4.2.3, une instance passe le bail à la nouvelle en 10 s environ
  (STUDIO-SERVER, « Le faire tourner : le déploiement de référence »). La page du Studio réessaie ses écritures entre
  temps ; déployez à un moment calme, et attendez-vous à ce que l'alerte sur `/readyz` se déclenche une fois.
- **Les horloges** : l'application de traitement tolère désormais 30 s d'écart entre son horloge et celle du Studio ;
  au-delà, un job est refusé avec « lives longer than a job may » (gardez les horloges des deux applications
  synchronisées).
- **Une écriture porte la révision que son éditeur a lue** (`x-studio-base`) : la page du Studio l'envoie d'elle-même.
  Un script qui écrit peut l'envoyer pour être refusé (409) plutôt que d'écrire par-dessus une modification qu'il n'a
  pas vue ; sans elle, il n'est pas vérifié ainsi.
- **`POST /api/assets/prepare` répond 202 avec un job**, et non plus le passage préparé : un script interroge
  `GET /api/jobs/<id>` jusqu'à `done`, `failed` ou `cancelled`, et lit le passage dans `result`. La découpe de
  planches et les uploads marchent maintenant sur un Studio hébergé, sous le même bail exclusif.
- **Un worker installé depuis les archives de la release prépare les assets** : son `CC_POST_BUILD_HOOK` installe
  `node_modules/web-scumm/ops/studio/worker-requirements.lock` dans `.python` (STUDIO-SERVER, « Depuis les archives de
  la release ») ; `WORKER_PYTHON_PATH` met les paquets ailleurs. Un worker déployé depuis le dépôt garde son hook.
- **Git (optionnel)** : réglez `git` dans la configuration (`remote`, `branch`, `path`, `committer`, et `knownHosts`
  pour une vérification stricte de l'hôte) et la clé de déploiement dans le secret `STUDIO_GIT_KEY`
  (`STUDIO_GIT_KEY_FILE` en local) ; STUDIO-SERVER, « Le jeu dans Git ». Sans `git`, l'onglet Play n'a pas de panneau
  Git.
- **Le MCP distant** : avec OIDC, le Studio sert de lui-même `/mcp` et `/.well-known/oauth-protected-resource`. Le
  jeton d'un agent doit être un jeton d'accès JWT portant l'`oidc.audience` du Studio (MCP, « Un Studio hébergé ») ;
  `npm run mcp -- --server <url>` prend le jeton du CLI obtenu par `studio-server login`.
- **Les métriques (optionnel)** : réglez `STUDIO_METRICS_TOKEN` (32 caractères au moins, sinon le serveur refuse de
  démarrer) pour `GET /metrics` ; sans lui, `/metrics` est un 404.
- **La sauvegarde quotidienne (optionnel)** : `clevercloud/cron.json` lance `ops/studio/backup-cron.sh` sur chaque
  application déployée depuis le dépôt ; il ne sauvegarde que là où `STUDIO_BACKUP_CRON=1` est posé (l'application
  studio, jamais le worker), en gardant `STUDIO_BACKUP_KEEP` sauvegardes (14 par défaut). Depuis les archives, copiez
  le script comme le dit STUDIO-SERVER (« Le faire tourner : le déploiement de référence »).
- **Un jeu importé d'une 4.1.x** peut monter de version sur le serveur : `POST /api/engine/migrate`, réservé à un
  owner (STUDIO-SERVER, « Monter la version du moteur d'un jeu hébergé »).
- **Si vous donniez à `invite` son rôle en premier** (`invite owner --email …`) : c'est maintenant refusé ; écrivez
  `invite --email … --role owner`.

<a name="from-4-2-3-to-4-2-4"></a>
<!-- applies: 4.2.4.. -->

## 37. De la 4.2.3 à la 4.2.4

Rien à changer : un jeu qui n'utilise aucun des nouveaux champs se construit, se joue et se sauvegarde comme sur la
4.2.3 (les mêmes empreintes, sauvegardes de référence et runs de référence). Le moteur s'installe depuis
`releases/download/v4.2.4/…`. Les nouveaux champs sont optionnels et de présentation seulement (D46 : aucun changement
de schéma, d'enveloppe de sauvegarde ni d'IR) :

- **`input: { exitOnTap: true }`** dans `game.ts` : un simple tap sur une sortie, sans verbe choisi, y marche et la
  franchit à l'arrivée ; le **`onTap: 'go' | 'walk'`** d'une sortie remplace le réglage du jeu dans un sens ou dans
  l'autre (CONTENT_GUIDE, « Un double tap : le verbe que le joueur veut dire »).
- **`actorGap`** sur le jeu (par exemple `0.8`) : sans point `approach` dans le layout, le héros s'arrête à cette part de
  la taille moyenne des deux personnages, fois l'échelle de profondeur, au lieu de 44 unités (CONTENT_GUIDE, le
  layout).
- **`"sheetBackground"`** dans `site.json` : `"transparent"` ou une couleur `#RRGGBB` pour les planches de sprites
  générées (par défaut `#2B2E45`, les mêmes prompts qu'avant) ; PROMPTS, « Choisir le fond des planches ».

**Un correctif à connaître** : un jeu qui écrivait `{ face: 'hero', who: X }` voyait X se tourner vers la droite où
que soit le héros ; X se tourne maintenant vers le héros. Si une scène comptait sur l'ancienne orientation, écrivez
`{ face: 'right', who: X }`.

<a name="from-4-2-4-to-4-2-5"></a>
<!-- applies: 4.2.5.. -->

## 38. De la 4.2.4 à la 4.2.5

**web-scumm devient quest'n'click** (D47). Rien à changer : un jeu fait pour la 4.2.4 s'installe, se construit, se joue
et se sauvegarde comme avant, sous ses anciens noms. Le moteur s'installe depuis `releases/download/v4.2.5/…`, où le
dépôt est maintenant `github.com/Quest-n-Click/quest-n-click` (les anciens liens `github.com/wanoo/web-scumm` sont redirigés,
téléchargements des releases compris). Le jeu d'exemple et la démo du Studio sont
maintenant sur `https://quest-n-click.cleverapps.io/demo/` (depuis la 4.5.2, D52 ; les adresses GitHub Pages qu'ils
avaient avant sont abandonnées) : mettez à jour un favori ou un lien.

**Les nouveaux noms**, à partir de la 4.2.5 :

| Avant | À partir de la 4.2.5 |
|---|---|
| package `web-scumm`, commande `web-scumm` | `quest-n-click`, commande `quest-n-click` |
| imports `web-scumm/content`, `/player`, `/minigames`, `/testing`, `/reality` | `quest-n-click/content`, … |
| `create-web-scumm` | `create-quest-n-click` |
| `web-scumm-bridge` (package et commande) | `quest-n-click-bridge` |
| `web-scumm-connectors`, commande `web-scumm-connector` | `quest-n-click-connectors`, commande `quest-n-click-connector` |
| `web-scumm-studio-server`, `web-scumm-studio-worker` | `quest-n-click-studio-server`, `quest-n-click-studio-worker` |
| fichiers de release `web-scumm-<version>.tgz`, `web-scumm-<tag>-…` | `quest-n-click-<version>.tgz`, `quest-n-click-<tag>-…` |

**Les anciens noms marchent toujours pendant toute la 4.2.x.** Chaque release de la ligne publie aussi
`web-scumm-<version>.tgz`, `create-web-scumm-<version>.tgz`, `web-scumm-bridge-<version>.tgz`,
`web-scumm-connectors-<version>.tgz` et `web-scumm-studio-server-<version>.tgz` : les mêmes fichiers à la même version,
seul le nom du package est l'ancien. Les anciennes commandes tournent toujours, après une ligne d'avertissement
(« web-scumm is now quest-n-click; the old name works until 4.3 »), et `web-scumm/content` comme les autres anciens
imports se résolvent encore. Les alias disparaissent en 4.3.

**Passer aux nouveaux noms, quand vous voulez** (un commit, puis `npm install`, `npm run verify`) :

1. `package.json` : la dépendance `"web-scumm": "<spec>"` devient `"quest-n-click": "<spec>"`, son archive
   `quest-n-click-4.2.5.tgz` ; les scripts `web-scumm dev`, `web-scumm build`… deviennent `quest-n-click dev`,
   `quest-n-click build`….
2. `tsconfig.json` : le chemin `web-scumm/*` devient `quest-n-click/*`, vers
   `./node_modules/quest-n-click/src/engine/api/*` ; `@engine/*` pointe vers `./node_modules/quest-n-click/src/engine/*` ;
   `include` nomme `node_modules/quest-n-click/src/env.d.ts`.
3. Les sources du jeu : `from 'web-scumm/content'` devient `from 'quest-n-click/content'`, et ainsi de suite, par exemple
   `grep -rlE "['\"]web-scumm/" game | xargs sed -i.bak -E "s#(['\"])web-scumm/#\\1quest-n-click/#g"`.
4. Qui héberge le Bridge, les connecteurs ou le Studio Server installe les archives `quest-n-click-…` et appelle les
   nouvelles commandes dans ses unités et ses scripts.

**Les formats gardent leur nom.** Ce sont des identifiants dans des fichiers et des stockages, pas le nom du projet :
les renommer casserait les sauvegardes, les fichiers et les déploiements existants. Une sauvegarde reste une enveloppe
`web-scumm-save`, une session `web-scumm-session`, un run un fichier `.wsrun` au format `web-scumm-speedrun`, un monde
Remix `web-scumm-remix-1` ; un signal reste `web-scumm-world-signal`, un manifeste de réalité
`web-scumm-reality-manifest` ; le navigateur garde ses bases IndexedDB (`web-scumm-saves`, `web-scumm-runs`) et ses
clés de stockage `web-scumm.…`, si bien que les sauvegardes et les runs d'un joueur se retrouvent là où ils étaient ;
les en-têtes `X-Web-Scumm-*` du Bridge, les contextes des signatures, les variables d'environnement `WEB_SCUMM_*` et les
tables du Studio Server ne changent pas. Les releases jusqu'à la v4.2.4 gardent le nom de leurs fichiers et leurs
attestations, qui nomment le dépôt `wanoo/web-scumm` ; de la v4.2.5 à la v4.5.1, les attestations nomment
`wanoo/quest-n-click` (depuis la v4.5.2, `Quest-n-Click/quest-n-click` ; `ship verify` demande celui sous lequel chaque
release a été signée). Les crédits du jeu
d'exemple et du chapitre de référence disent maintenant quest'n'click : leur empreinte de présentation a bougé, leur
run de référence est donc enregistré à nouveau ; l'empreinte d'un jeu ne bouge que si son propre texte change.
