# La ligne de commande du Bridge

Chaque sous-commande du Reality Bridge de référence, avec ses options, ses valeurs par défaut, sa sortie et ses codes
de sortie, lus dans `bridge/src/cli.ts` et `bridge/src/cli-store.ts`. Comment les enchaîner :
[Installer et lancer le Bridge](bridge.install-run.md).

<a name="invocation"></a>
<!-- applies: .. since 4.1.1 -->

## Invocation

### Forme

| Où | Commande |
|---|---|
| Le dépôt du moteur | `npm run bridge -- <sous-commande> [options]` (le jeu courant, ou `GAME=<id>`) |
| Un projet créé | `npx quest-n-click bridge <sous-commande> [options]` (il faut `@quest-n-click/bridge` installé à côté du moteur) |
| Le paquet autonome | `npx quest-n-click-bridge <sous-commande> [options]` |

Une option s’écrit `--nom=valeur` ou `--nom valeur`. Chaque sous-commande prend `--dir=<dossier>`, le dossier du
Bridge qui contient `config.json`, `.cache/bridge` par défaut (relatif au dossier courant).

### Valeurs et défaut

Sous-commandes : `init`, `serve`, `grant`, `rotate`, `revoke`, `doctor`, `compact`, `migrate`, `tenant`, `backup`,
`restore`. Le stockage sur lequel travaille une commande est, le premier trouvé : `--store=`, la variable
`BRIDGE_STORE`, le fichier nommé par `BRIDGE_STORE_FILE`, le `store` de `config.json`, sinon le journal (`jsonl`). Un
stockage s’écrit `jsonl`, `sqlite` (le fichier `bridge.sqlite` à côté de `config.json`), `sqlite:<fichier>` (relatif au
dossier du Bridge) ou `postgres://…`.

### Contraintes

Une autre sous-commande affiche `usage: quest-n-click-bridge <init|serve|grant|rotate|revoke|doctor|compact|migrate|tenant|backup|restore>`
et sort avec le code 2. Hors du dépôt du moteur, sans le paquet : `✖  the Reality Bridge is a separate package: npm
install @quest-n-click/bridge`, code 1.

### Exemple minimal

```sh
# dans le dépôt du moteur
GAME=signals npm run bridge -- doctor
```

### Comportement face à un champ inconnu

Une option qu’aucune sous-commande ne lit est ignorée.

### Depuis

4.1.1 (`init`, `serve`, `grant`, `rotate`, `revoke`) ; `doctor` et `compact` en 4.1.2 ; `migrate`, `tenant`,
`backup`, `restore` en 4.1.10 ; les deux modes de restauration en 4.1.20 ; le nom `quest-n-click-bridge` en 4.2.5.

<a name="init"></a>
<!-- applies: .. since 4.1.1 -->

## `init`

### Forme

`init [--dir=.cache/bridge] [--manifest=<fichier>] [--audience=bridge.local] [--origin=<url>,…] [--no-demo-webhooks]
[--demo-days=30] [--store=sqlite|sqlite:<fichier>] [--tenant=<id>] [--environment=prod|staging|dev] [--hosts=<hôte>,…]
[--signal-version=2] [--force]`

### Valeurs et défaut

Crée les clés et la configuration d’un tenant, sous `--dir`, en mode 600 : `config.json`, `root.key` (la moitié privée
de la racine Biscuit, pour `grant` seulement), `admin-token` (le jeton de l’opérateur, seule copie en clair).

- `--manifest` : le manifeste construit du jeu (`dist/reality-manifest.json`) ; sans lui, le contenu du jeu courant.
- `--audience` : qui est le Bridge dans les jetons de ses connecteurs (`bridge.local`).
- `--origin` : les sites du jeu, pour CORS (`http://127.0.0.1:5173,http://localhost:5173`).
- Un webhook de démonstration par source des signaux du jeu, sauf avec `--no-demo-webhooks`, chacun avec son secret
  et un jeton qui peut envoyer n’importe quel signal de cette source pour n’importe quel joueur et confirmer des
  appairages, pendant `--demo-days` jours.
