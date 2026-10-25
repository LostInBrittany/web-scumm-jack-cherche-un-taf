# Publier des builds

Sur un Studio d'équipe, un dev publie le jeu à la révision courante comme un build numéroté qui ne change plus jamais,
servi sur l'origine du jeu pour l'équipe (ou pour tout le monde, si l'owner l'a choisi). Cette page dit comment
publier, ce que contient un build, comment vérifier sa signature, et comment un owner vérifie qu'il se reconstruit à
l'identique.

<a name="what-you-get"></a>

## Ce que vous obtenez

Le build `#n`, le jeu du joueur à une révision (sans les outils d'édition), à `/play/<n>/` sur l'origine du jeu, avec
un manifeste signé. `/play/` ouvre toujours le dernier build vert.

<a name="context-and-versions"></a>

## Contexte et versions

Un Studio hébergé (le Studio Server) avec son worker, depuis la 4.2.2. Le code est
[`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts). Pour sortir un jeu hors du Studio,
voir [Construire et publier](create.build-release.md).

<a name="prerequisites"></a>

## Prérequis

- Le rôle `dev` pour publier, `owner` pour reconstruire à neuf (voir [Rôles et actions](team.roles.md#matrix-assets)).
- Les assets du jeu préparés, s'ils ont changé (**Prepare assets**, voir
  [Assets hébergés](team.hosted-assets.md#steps)) : un build sert les images et sons préparés de l'instance.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le Studio, l'onglet **Play**, panneau **Published builds**. Ou par l'API avec le jeton d'un membre.

<a name="steps"></a>

## Étapes

<!-- step: publish -->
1. **Publier.** Cliquez sur **Publish this revision**. Le worker construit le jeu du joueur à partir de la tête ; son
   numéro est réservé d'abord, si bien que deux publications ne partagent jamais le même. La révision est jugée (le
   validateur, puis le solveur, comme le fait la santé) si elle ne l'était pas déjà. Par l'API : `POST /api/builds`.

<!-- step: open -->
2. **L'ouvrir.** Chaque build est listé avec son numéro, sa révision, qui l'a fait, quand, et le verdict de sa révision
   (vert quand elle est jugée valide). Son lien ouvre `/play/<n>/` sur l'origine du jeu.

<!-- step: share -->
3. **Le partager.** `/play/` sur l'origine du jeu redirige toujours vers le dernier build vert : le plus récent dont
   la santé a jugé la révision valide, tel qu'elle la juge maintenant. Avec `"publicBuilds": true` dans la
   configuration (désactivé par défaut ; le choix de l'owner pour chaque instance, D42), `/play/…` et les icônes qu'il
   nomme s'ouvrent à tout le monde, sans session ; tout le reste de l'origine du jeu reste derrière la session.

<!-- step: verify -->
4. **Vérifier sa signature** (facultatif). `GET /api/builds/<n>` donne `{manifest, signed, signature}`. La signature
   est en Ed25519, faite avec la clé de jobs du Studio sur les octets `web-scumm build manifest v1\n` suivis de
   `signed` ; `studio-worker.pub` (la clé publique du worker) la vérifie :

   ```js
   // node verify-build.mjs build.json studio-worker.pub, où build.json est la réponse de GET /api/builds/<n>
   import { createPublicKey, verify } from 'node:crypto';
   import { readFileSync } from 'node:fs';
   const b = JSON.parse(readFileSync(process.argv[2], 'utf8'));
   const key = createPublicKey(readFileSync(process.argv[3]));
   const data = Buffer.from(`web-scumm build manifest v1\n${b.signed}`);
   console.log(verify(null, data, key, Buffer.from(b.signature, 'base64url')) ? 'valid' : 'INVALID');
   ```

<!-- step: rebuild -->
5. **Reconstruire à neuf (owner).** **Rebuild fresh** reconstruit le même snapshot, avec la même version des assets,
   et dit si les fichiers sont les mêmes, octet pour octet (`build.json`, qui dit ce qui l'a construit, est comparé à
   part). Le build publié ne change pas ; la comparaison est gardée avec lui. Par l'API :
   `POST /api/builds/<n>/rebuild`, qui répond `{n, same, differ}`.

<a name="manifest"></a>

## Ce que contient le manifeste d'un build

| Champ | Contenu |
|---|---|
| `n`, `epoch`, `rev` | le numéro du build, l'histoire du projet et la révision |
| `snapshot` | le sha256 du snapshot à partir duquel il a été construit |
| `engine`, `commit`, `lockfile` | ce qui l'a construit, selon le worker : la version de son moteur, son commit, le sha256 de son lockfile (`unknown` quand le worker ne l'a pas dit) |
| `assets` | la version des assets préparés contre laquelle il a été construit |
| `health` | le verdict de la révision à la publication : `ok`, `failed` ou `unknown` |
| `files` | chaque fichier du build et son sha256 |
| `key` | la clé de signature : les 16 premiers chiffres hexadécimaux du sha256 de sa clé publique |

> [!GUARANTEE id=build-never-changes]
> Une reconstruction compare les fichiers octet pour octet avec le build publié, et le build publié ne change jamais.

> [!LIMIT id=build-limits]
> Une reconstruction à neuf vérifie que le build est reproductible sur le worker tel qu'il est maintenant, pas que son
> contenu est sans danger. Le code d'un build ne change jamais, mais ses images et ses sons sont les assets préparés de
> l'instance, servis à côté tels qu'ils sont maintenant, pas tels qu'ils étaient. Un build publié n'a pas de service
> worker : il ne s'installe pas pour jouer hors ligne. Ses sauvegardes ne sont pas encore distinguées par build. Une
> publication ou une reconstruction à la fois (429 pendant qu'une tourne).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le build apparaît dans la liste avec son numéro, et un verdict vert une fois jugé valide ; `/play/<n>/` l'ouvre ;
`/play/` redirige vers le dernier vert. `GET /api/builds` les liste, du plus récent au plus ancien (100 au plus).

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| `a build is being made: try again when it is done` (429) | Une autre publication ou reconstruction tourne | Attendez |
| `/play/` répond `no build is green yet` (404) | Aucune révision d'un build n'a été jugée valide | Corrigez le jeu, publiez de nouveau |
| `build <n> belongs to another history of the game (an import or a restore since)` (409) | Une reconstruction après un import ou une restauration | Publiez un nouveau build |
| `build <n>: the revision's snapshot rebuilt from the journal is not the one published` (409) | Le journal ne redonne pas le même snapshot | Signalez-le : le build reste tel que publié |
| `published builds are a hosted Studio's` (404) | Pas de worker configuré | Les builds demandent un Studio hébergé avec son worker |
| 503 `this instance does not serve writes yet` | Un redéploiement | Réessayez dans quelques secondes |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Une ligne de `studio_builds` (le manifeste et sa signature) et les fichiers du build dans le bucket, par contenu. Aucun
fichier du jeu et aucune révision.

<a name="recovery"></a>

## Revenir en arrière

Un build ne peut être ni supprimé ni remplacé : publiez-en un plus récent. `/play/` suit le dernier build vert, donc un
build dont la révision est jugée en échec plus tard cesse d'être celui qu'ouvre `/play/`.

<a name="references"></a>

## Références

- [Concepts : build publié](team.concepts.md#build), [santé](team.health-metrics.md#game-health).
- [Assets hébergés](team.hosted-assets.md).
- [`tests/studio-builds.test.ts`](../../tests/studio-builds.test.ts).
