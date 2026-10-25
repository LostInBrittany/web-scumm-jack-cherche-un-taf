# L'essayer en local avec compose.yml

Vous voulez voir le Studio Server fonctionner avant de l'héberger. En dix minutes, sur votre machine, vous allez le
lancer dans son mode le plus simple (sans connexion, avec SQLite et un dossier), importer un jeu, écrire par son API,
regarder le journal, et réexporter le jeu. Ensuite, vous verrez ce qu'apporte `ops/studio/compose.yml` pour essayer le
mode équipe complet.

<a name="what-you-will-build"></a>

## Ce que vous allez faire

Un Studio Server sur `127.0.0.1:8787` qui tient un jeu à la révision 1, puis 2 après votre première écriture, et un
dossier avec ce jeu exporté à sa tête. Chaque étape affiche quelque chose que vous pouvez vérifier.

<a name="what-you-need"></a>

## Ce qu'il vous faut

- Le dépôt du moteur avec ses dépendances installées (`npm ci`), et Node 22.12 ou plus récent (voir
  [Prérequis](install.requirements.md)).
- `curl`. Docker n'est jamais requis ; il ne sert qu'à la partie facultative de la fin.

<a name="steps"></a>

## Étapes

<!-- step: config -->
1. **Écrivez une configuration** sans `oidc` : le serveur est alors le serveur local, sur la boucle locale
   seulement, avec SQLite et un dossier pour les contenus. Enregistrez-la sous `/tmp/studio-try/studio.config.json` :

   ```studio-config
   {
     "publicUrl": "http://127.0.0.1:8787",
     "playUrl": "http://127.0.0.1:8788",
     "game": "template",
     "workDir": "/tmp/studio-try/work",
     "host": "127.0.0.1",
     "port": 8787,
     "store": { "kind": "sqlite", "file": "/tmp/studio-try/work/journal.sqlite" },
     "blobs": { "kind": "fs", "dir": "/tmp/studio-try/work/blobs" }
   }
   ```

   `playUrl` doit être une autre origine que `publicUrl`, même ici. Créez ensuite le dossier :

   ```sh
   # n'importe où
   mkdir -p /tmp/studio-try/work
   ```

<!-- step: import -->
2. **Importez un jeu.**

   ```sh
   # dans le dépôt du moteur
   npm run studio-server -- import games/_template --config /tmp/studio-try/studio.config.json
   ```

   *Vous voyez* `{"event":"imported","game":"template","revision":1}`.

<!-- step: serve -->
3. **Démarrez le serveur** (il reste au premier plan ; prenez un second terminal pour la suite) :

   ```sh
   # dans le dépôt du moteur
   npm run studio-server -- serve --config /tmp/studio-try/studio.config.json
   ```

   *Vous voyez* `{"event":"lease-taken",…}` puis `{"event":"listening","host":"127.0.0.1","port":8787,…}`.

<!-- step: probe -->
4. **Demandez-lui comment il va.**

   ```sh
   # n'importe où sur la machine
   curl http://127.0.0.1:8787/readyz
   curl http://127.0.0.1:8787/api/revision
   ```

   *Vous voyez* `{"ok":true,"writes":"served"}` (cette instance sert les écritures) et
   `{"epoch":"…","revision":1}`.

<!-- step: write -->
5. **Écrivez par l'API**, avec un identifiant d'opération, deux fois :

   ```sh
   # n'importe où sur la machine
   curl -i -X POST -H 'content-type: application/json' -H 'x-studio-op: try-local-0001' \
     -d '{"text":"hello from curl"}' http://127.0.0.1:8787/api/notes
   curl -i -X POST -H 'content-type: application/json' -H 'x-studio-op: try-local-0001' \
     -d '{"text":"hello from curl"}' http://127.0.0.1:8787/api/notes
   ```

   *Vous voyez* la première réponse avec `x-studio-revision: 2` ; la seconde, la même réponse avec
   `x-studio-replayed: 1` : l'écriture n'a été appliquée qu'une fois.

<!-- step: journal -->
6. **Lisez le journal et le diff.**

   ```sh
   # n'importe où sur la machine
   curl "http://127.0.0.1:8787/api/ops?after=1"
   curl http://127.0.0.1:8787/api/diff/1..2
   ```

   *Vous voyez* l'opération 2 qui écrit `notes.json`, et le diff qui nomme les champs de la note ajoutés.