- `--store` : `sqlite` écrit `sqlite:bridge.sqlite` ; absent, le journal (`journal.jsonl`).
- `--tenant`, `--environment` (`prod` si absent), `--hosts` : pour [plusieurs tenants](bridge.multi-tenant.md).
  `--signal-version=2` : un tenant seul signe des `WorldSignalV2`.

Affiche les chemins écrits et les routes des webhooks, jamais un secret. Code 0.

### Contraintes

- `✖  the game declares no reality.signals: nothing to bridge`, code 1.
- `✖  <dir>/config.json exists (--force replaces it, and every key and token with it)`, code 1.

> [!LIMIT id=bridge-init-store-url]
> `--store` est écrit dans `config.json` tel quel. Ne passez jamais à `init` une URL Postgres avec son mot de passe :
> donnez-la à `serve` et aux autres commandes par `BRIDGE_STORE` ou `BRIDGE_STORE_FILE`, qui ne sont jamais écrits.

### Exemple minimal

```sh
# dans le dépôt du moteur
npm run bridge -- init --store=sqlite --no-demo-webhooks --origin=https://game.example.org
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.1 ; `--store`, `--tenant`, `--environment`, `--hosts`, `--signal-version` en 4.1.10.

<a name="serve"></a>
<!-- applies: .. since 4.1.1 -->

## `serve`

### Forme

`serve [--dir=…] [--tenants=<dossier>,<dossier>] [--store=…] [--port=8787] [--host=127.0.0.1]
[--trust-proxy[=<proxy>,…]] [--tenant-header]`

### Valeurs et défaut

Sert le Bridge en HTTP jusqu’à SIGINT ou SIGTERM, puis termine les flux, ferme le serveur, libère le stockage et ses
verrous (cinq secondes au plus) et sort avec le code 0. Il journalise des lignes JSON sur la sortie standard, la
première `{"event":"bridge.listening","url":…,"game":…,"tenants":…,"store":…,"pid":…}`.

- `--tenants` : un dossier par tenant, tous sur un stockage SQL.
- `--trust-proxy` seul fait confiance à la boucle locale ; avec une liste, à ces adresses ou réseaux IPv4.
- `--tenant-header` : une requête peut nommer son tenant dans `X-Web-Scumm-Tenant`.
- Les variables [`BRIDGE_STORE`](reference.environment-variables.md#bridge-store),
  [`BRIDGE_STORE_FILE`](reference.environment-variables.md#bridge-store-file) et
  [`OTEL_EXPORTER_OTLP_ENDPOINT`](reference.environment-variables.md#otel-exporter-otlp-endpoint).

### Contraintes

Code 1, dit sur la sortie d’erreur, quand : deux dossiers configurent un même tenant ; plusieurs tenants sur le
journal ; une section `runs` ou `daily` sur le journal ; un fichier de jeton de modération absent, ouvert aux autres
ou de moins de 32 caractères ; un bail de maintenance refuse le stockage (`✖  … : not serving`). Il refuse de démarrer
sur un autre manifeste que celui configuré, sur une limite qui n’en est pas une ([`limits`](#limits)), et sur un
journal qu’un autre processus vivant tient.

### Exemple minimal

```sh
# dans le dépôt du moteur
npm run bridge -- serve --port=8787 --host=127.0.0.1 --trust-proxy
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.1 ; `--tenants`, `--tenant-header`, `--trust-proxy=<liste>` en 4.1.10 ; le bail `serving` en 4.1.20.

<a name="grant"></a>
<!-- applies: .. since 4.1.1 -->

## `grant`

### Forme

`grant --connector=<id> --source=<source> --signals=<a>,<b> [--players=any|p-…,p-…] [--pair] [--days=30] [--dir=…]`

