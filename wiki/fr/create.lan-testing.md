# Tester sur un téléphone en réseau local

Un jeu se joue sur un téléphone tenu en paysage. Cette page lance le serveur de développement pour qu'un téléphone
branché sur le même Wi-Fi ouvre le jeu en cours d'écriture, rechargé à chaque modification, et dit ce qui reste
protégé pendant ce temps.

<a name="what-you-get"></a>

## Ce que vous obtenez

Le jeu que vous modifiez, ouvert sur votre téléphone à `http://<adresse de votre machine>:5173/`, rechargé chaque fois
que vous enregistrez un fichier. Le Studio et l'éditeur de placement restent accessibles depuis le téléphone, mais
seulement avec un jeton valable pour la session, que la commande affiche.

<a name="context-and-versions"></a>

## Contexte et versions

- **Dépôt du moteur** : `npm run dev:lan` (et `npm run studio:lan` pour le Studio). La commande existe depuis 3.0.0 ;
  depuis 4.1.2, les routes d'écriture du Studio vérifient aussi le `Host` envoyé par le navigateur (plus bas).
- **Projet créé** (avec `npm init @quest-n-click <dossier>` ou `quest-n-click create <dossier>`) : pas de script
  `dev:lan`. Son `dev` transmet les options supplémentaires à Vite, donc `npm run dev -- --host` sert le jeu sur le
  réseau. Ce mode ne donne pas de jeton : le téléphone joue, mais le Studio et l'éditeur de placement refusent toute
  écriture qui ne vient pas de cette machine (voir [Ce qui reste protégé](#limits)).

<a name="prerequisites"></a>

## Prérequis

- Le jeu tourne sur votre machine : `npm run dev` l'ouvre à `http://localhost:5173/`
  ([La boucle de travail](create.working-loop.md)).
- Le téléphone et la machine sont sur le même réseau, et ce réseau laisse deux appareils se parler (un Wi-Fi invité ou
  un point d'accès public ne le permet souvent pas).
- Le pare-feu de la machine laisse entrer les connexions vers Node sur le port 5173.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans un terminal ouvert dans le dépôt du moteur (ou dans le projet créé, pour sa propre commande).
Rien ne tourne sur le téléphone : il ouvre seulement une URL.

<a name="steps"></a>

## Étapes

<!-- step: start-lan -->
1. Lancez le serveur de développement sur le réseau.

   ```sh
   # dans le dépôt du moteur, sur votre machine
   npm run dev:lan
   ```

   ```sh
   # dans un projet créé, sur votre machine
   npm run dev -- --host
   ```

   `dev:lan` fait d'abord pointer `@game` sur le jeu courant (`GAME=<id>`, sinon le dernier jeu sélectionné, sinon
   `package.json` → `config.game`), puis lance Vite à l'écoute de toutes les interfaces (`--host 0.0.0.0`). Avant les
   lignes de Vite, il affiche un bandeau :

   ```text
   LAN write access is protected by this one-session token:
     <token>
   Studio: http://192.168.1.20:5173/__studio/?token=<token>
   Layout editor: http://192.168.1.20:5173/?edit=<room>&token=<token>
   ```

   L'adresse est la première adresse IPv4 de votre machine sur le réseau. Vite liste ensuite ses propres URL
   `Network:`.

<!-- step: open-on-phone -->
2. Sur le téléphone, ouvrez `http://<cette adresse>:5173/` et passez en paysage.

<!-- step: play-a-rule -->
3. Jouez ce que vous venez d'écrire. Avec la lampe de [Votre premier jeu](create.first-game.md), touchez la lampe avec
   **Utiliser** : la ligne s'affiche, l'accessoire change, et la sauvegarde s'en souvient au rechargement. C'est la
   boucle : écrire une règle, la placer, vérifier, jouer.

<!-- step: studio-on-lan -->
4. Facultatif : pour modifier depuis un autre appareil, ouvrez l'URL **Studio** ou **Layout editor** du bandeau, avec
   son `?token=`. La première requête avec le jeton pose un cookie `HttpOnly`, `SameSite=Strict` : les pages suivantes
   n'ont plus besoin du jeton dans l'URL. Pour lancer le Studio lui-même sur le réseau, utilisez `npm run studio:lan` à
   la place de l'étape 1 (dépôt du moteur) : il ouvre l'URL du Studio avec le jeton.

> [!LIMIT id=dev-server-no-offline]
> Le serveur de développement n'est pas le jeu construit : le téléphone teste les règles, le placement, le texte et le
> toucher, pas l'installation comme application, le hors-ligne ni le cache. Testez-les sur un build servi en HTTPS
> ([Construire et publier un jeu](create.build-release.md), [Sous-chemin, cache et service worker](create.deploy-issues.md)).

<a name="limits"></a>

### Ce qui reste protégé

- Sans `dev:lan`/`studio:lan`, Vite n'écoute que sur `127.0.0.1` (`vite.config.ts`) : aucun autre appareil ne le
  joint.
- En mode réseau local, chaque route du Studio qui écrit un fichier (l'API du Studio, l'enregistrement de l'éditeur de
  placement) demande le jeton : dans l'en-tête `x-web-scumm-token`, dans `?token=` ou dans le cookie. Sans lui :
  `401 Studio token required`. Le jeton change à chaque démarrage, sauf si `WEB_SCUMM_STUDIO_TOKEN` est défini
  ([variables d'environnement](reference.environment-variables.md#web-scumm-studio-token)).
- Dans tous les modes, ces routes ne répondent qu'aux noms de cette machine (`localhost`, `127.0.0.1`, `[::1]`) et, en
  mode réseau local, aux adresses affichées par `dev:lan`. Tout autre `Host` reçoit
  `403 the Studio answers its own names only` : une page qui fait pointer un nom vers votre port ne peut pas écrire.
  Une écriture dont l'`Origin` est un autre site reçoit `403 cross-origin Studio request refused`.
- Dans un projet créé lancé avec `npm run dev -- --host`, aucune adresse du réseau n'est dans cette liste et il n'y a
  pas de jeton : le téléphone joue, et toute écriture faite depuis le téléphone via le Studio ou l'éditeur est refusée
  avec un 403. Modifiez sur la machine elle-même.

> [!GUARANTEE id=lan-writes-need-token]
> En mode réseau local, le Studio répond 401 à une requête sans le jeton, et 403 à une écriture dont l'`Origin` est
> un autre site même avec le jeton. Le test fait tourner la garde sur un serveur HTTP local ; il ne lance pas Vite.

> [!LIMIT id=lan-trusted-network]
> Le jeton protège les écritures, pas la lecture : n'importe qui sur le même réseau peut ouvrir le jeu et y jouer tant
> que le serveur tourne. Utilisez-le sur un réseau de confiance, et arrêtez le serveur (`Ctrl+C`) une fois fini.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le téléphone affiche l'écran titre, puis le jeu en paysage. Enregistrez un fichier de lieu sur la machine : le
téléphone se recharge avec la modification. Dans le Studio ouvert par l'URL du bandeau, un enregistrement passe (pas de
401).

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Le navigateur du téléphone attend, puis dit que le site est inaccessible | Le téléphone est sur un autre réseau, le Wi-Fi isole ses clients, ou le pare-feu bloque le port 5173 | Mettez les deux sur le même Wi-Fi, autorisez Node dans le pare-feu (macOS le demande au premier lancement), ou essayez un autre réseau |
| Ça marche sur la machine (`localhost`) mais pas sur le téléphone | C'est `npm run dev` qui tourne, pas `npm run dev:lan` : Vite n'écoute que sur `127.0.0.1` | Arrêtez-le et lancez `npm run dev:lan` (projet créé : `npm run dev -- --host`) |
| `401 Studio token required` en enregistrant depuis le téléphone | La page du Studio ou de l'éditeur a été ouverte sans le `?token=` du bandeau | Ouvrez l'URL du bandeau ; le jeton change à chaque démarrage du serveur |
| `403 the Studio answers its own names only …` | La page a été ouverte sous un nom qui n'est ni celui de la machine ni l'adresse affichée (un nom `.local`, l'adresse d'une autre interface), ou dans un projet créé lancé avec `--host` | Ouvrez l'adresse exacte du bandeau ; dans un projet créé, modifiez sur la machine |
| `✖  games/<id>/index.ts not found (GAME=<id>)` | `GAME` nomme un jeu qui n'existe pas | Vérifiez `ls games`, ou retirez `GAME` |
| Port 5173 occupé, Vite en prend un autre | Un autre serveur de dev tourne | Arrêtez-le, ou ouvrez le port qu'affiche Vite ; les URL du bandeau disent 5173 quel que soit le choix de Vite |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`dev:lan` n'écrit rien d'autre que le lien `.cache/game` vers le jeu courant. Ce que le téléphone sauvegarde (la
progression) reste dans le stockage de son navigateur. Une écriture faite via le Studio ou l'éditeur modifie les
fichiers du jeu sur la machine, comme sur `localhost`.

<a name="recovery"></a>

## Retour arrière

Arrêtez le serveur avec `Ctrl+C` : le jeton disparaît avec lui, et `npm run dev` se remet à n'écouter que sur
`127.0.0.1`.

<a name="references"></a>

## Références

- [`tools/serve.ts`](../../tools/serve.ts) et [`tools/serve-args.ts`](../../tools/serve-args.ts) : ce que lancent
  `dev:lan` et `studio:lan`, le jeton et le bandeau.
- [`tools/studio/security.ts`](../../tools/studio/security.ts) : le jeton, les noms et l'origine vérifiés à chaque
  écriture.
- [`vite.config.ts`](../../vite.config.ts) : `server.host`, `127.0.0.1` sauf si `WEB_SCUMM_LAN=1`.
- [Votre premier jeu](create.first-game.md), [La boucle de travail](create.working-loop.md),
  [Sécurité locale et réseau local](studio.security.md).
- Ensuite : [Référence du DSL](create.dsl.md) pour chaque champ, [Mécaniques classiques](create.classics.md) pour des
  mécaniques célèbres écrites avec, [Le Studio local](studio.overview.md) pour l'outil,
  [Travailler avec une IA](create.working-with-ai.md) pour un jeu entier de la première idée à la release.
