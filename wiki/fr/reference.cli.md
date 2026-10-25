# Outils en ligne de commande

Les six commandes qu'installe quest'n'click, avec chaque sous-commande, ses options et les codes de sortie que le code
définit. Chaque commande dit où elle se lance : le dossier d'un projet créé, le dépôt du moteur, la machine du Bridge ou
celle du Studio Server. Dans le dépôt du moteur, les mêmes outils se lancent en scripts npm
([scripts npm](reference.npm-scripts.md)) ; les variables qu'ils lisent sont dans
[Variables d'environnement](reference.environment-variables.md).

<a name="quick-entry"></a>

## Accès rapide, par tâche

- **Commencer un projet de jeu** : [`create-quest-n-click`](#create), ou [`quest-n-click create`](#quest-n-click-create)
  depuis une archive de release ([installer depuis l'archive de release](install.from-archive.md)).
- **Y jouer, le modifier, le vérifier** dans un projet créé : [`dev`](#quest-n-click-dev),
  [`studio`](#quest-n-click-studio), [`verify`](#quest-n-click-verify) (ou [`validate`](#quest-n-click-validate) et
  [`solve`](#quest-n-click-solve) un par un).
- **Le construire et le publier** : [`build`](#quest-n-click-build), [`release`](#quest-n-click-release).
- **Quelque chose cloche dans l'installation** : [`doctor`](#quest-n-click-doctor).
- **Faire tourner un Reality Bridge** : [`quest-n-click-bridge`](#bridge), en commençant par [`init`](#bridge-init) et
  [`serve`](#bridge-serve).
- **Faire tourner un Studio hébergé** : [`quest-n-click-studio-server`](#studio-server), et
  [`invite`](#studio-server-invite) pour le premier owner ([les commandes du serveur](team.server-cli.md)).

<a name="overview"></a>

## Les six commandes

| Commande | Paquet | Ce que c'est |
|---|---|---|
| `quest-n-click` | `quest-n-click` | les outils du moteur pour un projet de jeu : `dev`, `studio`, `verify`, `build`, `release`… |
| `create-quest-n-click` | `create-quest-n-click` | un nouveau projet de jeu (`npm init @quest-n-click my-game`) |
| `quest-n-click-bridge` | `quest-n-click-bridge` | le Reality Bridge de référence seul, pour un jeu construit |
| `quest-n-click-connector` | `quest-n-click-connectors` | un connecteur du monde extérieur (email, Telnet, SSH, Open Badges) |
| `quest-n-click-studio-server` | `quest-n-click-studio-server` | le Studio en ligne pour une équipe, et ses commandes d'exploitation |
| `quest-n-click-studio-worker` | `quest-n-click-studio-server` | l'application de traitement du Studio Server |

Dans un projet créé, les commandes habituelles sont aussi ses scripts npm (`npm run dev`, `npm run verify`…) : voir
[les scripts d'un projet créé](reference.npm-scripts.md#project). Le paquet et son installation :
[install.package](install.package.md).

<a name="connector-configuration"></a>

## Configuration d'un connecteur

Un connecteur lit un fichier JSON (`--config`). Il nomme le Bridge et le fichier du jeton du connecteur (jamais le
jeton sur la ligne de commande), le jeu, ses limites, un port de santé facultatif, et une section au nom du connecteur :

```json
{
  "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "telnet.token" },
  "gameId": "signals",
  "limits": { "maxBytes": 4096, "maxPerMinute": 60, "timeoutMs": 5000 },
  "health": { "port": 9301 },
  "telnet": { "port": 2323 }
}
```

Pour en lancer un, donnez-lui d'abord un jeton du Bridge, puis démarrez-le :

```sh
# dans le dépôt du moteur
npm run bridge -- grant --connector=shed-telnet --source=terminal --signals=terminal.lamp --pair > telnet.token
npm run connector -- telnet --config telnet.json
# avec le paquet @quest-n-click/connectors installé
npx quest-n-click-connector telnet --config telnet.json
```

- Le manifeste Reality du jeu vient du Bridge (`GET /v1/manifest`), ou de `"manifestFile"` (un chemin relatif au
  fichier de configuration). Un manifeste d'un autre `gameId` arrête le connecteur (sortie 1).
- Un jeton émis avec `--pair` peut confirmer les codes d'appairage que donnent les joueurs ; n'accordez à chaque
  connecteur que les signaux qu'il propose.
- Avec `health`, `GET /health` (200 en bonne santé, 503 sinon) et `GET /metrics` répondent sur 127.0.0.1 (une autre
  adresse avec `health.host`) : nombre de propositions, de doublons, de refus par code, d'entrées rejetées, de
  nouvelles tentatives.
- Les secrets viennent de fichiers (`secretFile`, `passwordFile`, `tokenFile`). Un `secret`, un `password` ou un
  `token` en ligne est un raccourci de développement et doit être une chaîne, sinon le connecteur refuse de démarrer.
- SIGTERM ou Ctrl-C l'arrête : plus d'entrée nouvelle, le travail en cours vidé en cinq secondes au plus, sortie 0.

La section propre à chaque connecteur : [bridge.connectors](bridge.connectors.md).

> [!LIMIT id=documented-options]
> Les options listées ci-dessous sont celles que chaque commande lit elle-même. Une commande `quest-n-click` qui lance
> un outil transmet ses autres arguments à cet outil ou à Vite : leurs options sont sur les pages des outils.

<!-- generated:begin -->

<a name="quest-n-click"></a>

## `quest-n-click`

Les outils du moteur pour un projet de jeu qui a installé le paquet (3.9 ; appelé `web-scumm` avant la 4.2.5, un alias pendant la 4.2.x, retiré en 4.3.0). `npx quest-n-click help` liste les commandes. Chaque commande lance un outil du paquet (avec `tsx` et le `tsconfig.json` du projet, sinon celui du paquet), Vite avec le `vite.config.ts` du paquet, ou Python pour les assets ; son code de sortie est celui de l'outil, et une suite d'étapes s'arrête à la première qui échoue, avec le code de cette étape.

- Paquet : `@quest-n-click/engine`.
- Où : dans le dossier d'un projet créé (`npx quest-n-click <commande>`, ou par les scripts npm du projet). Le projet est le dossier de travail (`WEB_SCUMM_PROJECT` le désigne à chaque outil) : il contient `game/`, `public/`, `dist/` et `.cache/` ; le moteur dans `node_modules/@quest-n-click/engine` est lu, jamais écrit.
- Source : [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs), [`tools/speedrun/verify.ts`](../../tools/speedrun/verify.ts).

<a name="quest-n-click-help"></a>

### `quest-n-click help`

Affiche la version du moteur et chaque commande avec sa description d'une ligne. `--help`, l'absence de commande et une commande inconnue affichent la même liste ; une commande inconnue dit d'abord `quest-n-click: no command "<nom>"`.

Utilisation : `quest-n-click help`

| Code | Signifie |
|---|---|
| 0 | `help`, `--help` ou aucune commande. |
| 1 | Une commande inconnue. |

<a name="quest-n-click-create"></a>

### `quest-n-click create`

Un nouveau projet de jeu depuis le modèle : lance `cli/create.mjs`, comme `npm init @quest-n-click` (sa section plus bas).

Utilisation : `quest-n-click create <folder> ["Title"] [--engine=<npm spec>]`

| Option | Signifie |
|---|---|
| `--engine=<npm spec>` | La dépendance au moteur écrite dans le `package.json` du projet (par défaut `^<version de ce moteur>`). |

<a name="quest-n-click-dev"></a>

### `quest-n-click dev`

Le jeu dans le navigateur, rechargé à chaque modification (le serveur de dev de Vite ; les arguments vont à Vite). `?edit=<lieu>` ouvre l'éditeur de placement.

Utilisation : `quest-n-click dev [<Vite options>]`

<a name="quest-n-click-studio"></a>

### `quest-n-click studio`

Le Studio : lieux, dialogues, graphe des énigmes, mixeur. Le serveur de dev de Vite avec `STUDIO=1`, ouvert sur `/__studio/`.

Utilisation : `quest-n-click studio [<Vite options>]`

<a name="quest-n-click-assets"></a>

### `quest-n-click assets`

`art/` et `audio/` vers `public/assets` : écrit les références du jeu dans `.cache/refs.json` (l'outil `refs`), puis lance `tools/assets.py` avec `PYTHON` (par défaut `python3` ; Python 3 avec Pillow).

Utilisation : `quest-n-click assets`

<a name="quest-n-click-doctor"></a>

### `quest-n-click doctor`

Les prérequis (4.1.6) : Node et Chromium requis ; Python, ffmpeg et WebKit facultatifs, chacun signalé s'il manque.

Utilisation : `quest-n-click doctor`

<a name="quest-n-click-mcp"></a>

### `quest-n-click mcp`

Le serveur MCP de ce jeu, sur stdio, pour un assistant (4.1.6). Avec `--server`, les outils d'un Studio hébergé (4.2.3), après `quest-n-click-studio-server login`.

Utilisation : `quest-n-click mcp [--server <url>]`

<a name="quest-n-click-validate"></a>

### `quest-n-click validate`

Le contenu vérifié : références, règles, dialogues, budgets.

Utilisation : `quest-n-click validate [--release] [--commercial] [--report]`

<a name="quest-n-click-solve"></a>

### `quest-n-click solve`

Le solveur : un chemin jusqu'à la fin, les blocages (`--prove`), les chapitres. Sortie 0 résolu, 2 tronqué, 1 sinon.

Utilisation : `quest-n-click solve [--prove] [--from=<checkpoint>] [--chapters] [--json]`

<a name="quest-n-click-bridge"></a>

### `quest-n-click bridge`

Un Reality Bridge de référence pour le jeu (`tools/bridge.ts`) : la même ligne de commande que `quest-n-click-bridge` (plus bas), le manifeste du jeu pris dans son contenu. Dans un projet, le Bridge est le paquet séparé `quest-n-click-bridge` ; sans lui : `the Reality Bridge is a separate package: npm install @quest-n-click/bridge`, sortie 1.

Utilisation : `quest-n-click bridge <init|serve|grant|rotate|revoke|doctor|compact|migrate|tenant|backup|restore> …`

<a name="quest-n-click-solve-reality"></a>

### `quest-n-click solve-reality`

Un jeu avec `reality.signals` prouvé en monde fermé, sous chaque scénario et en mode adverse.

Utilisation : `quest-n-click solve-reality`

<a name="quest-n-click-lint"></a>

### `quest-n-click lint`

Ce sur quoi un joueur trébucherait (le lint du contenu après un passage du solveur).

Utilisation : `quest-n-click lint [--prove]`

<a name="quest-n-click-i18n"></a>

### `quest-n-click i18n`

Les traductions : extraction, état.

Utilisation : `quest-n-click i18n <extract|status>`

<a name="quest-n-click-weight"></a>

### `quest-n-click weight`

Ce qu'un téléphone télécharge et décode, comparé aux `assetBudgets` du jeu.

Utilisation : `quest-n-click weight [--release]`

<a name="quest-n-click-provenance"></a>

### `quest-n-click provenance`

D'où vient chaque asset ; `--lock` après une relecture (une release refuse l'art provisoire du modèle tant que chaque fichier n'est pas remplacé et relu).

Utilisation : `quest-n-click provenance [--lock]`

<a name="quest-n-click-playtests"></a>

### `quest-n-click playtests`

Les sessions partagées par les joueurs, rejouées et résumées.

Utilisation : `quest-n-click playtests [--strict]`

<a name="quest-n-click-speedrun"></a>

### `quest-n-click speedrun`

`speedrun verify` : un speedrun rejoué contre le jeu, son verdict, son code et sa raison (4.1.14). Tout autre mot après `speedrun` affiche la ligne d'utilisation.

Utilisation : `quest-n-click speedrun verify <run.wsrun> [--keys=<file>] [--json]`

| Option | Signifie |
|---|---|
| `--keys=<file>` | Les clés qui vérifient un run signé. |
| `--json` | Le verdict en JSON. |

| Code | Signifie |
|---|---|
| 0 | `valid` ou `valid-unranked`. |
| 1 | Tout autre verdict, `inconclusive` compris. |
| 2 | La ligne d'utilisation : pas `speedrun verify`, ou pas de fichier de run. |

<a name="quest-n-click-voices"></a>

### `quest-n-click voices`

Les répliques enregistrées : vérification, application.

Utilisation : `quest-n-click voices <check|apply> [--release]`

<a name="quest-n-click-ids"></a>

### `quest-n-click ids`

Des ids stables pour les règles, sujets et répliques ; `--write` les écrit dans les sources.

Utilisation : `quest-n-click ids [--write]`

<a name="quest-n-click-prompts"></a>

### `quest-n-click prompts`

Les prompts d'images des planches que le jeu nomme.

Utilisation : `quest-n-click prompts [--missing]`

<a name="quest-n-click-verify"></a>

### `quest-n-click verify`

Dans l'ordre : `validate`, `solve`, `i18n status`, `lint`, `playtests` ; s'arrête au premier qui échoue.

Utilisation : `quest-n-click verify`

<a name="quest-n-click-build"></a>

### `quest-n-click build`

Dans l'ordre : `assets`, `verify`, le build de production dans `dist/` (`vite build`), puis l'outil `dist` : chaque fichier de `dist/` justifié, licences comprises.

Utilisation : `quest-n-click build [<Vite build options>]`

<a name="quest-n-click-release"></a>

### `quest-n-click release`

`assets`, `verify` et le build, puis les portes de release : `validate --release` (verrou de provenance), `weight --release` (budgets), `i18n status` (traductions), `voices check --release`, `playtests --strict`, `solve --prove` (la preuve), `solve-reality`, puis l'outil `dist`.

Utilisation : `quest-n-click release [--commercial]`

| Option | Signifie |
|---|---|
| `--commercial` | Aussi `validate --commercial --errors` : aucune exception, aucun contenu provisoire. |

<a name="quest-n-click-preview"></a>

### `quest-n-click preview`

Sert `dist/` en local (`vite preview --host 127.0.0.1`).

Utilisation : `quest-n-click preview [<Vite preview options>]`

<a name="quest-n-click-migrate"></a>

### `quest-n-click migrate`

Amène les sources du jeu à la version du moteur installé (ids, format du contenu) ; depuis la 4.3.0 il renomme d'abord les imports et commandes `web-scumm/…` de l'ancien nom.

Utilisation : `quest-n-click migrate [--check]`

<a name="create"></a>

## `create-quest-n-click`

Le paquet `@quest-n-click/create` dépend du moteur de la même version et lance son `cli/create.mjs` : comme `quest-n-click create`.

- Paquet : `@quest-n-click/create`.
- Où : n'importe où : le dossier du nouveau projet est créé là où vous la lancez (`npm init @quest-n-click my-game`).
- Source : [`cli/create.mjs`](../../cli/create.mjs).

<a name="create-usage"></a>

### `create-quest-n-click`

Écrit un projet de jeu dans `<dossier>` : `game/` depuis le modèle (un lieu, un héros, de l'art provisoire dessiné à partir de formes ; `__ID__` et `__TITLE__` remplis), `game/provenance.json` (l'art provisoire marqué comme tel, CC0, à remplacer avant une release), les icônes, `og.png` et polices de `public/` du moteur, un `package.json` dont les scripts appellent la commande du moteur, un `tsconfig.json` dont les chemins pointent dans le paquet installé, un `.gitignore` et un `README.md`. L'id est le nom du dossier en minuscules ; le titre, les mots suivants, sinon l'id en capitales. Ensuite : `cd <dossier> && npm install && npm run assets && npm run dev`.

Utilisation : `npx @quest-n-click/create <folder> ["Title"] [--engine=<npm spec>]`

| Option | Signifie |
|---|---|
| `--engine=<npm spec>` | La dépendance au moteur du nouveau projet (par défaut `^<version>`), par exemple le chemin d'une archive. |

| Code | Signifie |
|---|---|
| 0 | Le projet est écrit. |
| 1 | Le dossier existe et n'est pas vide. |
| 2 | Aucun dossier donné (la ligne d'utilisation). |

<a name="bridge"></a>

## `quest-n-click-bridge`

Le Reality Bridge de référence seul (4.1.1 ; ses commandes de store en 4.1.10), pour un jeu déjà construit : `init --manifest=<jeu>/dist/reality-manifest.json`, puis `serve`. Un store se nomme `jsonl` (le journal à côté de `config.json`), `sqlite:<fichier>` (relatif au répertoire du Bridge ; `sqlite` seul vaut `bridge.sqlite`) ou `postgres://…` ; `--store=`, puis `BRIDGE_STORE`, puis `BRIDGE_STORE_FILE` (un fichier qui contient l'URL) remplacent celui de la configuration. Chaque secret créé par `init` est écrit sous `--dir`, jamais affiché. Les options s'écrivent `--clé=valeur` (les commandes du store acceptent aussi `--clé valeur`). Toute autre commande affiche la ligne d'utilisation, sortie 2.

- Paquet : `@quest-n-click/bridge`.
- Où : sur la machine qui fait tourner le Bridge, dans le dossier qui contient son répertoire (`--dir`, par défaut `.cache/bridge`). Dans le dépôt du moteur, `npm run bridge -- <commande>` ; dans un projet, `npx quest-n-click bridge <commande>`, ou le paquet autonome pour un jeu construit.
- Source : [`bridge/src/cli.ts`](../../bridge/src/cli.ts), [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts).

<a name="bridge-init"></a>

### `quest-n-click-bridge init`

Les clés et une configuration : `config.json`, la racine Biscuit (`root.key`, lue par `grant` seulement, jamais par `serve`), la clé de signature des événements, le jeton d'administration et, sauf `--no-demo-webhooks`, des webhooks de démonstration (tout joueur, appairage permis). Sur Internet, préférez `--no-demo-webhooks` et un `grant` par connecteur.

Utilisation : `quest-n-click-bridge init [--dir=.cache/bridge] [--manifest=dist/reality-manifest.json] [--audience=bridge.local] [--origin=<urls>] [--store=sqlite] [--tenant=<id>] [--environment=prod|staging|dev] [--signal-version=2] [--hosts=<names>] [--no-demo-webhooks] [--demo-days=30] [--force]`

| Option | Signifie |
|---|---|
| `--dir=<folder>` | Le répertoire du Bridge (par défaut `.cache/bridge`) ; toutes les commandes le prennent. |
| `--manifest=<file>` | Le `reality-manifest.json` d'un jeu construit (paquet autonome) ; `npm run bridge` le prend dans le jeu. |
| `--audience=<name>` | Qui est le Bridge pour les jetons de ses connecteurs (par défaut `bridge.local`). |
| `--origin=<url,url>` | Les origines des joueurs (CORS), par défaut `http://127.0.0.1:5173,http://localhost:5173`. |
| `--store=<store>` | Le store (par défaut le journal JSON-lines ; `sqlite` vaut `sqlite:bridge.sqlite`). |
| `--tenant=<id>` | Le tenant de cette configuration (par défaut `default`). |
| `--environment=prod\|staging\|dev` | Où il tourne, nommé dans les signaux V2 (par défaut `prod`). |
| `--signal-version=2` | Signe des signaux V2 (par défaut 1 pour un seul tenant). |
| `--hosts=<name,name>` | Les noms `Host` qui mènent à ce tenant sur un serveur multi-tenant. |
| `--no-demo-webhooks` | Pas de webhooks de démonstration. |
| `--demo-days=<n>` | Durée de vie des jetons des webhooks de démonstration (par défaut 30). |
| `--force` | Remplace un `config.json` existant, et toutes ses clés et jetons avec. |

| Code | Signifie |
|---|---|
| 0 | Écrit. |
| 1 | Le jeu ne déclare pas de `reality.signals`, ou `config.json` existe sans `--force`. |

<a name="bridge-serve"></a>

### `quest-n-click-bridge serve`

Le Bridge en HTTP, une ligne de journal JSON par événement. Il prend un bail de service sur le store (refusé tant qu'une restauration ou une migration descendante le tient). SIGTERM ou SIGINT ferme les flux, le serveur et le store (cinq secondes au plus), sortie 0. Plusieurs tenants (`--tenants`) exigent un store SQL ; les classements et le défi du jour aussi.

Utilisation : `quest-n-click-bridge serve [--dir=<folder>] [--port=8787] [--host=127.0.0.1] [--trust-proxy[=<list>]] [--tenants=<dir>,<dir>] [--tenant-header] [--store=<store>]`

| Option | Signifie |
|---|---|
| `--port=<n>` | Par défaut 8787. |
| `--host=<address>` | Par défaut `127.0.0.1`. |
| `--trust-proxy[=<list>]` | Seul : fait confiance à l'adresse transmise par la boucle locale ; avec une liste (`10.0.0.0/8,192.168.1.2`) : à ces proxies. |
| `--tenants=<dir>,<dir>` | Plusieurs tenants, un répertoire chacun, sur un même store SQL. |
| `--tenant-header` | Route selon un en-tête de tenant plutôt que le `Host`. |
| `--store=<store>` | Remplace le store de la configuration. |

| Code | Signifie |
|---|---|
| 0 | Arrêté par SIGTERM ou SIGINT. |
| 1 | Pas de service : un bail ou un verrou tient le store, deux répertoires pour un même tenant, plusieurs tenants sur le journal, des classements sans SQL, ou un fichier de jeton de modération absent, ouvert aux autres ou de moins de 32 caractères. |

<a name="bridge-grant"></a>

### `quest-n-click-bridge grant`

Affiche le jeton d'un connecteur (un Biscuit) sur la sortie standard : redirigez-le vers un fichier (`> telnet.token`). N'accordez à chaque connecteur que les signaux qu'il propose ; `--pair` lui permet de confirmer les codes d'appairage donnés par les joueurs.

Utilisation : `quest-n-click-bridge grant --connector=<id> --source=<s> --signals=a,b [--players=any|p-…,p-…] [--pair] [--days=30] [--tenant=<id>]`

| Option | Signifie |
|---|---|
| `--connector=<id>` | Le nom du connecteur dans le jeton. |
| `--source=<s>` | La source au nom de laquelle il propose. |
| `--signals=a,b` | Les signaux qu'il peut proposer. |
| `--players=any\|p-…,p-…` | Quels joueurs (par défaut `any`). |
| `--pair` | Peut confirmer des codes d'appairage. |
| `--days=<n>` | Durée de vie (par défaut 30). |

<a name="bridge-rotate"></a>

### `quest-n-click-bridge rotate`

Une nouvelle clé de signature des événements ; la précédente reste listée `--keep-days` jours pour les joueurs qui viennent de recevoir un signal. Redémarrez le Bridge pour l'utiliser.

Utilisation : `quest-n-click-bridge rotate [--keep-days=30]`

| Option | Signifie |
|---|---|
| `--keep-days=<n>` | Par défaut 30. |

<a name="bridge-revoke"></a>

### `quest-n-click-bridge revoke`

Demande au Bridge en marche (`POST v1/admin/revoke` avec le jeton d'administration de `--dir`) de révoquer un joueur ou un jeton.

Utilisation : `quest-n-click-bridge revoke --url=<bridge> (--player=<p-…> | --token=<revocation id>)`

| Option | Signifie |
|---|---|
| `--url=<bridge>` | Par défaut `http://127.0.0.1:8787/`. |
| `--player=<p-…>` | Un joueur. |
| `--token=<id>` | L'id de révocation d'un jeton. |

| Code | Signifie |
|---|---|
| 0 | Révoqué. |
| 1 | Le Bridge a refusé (son statut et sa réponse affichés). |

<a name="bridge-doctor"></a>

### `quest-n-click-bridge doctor`

Lit le store sans le modifier : les lignes du journal, une dernière ligne coupée par un arrêt brutal, la corruption ; ou, pour un store SQL, son schéma, les lignes de chaque tenant, les trous dans la séquence d'un joueur, la quarantaine.

Utilisation : `quest-n-click-bridge doctor [--dir=<folder>] [--store=<store>]`

| Code | Signifie |
|---|---|
| 0 | Lisible. |
| 1 | Un journal corrompu (le Bridge ne démarrera pas dessus), ou un trou dans la séquence d'un joueur. |

<a name="bridge-compact"></a>

### `quest-n-click-bridge compact`

Réécrit le journal JSON-lines sans les signaux acquittés et plus vieux que la rétention. Le Bridge doit être arrêté (la commande prend le verrou du journal). Un store SQL garde tous les signaux : sortie 1.

Utilisation : `quest-n-click-bridge compact [--dir=<folder>] [--retention-days=90]`

| Option | Signifie |
|---|---|
| `--retention-days=<n>` | Par défaut 90. |

<a name="bridge-migrate"></a>

### `quest-n-click-bridge migrate`

Avec `--from`/`--to` : le journal déplacé dans SQLite ou Postgres, vérifié, puis la configuration pointée dessus (pas pour une URL Postgres, ni avec `--no-config`). Sans : le schéma SQL monté au dernier, ou à `--schema=N` (`0` défait tout ; descendre prend le store seul).

Utilisation : `quest-n-click-bridge migrate --from=jsonl --to=sqlite[:file]|postgres://… [--tenant=<id>] [--no-config] · migrate [--schema=N] [--lock-timeout=<ms>]`

| Option | Signifie |
|---|---|
| `--lock-timeout=<ms>` | Combien attendre le bail de maintenance (par défaut 30000). |

| Code | Signifie |
|---|---|
| 1 | Rien de migré : la cible contient le tenant, une vérification a échoué, un bail tient le store. |
| 2 | La ligne d'utilisation, ou un `--lock-timeout` invalide. |

<a name="bridge-tenant"></a>

### `quest-n-click-bridge tenant`

Les lignes d'un tenant exportées, ou supprimées (`--yes` obligatoire : toutes les lignes du tenant partent).

Utilisation : `quest-n-click-bridge tenant <export|delete> --tenant=<id> [--out=<file>] [--yes]`

| Code | Signifie |
|---|---|
| 1 | `delete` sans `--yes`. |
| 2 | La ligne d'utilisation. |

<a name="bridge-backup"></a>

### `quest-n-click-bridge backup`

Le store entier en un seul instantané dans un nouveau fichier (sauvegarde schéma 4). Au-delà de `--max-bytes` (256 Mio par défaut) aucun fichier n'est écrit : utilisez `pg_dump` ou les instantanés du fournisseur. `--max-rows` vaut 2 000 000 par défaut.

Utilisation : `quest-n-click-bridge backup --out=<file> [--max-bytes=<n>] [--max-rows=<n>]`

| Code | Signifie |
|---|---|
| 1 | Trop grande, ou la sauvegarde a échoué : aucun fichier écrit. |
| 2 | Pas de `--out`, ou une borne qui n'est pas un entier positif. |

<a name="bridge-restore"></a>

### `quest-n-click-bridge restore`

Une sauvegarde vers un store SQL, sous bail de maintenance (les Bridges arrêtés pour `replace-store`). Le mode est toujours dit (4.1.20) : `merge` garde ce dont le fichier ne parle pas et refuse un conflit sauf `--force` ; `replace-store` fait du store le fichier, après une sauvegarde de sécurité du store vers `--safety-out`. L'empreinte d'une sauvegarde vérifie son intégrité, ce n'est pas une signature.

Utilisation : `quest-n-click-bridge restore --from=<file> --mode=merge [--force] [--max-bytes=<n>] [--lock-timeout=<ms>] · restore --from=<file> --mode=replace-store --yes-replace-store --safety-out=<new file> [--max-bytes=<n>] [--max-rows=<n>] [--lock-timeout=<ms>]`

| Option | Signifie |
|---|---|
| `--mode=merge\|replace-store` | Obligatoire. |
| `--force` | `merge` seulement : les tenants, runs et clés du jour déjà présents sont remplacés. |
| `--yes-replace-store` | `replace-store` seulement, obligatoire. |
| `--safety-out=<new file>` | `replace-store` seulement, obligatoire : où le store est d'abord sauvegardé. |

| Code | Signifie |
|---|---|
| 0 | Restauré. |
| 1 | Rien de restauré : un bail tient le store, un conflit, un store journal, un fichier invalide. |
| 2 | L'utilisation : pas de mode, une option de l'autre mode, confirmation ou fichier de sécurité manquant, borne invalide. |

<a name="connector"></a>

## `quest-n-click-connector`

Un connecteur du monde extérieur, dans son propre processus (4.1.9, expérimental). Installer le paquet sans code natif : `npm install --omit=optional --ignore-scripts @quest-n-click/connectors`. Les options et codes de sortie ci-dessous valent pour chaque connecteur.

- Paquet : `@quest-n-click/connectors`.
- Où : sur une machine à côté du Bridge, dans le dossier de son fichier de configuration (ses chemins sont relatifs à ce fichier). Depuis le dépôt du moteur : `npm run connector -- <id> --config <fichier.json>`.
- Source : [`connectors/src/run.ts`](../../connectors/src/run.ts), [`connectors/src/registry.ts`](../../connectors/src/registry.ts).

| Option | Signifie |
|---|---|
| `--config <file.json>` | Obligatoire : la configuration (voir « Configuration d'un connecteur » plus haut). |
| `--help, -h` | Affiche l'utilisation, sortie 0. |

| Code | Signifie |
|---|---|
| 0 | Arrêté par SIGTERM ou SIGINT (Ctrl-C) : plus d'entrée nouvelle, le travail en cours vidé en cinq secondes au plus. Aussi `--help`. |
| 1 | Pas de jeton, un `bridge.token` en ligne qui n'est pas une chaîne, ou un manifeste d'un autre jeu. |
| 2 | Aucun argument, un connecteur inconnu, ou pas de `--config`. |

<a name="connector-email"></a>

### `quest-n-click-connector email`

Des lettres, par webhook signé ou IMAP.

Utilisation : `quest-n-click-connector email --config <file.json>`

<a name="connector-telnet"></a>

### `quest-n-click-connector telnet`

Un terminal Telnet.

Utilisation : `quest-n-click-connector telnet --config <file.json>`

<a name="connector-ssh"></a>

### `quest-n-click-connector ssh`

Un terminal SSH.

Utilisation : `quest-n-click-connector ssh --config <file.json>`

<a name="connector-open-badge"></a>

### `quest-n-click-connector open-badge`

Open Badges 2 et 3.

Utilisation : `quest-n-click-connector open-badge --config <file.json>`

<a name="studio-server"></a>

## `quest-n-click-studio-server`

Le Studio Server (4.2.1) : un jeu, plusieurs personnes, en ligne. La commande lance `studio-server/src/server/main.ts` du moteur avec tsx, refusée (sortie 2) si le moteur manque ou n'est pas de la même version. Chaque commande sauf `login`, `token`, `deps` et `worker-keys` lit une configuration : `--config <fichier>`, sinon `STUDIO_CONFIG`, sinon `STUDIO_CONFIG_JSON` ; ses secrets viennent de `<NOM>_FILE` ou de l'environnement et le quittent avant toute exécution. Une erreur de configuration affiche `configuration: …`, sortie 1.

- Paquet : `@quest-n-click/studio-server`.
- Où : sur la machine du Studio Server (une application Clever Cloud, ou la vôtre), à côté du moteur de la même version (`npm install quest-n-click-<v>.tgz quest-n-click-studio-server-<v>.tgz`) ; dans le dépôt du moteur, `npm run studio-server -- <commande>`. `login` et `token` se lancent sur votre propre machine.
- Source : [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts), [`studio-server/src/ops/backup-bucket.ts`](../../studio-server/src/ops/backup-bucket.ts).

<a name="studio-server-serve"></a>

### `quest-n-click-studio-server serve`

Le Studio Server : l'API, les sondes, le bail de service. Sans OpenID Connect il ne sert que la boucle locale. SIGTERM ou SIGINT l'arrête, sortie 0.

Utilisation : `quest-n-click-studio-server serve --config <file>`

| Option | Signifie |
|---|---|
| `--config <file>` | La configuration (ou `STUDIO_CONFIG`, `STUDIO_CONFIG_JSON`). |

| Code | Signifie |
|---|---|
| 2 | Pas de commande ni de configuration, une commande inconnue, ou un hôte autre que la boucle locale sans authentification. |

<a name="studio-server-import"></a>

### `quest-n-click-studio-server import`

Un dossier de jeu (avec son `index.ts`) devient le projet de l'instance : copié à côté, renommé en place, adopté par le journal (hébergé : ses fichiers vont dans les blobs et le journal est expédié au bucket).

Utilisation : `quest-n-click-studio-server import <dir> --config <file>`

| Code | Signifie |
|---|---|
| 1 | L'instance a déjà un projet. |
| 2 | Pas de dossier de jeu avec un `index.ts`. |

<a name="studio-server-export"></a>

### `quest-n-click-studio-server export`

Le jeu à la tête, écrit dans un dossier vide ou nouveau, chaque fichier vérifié contre son empreinte, avec `export-manifest.json` (jeu, époque, révision, fichiers).

Utilisation : `quest-n-click-studio-server export <dir> --config <file>`

| Code | Signifie |
|---|---|
| 2 | Pas de dossier vide ou nouveau. |

<a name="studio-server-invite"></a>

### `quest-n-click-studio-server invite`

Affiche un lien d'invitation à usage unique (`<publicUrl>/auth/login?invite=…`) ; le premier propriétaire arrive ainsi.

Utilisation : `quest-n-click-studio-server invite --email <email> --role <owner|dev|reviewer> --config <file>`

| Code | Signifie |
|---|---|
| 2 | Pas d'email, ou un rôle autre que owner, dev, reviewer. |

<a name="studio-server-worker-keys"></a>

### `quest-n-click-studio-server worker-keys`

Les clés des jobs : `studio-worker.key` (0600, le secret `STUDIO_WORKER_KEY` du Studio) et `studio-worker.pub` (le `WORKER_PUBLIC_KEY` du worker), jamais affichées ; un fichier existant n'est pas remplacé.

Utilisation : `quest-n-click-studio-server worker-keys --out <existing folder>`

| Code | Signifie |
|---|---|
| 2 | Pas de `--out`, ou un dossier qui n'existe pas. |

<a name="studio-server-login"></a>

### `quest-n-click-studio-server login`

Le flux d'appareil du CLI : ouvrez l'URL affichée et saisissez le code ; le jeton est gardé dans un fichier de votre dossier de configuration (0600).

Utilisation : `quest-n-click-studio-server login --server <https://studio.example>`

| Code | Signifie |
|---|---|
| 2 | Pas de `--server`. |

<a name="studio-server-token"></a>

### `quest-n-click-studio-server token`

Affiche le jeton d'accès courant (rafraîchi près de son échéance).

Utilisation : `quest-n-click-studio-server token --server <https://studio.example>`

| Code | Signifie |
|---|---|
| 2 | Pas de `--server`. |

<a name="studio-server-deps"></a>

### `quest-n-click-studio-server deps`

Ses propres dépendances (`openid-client`, `jose`, `pg`) : la version et le dossier de chacune, en JSON.

Utilisation : `quest-n-click-studio-server deps`

<a name="studio-server-backup"></a>

### `quest-n-click-studio-server backup`

Les tables du projet, en un instantané, avec les blobs qu'elles nomment (4.2.2), dans un nouveau fichier (0600). `--to-bucket` (4.2.3) : vers `backups/` du bucket (blobs sur S3 seulement), les `--keep` plus récentes gardées.

Utilisation : `quest-n-click-studio-server backup <new file> --config <file> · backup --to-bucket [--keep <n>] --config <file>`

| Option | Signifie |
|---|---|
| `--to-bucket` | Vers le bucket de l'instance. |
| `--keep <n>` | Avec `--to-bucket` : combien de sauvegardes garder (1 ou plus). |

| Code | Signifie |
|---|---|
| 2 | Pas de nouveau fichier, ou un `--keep` invalide. |

<a name="studio-server-restore"></a>

### `quest-n-click-studio-server restore`

Une sauvegarde vers un projet hébergé vide (store PostgreSQL), puis avec `--replay` le journal expédié au bucket depuis ; la restauration est ensuite terminée (le serveur ne sert pas entre-temps).

Utilisation : `quest-n-click-studio-server restore <file> [--replay] --config <file>`

| Option | Signifie |
|---|---|
| `--replay` | Rejoue aussi le journal expédié (blobs sur S3). |

| Code | Signifie |
|---|---|
| 2 | Pas de fichier de sauvegarde. |

<a name="studio-server-replay"></a>

### `quest-n-click-studio-server replay`

Le rejeu d'une restauration repris après son arrêt, puis la restauration terminée.

Utilisation : `quest-n-click-studio-server replay --config <file>`

| Code | Signifie |
|---|---|
| 1 | Aucune restauration en cours. |

<a name="studio-server-gc"></a>

### `quest-n-click-studio-server gc`

Les blobs qu'aucune ligne ne nomme (de plus d'un jour) et l'ancien staging du worker : listés, ou supprimés avec `--delete`.

Utilisation : `quest-n-click-studio-server gc [--delete] --config <file>`

| Option | Signifie |
|---|---|
| `--delete` | Les supprime. |

<a name="studio-worker"></a>

## `quest-n-click-studio-worker`

L'application de traitement du Studio Server (4.2.1, ADR 0028) : elle exécute le code du jeu pour le Studio, un job à la fois par file, chacun dans un processus et un dossier neufs. Elle ne prend aucun argument : `WORKER_PUBLIC_KEY` (ou `WORKER_PUBLIC_KEY_FILE`), `WORKER_INSTANCE` et `PORT` (8080 par défaut, sur 0.0.0.0) la configurent.

- Paquet : `@quest-n-click/studio-server`.
- Où : sur sa propre machine (une application Clever Cloud à part), sans aucun secret de la plateforme ; dans le dépôt du moteur, `npm run studio-worker`.
- Source : [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="studio-worker-usage"></a>

### `quest-n-click-studio-worker`

Sert `POST /jobs`, `GET /livez` et `GET /readyz` (503 dès qu'un job a laissé un processus derrière lui).

Utilisation : `quest-n-click-studio-worker`

| Code | Signifie |
|---|---|
| 0 | Arrêté par SIGTERM. |
| 2 | `WORKER_PUBLIC_KEY` ou `WORKER_INSTANCE` manquant. |
| 75 | Recyclée : un job a laissé un processus ; l'instance sort une fois inactive et la plateforme en démarre une neuve. |

<!-- generated:end -->
