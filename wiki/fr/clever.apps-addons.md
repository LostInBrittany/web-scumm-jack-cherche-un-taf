# Applications et add-ons

La première étape d’un Studio hébergé sur Clever Cloud : les deux applications Node.js, les add-ons PostgreSQL et
Cellar, le bucket, et leurs liens, avec `clever-tools`.

<a name="what-you-get"></a>

## Ce que vous obtenez

Deux applications Node.js, `my-game-studio` et `my-game-worker`, liées toutes deux au dossier de votre dépôt du moteur
sous un alias ; un add-on PostgreSQL et un add-on Cellar avec un bucket, liés à l’application studio seulement ;
l’application studio tenue à une seule instance. Rien n’est encore déployé.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé (le Studio Server) sur Clever Cloud, déployé depuis le dépôt du moteur. À partir de la 4.2.3 (le
  hook de build du worker est arrivé en 4.2.2, la sauvegarde quotidienne en 4.2.3).
- **Vérifié sur : non vérifié sur une installation réelle pour cette page.** Le déploiement de référence du
  19 octobre 2026 a tourné sur des applications et des add-ons de ce genre (deux applications Node.js de taille XS,
  PostgreSQL DEV, Cellar S), mais ils avaient été créés pour le spike S le 17 octobre 2026 puis réutilisés ; personne
  n’a rejoué les commandes de cette page depuis une organisation vide.

<a name="prerequisites"></a>

## Prérequis

- Une organisation Clever Cloud, et `clever-tools` installé et connecté (`clever login`).
- Le dépôt du moteur cloné sur votre machine, à la version que vous allez déployer.
- La [vue d’ensemble](clever.overview.md), pour savoir à quoi sert chaque partie.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans le dossier du dépôt du moteur : `clever link` y écrit `.clever.json`, et `clever deploy`
poussera ensuite le commit de ce dossier. Tenez `.clever.json` hors de Git.

<a name="steps"></a>

## Étapes

<!-- step: create-apps -->
1. Créez les deux applications et les deux add-ons, liez les add-ons à l’application studio seulement, et tenez le
   studio à une instance :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever create --type node my-game-studio
   clever create --type node my-game-worker
   clever addon create postgresql-addon my-game-pg --plan dev      # 5 connexions : juste (le serveur en garde 4) ; plus pour une équipe
   clever addon create cellar-addon my-game-cellar
   clever service link-addon my-game-pg --app my-game-studio
   clever service link-addon my-game-cellar --app my-game-studio
   clever scale --min-instances 1 --max-instances 1 --app my-game-studio
   ```

   **Ne liez jamais les add-ons au worker.** Le worker ne détient ni mot de passe, ni clé, ni accès à la base : il ne
   lit et n’écrit que par les URL présignées qu’un job lui donne (ADR 0028).

<!-- step: create-bucket -->
2. Créez le bucket dans Cellar, avec sa console ou n’importe quel outil S3 (les identifiants de l’add-on Cellar). Son
   nom va dans le `blobs.bucket` de la configuration ([Configuration](clever.configuration.md)).

<!-- step: app-folder -->
3. Les deux applications se construisent depuis la racine du dépôt : laissez `APP_FOLDER` vide. Une application qui a
   porté un autre projet peut encore en avoir un :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever env rm APP_FOLDER --app my-game-studio
   clever env rm APP_FOLDER --app my-game-worker
   ```