### Valeurs et défaut

Fabrique le jeton Biscuit d’un connecteur à partir de `root.key` et l’affiche sur la sortie standard, sur une ligne :
redirigez-la vers un fichier. Le jeton nomme le jeu, la source, les signaux, les joueurs (`any`, n’importe quel joueur
du jeu, par défaut), l’audience du Bridge, le tenant du dossier, et une expiration dans `--days` jours (à la seconde ;
refusé à partir de cette seconde). `--pair` lui permet de confirmer des codes d’appairage. Code 0.

### Contraintes

`root.key` doit être dans le dossier (ou le champ de la configuration de la 4.1.1) : `<dir>/root.key is missing: the
root key signs connector tokens, and nothing else can`. Ne donnez à chaque connecteur que les signaux qu’il propose.
Un connecteur peut atténuer son propre jeton (moins de joueurs, une expiration plus proche) avant de le transmettre ;
il ne peut jamais l’élargir.

### Exemple minimal

```sh
# dans le dépôt du moteur
npm run bridge -- grant --connector=shed-telnet --source=terminal --signals=terminal.lamp --pair > telnet.token
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.1 ; lié à son tenant depuis la 4.1.10.

<a name="rotate"></a>
<!-- applies: .. since 4.1.1 -->

## `rotate`

### Forme

`rotate [--keep-days=30] [--dir=…]`

### Valeurs et défaut

Crée une nouvelle clé de signature des événements, garde l’actuelle dans `previousKeys` pendant `--keep-days` jours,
réécrit `config.json` et affiche `✔  new event key k-…; the previous one trusted until <date> (restart the Bridge)`.
Code 0. Elle prend effet au redémarrage du Bridge. Pourquoi et quand : [Sécurité](bridge.security.md#keys).

### Contraintes

Aucune au-delà d’un `config.json` lisible.

### Exemple minimal

```sh
# dans le dépôt du moteur
npm run bridge -- rotate --keep-days=30
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.1 ; ce qui attend un joueur est re-signé sous la nouvelle clé depuis la 4.1.2.

<a name="revoke"></a>
<!-- applies: .. since 4.1.1 -->

## `revoke`

### Forme

`revoke [--url=http://127.0.0.1:8787/] (--player=<p-…> | --token=<id de révocation>) [--dir=…]`

### Valeurs et défaut

Demande au Bridge en marche de révoquer le lien d’un joueur, ou le jeton d’un connecteur par n’importe lequel de ses
identifiants de révocation (hexadécimaux), avec le jeton de l’opérateur lu dans `<dir>/admin-token`
(`POST /v1/admin/revoke`). Affiche `✔  revoked`, code 0 ; sinon `✖  <statut> <réponse>`, code 1.

### Contraintes

Le Bridge doit tourner et être joignable à `--url`. Avec plusieurs tenants, le nom d’hôte de l’URL choisit le tenant.

### Exemple minimal

```sh
# dans le dépôt du moteur
npm run bridge -- revoke --url=https://bridge.example.org/ --player=p-0123456789abcdef
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.1.

<a name="doctor"></a>
<!-- applies: .. since 4.1.2 -->

## `doctor`

### Forme

`doctor [--dir=…] [--store=…]`

### Valeurs et défaut

Lit le stockage sans le modifier. Sur le journal : une ligne `{"event":"journal","lines":…,"players":…,"signals":…,
"torn":…}`, puis `✔  journal readable`, ou `⚠` quand la dernière ligne a été coupée par un plantage (`serve` la retire
et le dit). Sur un stockage SQL : `{"event":"store","kind":…,"schema":…,"tenants":[{tenant, players, signals, gaps,
quarantined}]}`, une ligne `⚠  quarantined: …` par ligne en quarantaine, puis `✔  sqlite store readable (schema 5)`.

### Contraintes

Code 1 quand le journal contient une ligne corrompue (`✖  <quoi>: the Bridge will not start on it`), ou quand la
séquence d’un joueur a un trou (`✖  a player has a gap in its sequence`).

### Exemple minimal

```sh
# dans le dépôt du moteur
npm run bridge -- doctor
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.2 ; chaque champ d’une ligne du journal vérifié en 4.1.8 ; les stockages SQL en 4.1.10.