<!-- step: stop -->
7. **Arrêtez le serveur** avec Ctrl+C dans son terminal. *Vous voyez* `{"event":"stopping","signal":"SIGINT"}`.

<!-- step: export -->
8. **Exportez le jeu** à sa tête :

   ```sh
   # dans le dépôt du moteur
   npm run studio-server -- export /tmp/studio-try/exported --config /tmp/studio-try/studio.config.json
   ```

   *Vous voyez* `{"event":"exported","revision":2,"files":…}`, et `/tmp/studio-try/exported/export-manifest.json` avec
   l'empreinte de chaque fichier. Supprimez `/tmp/studio-try` quand vous avez fini.

> [!LIMIT id=no-oidc-mode]
> Sans OIDC, il n'y a ni connexion, ni membre, ni rôle : tout ce qui atteint la boucle locale écrit. C'est pourquoi le
> serveur refuse toute autre adresse que la boucle locale. Il n'y a ni pans, ni baux, ni commentaires, ni aperçus, ni
> builds publiés (ils demandent un Studio d'équipe), et la page du Studio dans le navigateur demande une connexion que
> ce mode n'a pas : utilisez l'API ici, et `npm run studio` pour un Studio local dans le navigateur.

<a name="full-mode"></a>

## Le mode équipe complet avec compose.yml

[`ops/studio/compose.yml`](../../ops/studio/compose.yml) démarre, sur la boucle locale seulement, Postgres
(`127.0.0.1:55432`, utilisateur `studio`), MinIO, un stockage S3 (`127.0.0.1:59000`), et Keycloak (`127.0.0.1:58080`)
avec le realm de test `web-scumm` et un utilisateur de test, `lea@example.org`, mot de passe `lea-local-only`, email
vérifié :

```sh
# dans le dépôt du moteur
docker compose -f ops/studio/compose.yml up -d
```

C'est un point de départ, pas une installation clé en main. Par-dessus, il faut encore :

- une configuration avec `oidc` (émetteur `http://127.0.0.1:58080/realms/web-scumm`, clients `studio` et
  `web-scumm-cli`) et `oidc.allowInsecure: true`, puisque le fournisseur répond en http ; le client `studio` du realm
  attend son retour à `http://localhost:8080/auth/callback`, donc `publicUrl` vaut `http://localhost:8080`, à moins de
  modifier le realm ;
- `store.kind` `postgres` avec `STUDIO_DATABASE_URL`, et `blobs.kind` `s3` sur MinIO, avec un bucket que vous créez et
  `STUDIO_S3_KEY_ID` / `STUDIO_S3_KEY_SECRET` ;
- les secrets `STUDIO_OIDC_CLIENT_SECRET` (celui du realm) et `STUDIO_SESSION_KEY` ;
- un worker (`npm run studio-worker`, avec `WORKER_PUBLIC_KEY` et `WORKER_INSTANCE`), ses clés faites par
  `worker-keys`, et `worker` dans la configuration avec `STUDIO_WORKER_KEY` ;
- la page du Studio construite : `npm run studio-client` ;
- `trustProxy` si le serveur écoute au-delà de la boucle locale.

> [!LIMIT id=compose-not-verified]
> Ce mode local complet n'est pas exercé de bout en bout par les tests du projet : l'e2e hébergé de la CI lance le
> serveur avec un fournisseur de test dans son propre processus. Les navigateurs gardent inégalement les cookies
> `Secure` en http sur la boucle locale (WebKit n'en garde aucun) ; l'e2e sert Firefox et WebKit en https avec un
> certificat fait pour l'occasion. Le déploiement de référence est Clever Cloud : voir
> [Premier déploiement](clever.first-deployment.md).

<a name="what-you-learned"></a>

## Ce que vous avez appris

- Une écriture est une opération avec un identifiant, appliquée une seule fois
  ([Concepts](team.concepts.md#transaction)).
- Chaque changement fait avancer la révision, et le journal le liste ([Concepts](team.concepts.md#revision)).
- `export` redonne le jeu à sa tête ([La ligne de commande du serveur](team.server-cli.md#export)).

<a name="next"></a>

## Pour aller plus loin

- [Ce qui tourne où](team.what-runs-where.md) : les morceaux d'un Studio hébergé.
- [Clever Cloud : vue d'ensemble](clever.overview.md), puis [Premier déploiement](clever.first-deployment.md).