<!-- step: link-aliases -->
4. `clever deploy` et `clever ssh` agissent sur une application liée dans le dossier d’où on les lance (clever-tools 4
   n’a pas de `--app` pour `deploy`). Liez les deux une fois, chacune sous un alias :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever link <studio-app-id> --alias my-game-studio
   clever link <worker-app-id> --alias my-game-worker
   ```

<a name="postgresql-sizing"></a>

### Dimensionner PostgreSQL pour le chevauchement d’un redéploiement

Un redéploiement démarre la nouvelle instance pendant que l’ancienne sert encore, plusieurs minutes durant
([Redéploiements](clever.redeploys.md)). Les deux tiennent des connexions pendant ce temps : deux fois le nombre
habituel. Le plan DEV permet 5 connexions et le serveur garde un pool de 4 : un redéploiement le dépasse.

> [!MEASURE id=dev-plan-connections]
> Sur le plan DEV, chaque redéploiement a fait échouer le travail de fond des instances sur « too many connections »
> (`leases-read-failed`, `reconcile-failed`, `ship-failed`), et une écriture servie par l’ancienne instance a reçu un
> 500 (« too many connections for role … ») avant de passer au réessai. Le travail de fond a repris seul.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: trois redéploiements de l’application studio, une sonde qui écrit une note toutes les 3 s
> - conditions: organisation Clever Cloud de test, région par ; application studio XS, une instance ; PostgreSQL plan DEV (5 connexions) ; moteur aux commits c66fbf56 puis dd66b38d sur main avant le tag 4.2.3 (package.json disait 4.2.2)
> - source: [QUALIF-4.2.3-REFERENCE.md §5 et §5 bis](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

Pour un déploiement dont on se sert, prenez un plan PostgreSQL avec plus de connexions que DEV. Ce projet n’a pas
mesuré quel plan suffit : comptez environ 4 connexions par instance, deux instances pendant un redéploiement, plus
celles que vous ouvrez vous-même (`psql` ; un exercice de restauration utilise son propre add-on).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `clever applications` (dans le dossier du dépôt) liste les deux alias.
- `clever addon` liste les deux add-ons ; `clever service --app my-game-studio` les montre liés à l’application
  studio, et la même commande pour le worker n’en montre aucun.
- `clever env --app my-game-studio` contient `POSTGRESQL_ADDON_URI` et `CELLAR_ADDON_KEY_ID`. **Cette commande affiche
  les valeurs, y compris celles sur plusieurs lignes :** filtrez-la sur les noms avant de la montrer ou de la coller
  où que ce soit. Ce filtre ne garde que ce qui précède le premier `=` des lignes qui commencent par un nom de variable :

  ```sh
  # sur votre machine, dans le dépôt du moteur
  clever env --app my-game-studio | grep -oE '^[A-Z][A-Z0-9_]*='
  ```

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `clever deploy` déploie la mauvaise application, ou demande laquelle | Plusieurs applications liées, aucun alias donné | `clever deploy --alias my-game-studio` |
| Le build cherche un `package.json` dans un sous-dossier | Un `APP_FOLDER` resté d’un autre projet | `clever env rm APP_FOLDER` sur cette application |
| Le worker a `POSTGRESQL_ADDON_URI` | Un add-on lié au worker | `clever service unlink-addon <addon-id> --app my-game-worker` |
| « too many connections » dans les journaux pendant un déploiement | Plan PostgreSQL DEV | Un plan plus grand (plus haut) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `.clever.json` dans le dossier du dépôt (les liens et les alias) : tenez-le hors de Git.
- Chez Clever Cloud : deux applications, deux add-ons, un bucket. Ils sont facturés dès leur création.

<a name="recovery"></a>

## Reprise ou retour arrière

Rien ne contient encore de données. Supprimez ce que vous avez créé avec `clever addon delete` et `clever delete`
([Coûts et démontage](clever.costs-teardown.md)).

<a name="references"></a>

## Références

- Les variables que les add-ons injectent : [`POSTGRESQL_ADDON_URI`](reference.environment-variables.md#postgresql-addon-uri),
  [`CELLAR_ADDON_KEY_ID`](reference.environment-variables.md#cellar-addon-key-id),
  [`CELLAR_ADDON_KEY_SECRET`](reference.environment-variables.md#cellar-addon-key-secret),
  [`APP_FOLDER`](reference.environment-variables.md#app-folder).
- Ensuite : [Domaines et TLS](clever.domains-tls.md), puis [Configuration](clever.configuration.md).
- Les mesures : [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md) ; le runtime :
  [`docs/dev/SPIKE-4.2.1-CLEVER.md`](../../docs/dev/SPIKE-4.2.1-CLEVER.md).