<a name="compact"></a>
<!-- applies: .. since 4.1.2 -->

## `compact`

### Forme

`compact [--retention-days=90] [--dir=…]`, le Bridge arrêté.

### Valeurs et défaut

Réécrit le journal sans les appairages échus, les versions antérieures de la ligne d’un joueur, et les signaux
acquittés plus vieux que la rétention. Le dernier signal d’un joueur et tout ce qui n’est pas encore acquitté restent.
Affiche `✔  journal compacted: <avant> → <après> lines (…)`.

### Contraintes

Elle prend le verrou du journal, donc refuse tant qu’un Bridge tourne. Sur un stockage SQL : `✖  compact rewrites the
JSON-lines journal; a SQL store keeps every signal in 4.1.10 (no retention yet)`, code 1.

### Exemple minimal

```sh
# dans le dépôt du moteur, le Bridge arrêté
npm run bridge -- compact --retention-days=90
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.2 ; sous le verrou du journal en 4.1.8.

<a name="migrate"></a>
<!-- applies: .. since 4.1.10 -->

## `migrate`

### Forme

`migrate --from=jsonl --to=sqlite[:<fichier>]|postgres://… [--tenant=<id>] [--no-config]`, ou
`migrate [--schema=N] [--lock-timeout=30000]`.

### Valeurs et défaut

- Depuis le journal, le Bridge arrêté : le lit sous son verrou, écrit chaque joueur, signal, accusé de réception et
  révocation dans la cible comme un seul tenant (`default`, ou `--tenant`), les relit, puis nomme le nouveau stockage
  dans `config.json` (pas pour une URL, ni avec `--no-config`). Le journal est gardé tel quel. Affiche `✔  <n> players
  and <m> signals moved to <stockage> as tenant <id>; the journal is kept as it was`.
- Le schéma SQL : jusqu’au plus récent (`✔  schema 5 (nothing to do)`), ou jusqu’à `--schema=N`, vers le haut ou vers
  le bas (`--schema=0` défait tout). Vers le bas, elle prend le bail de maintenance exclusif ; vers le haut, un bail
  `serving`.

### Contraintes

- `✖  the target already holds the tenant <id>: nothing written`, code 1.
- `✖  the target does not hold what was written: the configuration is left on the journal`, code 1.
- `✖  the JSON-lines journal has no schema: migrate --from=jsonl --to=sqlite moves it`, code 1.
- Un bail refusé : `✖  <qui le tient>; nothing migrated`, code 1. Un mauvais `--lock-timeout` ou un mauvais usage :
  code 2.
- Une base plus récente que le Bridge est refusée. En dessous du schéma 5 il n’y a pas de table des baux : arrêtez tout
  écrivain.

### Exemple minimal

```sh
# dans le dépôt du moteur, le Bridge arrêté
npm run bridge -- migrate --from=jsonl --to=sqlite
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.10 ; les baux en 4.1.20.

<a name="tenant"></a>
<!-- applies: .. since 4.1.10 -->

## `tenant`

### Forme

`tenant export --tenant=<id> [--out=<fichier>]` · `tenant delete --tenant=<id> --yes`

### Valeurs et défaut

`export` écrit toutes les lignes d’un tenant, dans chaque table, en JSON : dans `--out` (mode 600) ou sur la sortie
standard. `delete` les supprime. `--tenant` vaut par défaut le tenant du dossier (`default`).

### Contraintes

`delete` sans `--yes` : `✖  deleting the tenant <id> removes every row it has: add --yes`, code 1. Une autre
sous-sous-commande : l’usage, code 2.

### Exemple minimal

```sh
# dans le dépôt du moteur
npm run bridge -- tenant export --tenant=a --out=tenant-a.json
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.10.

<a name="backup"></a>
<!-- applies: .. since 4.1.10 -->

## `backup`

### Forme

`backup --out=<fichier> [--max-bytes=268435456] [--max-rows=2000000]`

### Valeurs et défaut

Écrit le stockage entier en un seul instantané, schéma 4, dans `--out` (mode 600, un fichier temporaire renommé).
Affiche les comptes, le schéma et le début du SHA-256. Code 0. La procédure, le contenu du fichier et la mémoire qu’il
faut : [Sauvegarde et restauration](bridge.backup-restore.md).

### Contraintes

Sans `--out` : l’usage, code 2. Une borne qui n’est pas un entier positif : code 2. Un stockage au-delà de
`--max-rows`, ou un fichier au-delà de `--max-bytes` : `✖  … : no file written`, code 1.

### Exemple minimal

```sh
# dans le dépôt du moteur
npm run bridge -- backup --out=bridge.json
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.10 ; un seul instantané (schéma 3) en 4.1.19 ; le schéma 4 en 4.1.20.

<a name="restore"></a>
<!-- applies: .. since 4.1.10 -->

## `restore`

### Forme

`restore --from=<fichier> --mode=merge [--force] [--max-bytes=<n>] [--lock-timeout=<ms>]`

`restore --from=<fichier> --mode=replace-store --yes-replace-store --safety-out=<nouveau fichier> [--max-bytes=<n>]
[--max-rows=<n>] [--lock-timeout=<ms>]`

### Valeurs et défaut

Tout ou rien, dans le mode que vous nommez : `merge` garde ce dont le fichier ne parle pas ; `replace-store` fait du
stockage le fichier, après une sauvegarde de sécurité. Le fichier est vérifié en entier avant l’ouverture du stockage,
écrit dans une transaction, comparé avant la validation et audité après. `--lock-timeout` : combien de temps le verrou
consultatif Postgres est essayé (30 000 ms).

### Contraintes

| Code | Quand |
|---|---|
| 0 | Restauré et vérifié |
| 1 | Refusé ou échoué, `nothing restored` (un conflit, un fichier refusé, le journal, un bail tenu, une sauvegarde de sécurité impossible à écrire) |
| 2 | Usage : pas de `--mode`, `--force` avec `replace-store`, `--safety-out` ou `--yes-replace-store` avec `merge`, une confirmation ou un chemin de sécurité manquant, une mauvaise borne |
| 3 | Une différence trouvée après la validation (P0), ou la réponse de la validation perdue |

### Exemple minimal

```sh
# dans le dépôt du moteur, chaque Bridge sur ce stockage arrêté
npm run bridge -- restore --from=bridge.json --mode=merge
```

### Comportement face à un champ inconnu

Ignoré. Un fichier avec un champ inconnu est refusé (schémas stricts).

### Depuis

4.1.10 ; tout ou rien en 4.1.19 ; les modes en 4.1.20.

<a name="limits"></a>
<!-- applies: 4.3.0.. since 4.1.1 -->

## `limits` (dans `config.json`)

### Forme

Un objet d’entiers dans le `config.json` d’un tenant, `"limits": { "perMinutePerConnector": 240 }`. Chaque nom absent
garde sa valeur par défaut.

### Valeurs et défaut

| Limite | Défaut | Minimum |
|---|---|---|
| `bodyBytes` : le corps d’une requête, en octets | 8 192 | 1 |
| `perMinutePerConnector` : signaux qu’un connecteur peut proposer par minute, par instance | 120 | 0 |
| `pendingPerPlayer` : signaux en attente de l’accusé de réception d’un joueur | 1 000 | 0 |
| `pairingMs` : combien de temps attend un code d’appairage | 600 000 (10 min) | 0 |
| `capabilityMs` : la vie d’une capacité sans accusé de réception | 2 592 000 000 (30 jours) | 0 |
| `capabilityMaxMs` : la vie la plus longue d’une capacité, renouvellements compris | 15 552 000 000 (180 jours) | 0 |
| `streamsPerPlayer` : flux d’événements ouverts par joueur | 4 | 0 |
| `streamsPerInstance` : flux d’événements ouverts sur une instance | 10 000 | 0 |
| `streamBufferBytes` : octets qu’un flux peut garder non envoyés | 65 536 | 1 |
| `pendingPairings` : codes en attente de confirmation, tous joueurs confondus | 1 000 | 0 |
| `resignedCache` : signaux re-signés après une rotation, gardés en mémoire | 10 000 | 0 |
| `streamPage` : signaux qu’un flux lit d’un coup dans le stockage | 100 | 1 |

### Contraintes

Depuis la 4.3.0, le Bridge les vérifie avant de démarrer : `limits.<nom> must be an integer of at least <n>, not
<valeur>`, ou `limits.<nom> is no limit of the Bridge (<les noms>)`. Sur un Bridge partagé, la mauvaise limite d’un
tenant arrête tous les tenants : lisez les [Notes de mise à jour 4.3](install.upgrade-notes-4-3.md) avant de mettre à
jour.

### Exemple minimal

```json
"limits": { "perMinutePerConnector": 240, "pendingPerPlayer": 2000 }
```

### Comportement face à un champ inconnu

Refusé (depuis la 4.3.0).

### Depuis

4.1.1 ; vérifiées depuis la 4.3.0.

<a name="deleting-a-player"></a>
<!-- applies: .. since 4.1.9 -->

## Supprimer les données d’un joueur partout

### Forme

Cinq endroits, dans cet ordre :

1. Sur le Bridge : `DELETE /v1/admin/players/<id>` avec le jeton de l’opérateur (le lien, les signaux, les accusés de
   réception). `GET` sur la même route les exporte d’abord.
2. Dans une boîte IMAP : supprimer les messages signalés du joueur, s’il y en a (ceux acceptés sont déjà partis avec
   `keepDays: 0`).
3. Dans la configuration du connecteur SSH : retirer la clé déclarée du joueur, s’il y en a une, et redémarrer le
   connecteur.
4. En mémoire (expéditeurs d’e-mail liés par un code d’appairage, mots de reprise Telnet et SSH) : redémarrer les
   connecteurs les oublie tous.
5. Sur l’appareil : le joueur efface la sauvegarde ou les données du site.

### Valeurs et défaut

`DELETE` répond 204 ; un joueur inconnu, 404.

### Contraintes

Le jeton de l’opérateur (`admin-token`). Les fichiers de sauvegarde déjà écrits contiennent encore le joueur : c’est à
vous de les faire expirer.

### Exemple minimal

```sh
# sur la machine du Bridge, dans le dépôt du moteur
curl -s -X DELETE -H "Authorization: Bearer $(cat .cache/bridge/admin-token)" https://bridge.example.org/v1/admin/players/p-0123456789abcdef
```

### Comportement face à un champ inconnu

La route prend un `p-` et 16 chiffres hexadécimaux ; tout le reste est une 404.

### Depuis

La route du Bridge en 4.1.1 ; la partie des connecteurs en 4.1.9. Ce que garde chaque endroit :
[Vie privée](play.privacy.md).

<a name="related"></a>

## Identifiants liés

- `npm run connector` (`quest-n-click-connector`) : [Vue d’ensemble des connecteurs](bridge.connectors.md#run-one).
- `npm run bridge:load` (trois `serve` sur un stockage, sous charge ; `docs/dev/BENCH-BRIDGE.md`) :
  [Bancs d’essai](contribute.benchmarks.md).
- `npm run ops:qualify` : [Le déploiement de référence](bridge.install-run.md#reference-deployment).
- Les autres CLI du projet : [CLI](reference.cli.md).
