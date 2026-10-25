# Domaines et TLS

Le Studio et son jeu ont besoin de deux origines, et ce doivent être deux sous-domaines d’un domaine à vous. Cette
page les donne à l’application studio, donne son propre nom au worker, et dit pourquoi des noms en `*.cleverapps.io`
ne suffisent pas.

<a name="what-you-get"></a>

## Ce que vous obtenez

Trois noms en HTTPS, tous sous votre domaine : `studio.exemple.fr` (le Studio et son API, `publicUrl`) et
`play.exemple.fr` (le jeu, `playUrl`), servis tous deux par l’application studio, et `worker.exemple.fr`
(`worker.url`) servi par l’application worker.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud, à partir de la 4.2.3.
- **Vérifié sur : non vérifié sur une installation réelle pour cette page.** Deux noms sur une même application,
  routés par `Host`, ont été confirmés par le spike S le 17 octobre 2026, et le déploiement de référence du
  19 octobre 2026 a tourné avec trois noms en `*.cleverapps.io`. Personne n’a encore déployé le Studio sur un domaine
  à soi en le consignant : la passe `studio-hosted` (« un domaine TLS ») est `not-run` pour la 4.4.0.

<a name="prerequisites"></a>

## Prérequis

- Les applications d’[Applications et add-ons](clever.apps-addons.md).
- Un domaine à vous, et l’accès à sa zone DNS.

<a name="where-to-run"></a>

## Où lancer les commandes

`clever …` : sur votre machine, dans le dépôt du moteur où les deux applications sont liées sous leur alias. Les
enregistrements DNS : chez votre fournisseur DNS.

<a name="steps"></a>

## Étapes

<!-- step: add-domains -->
1. Donnez à l’application studio ses deux noms, et au worker le sien :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever domain add studio.example.fr --alias my-game-studio
   clever domain add play.example.fr --alias my-game-studio
   clever domain add worker.example.fr --alias my-game-worker
   ```

<!-- step: dns -->
2. Chez votre fournisseur DNS, faites pointer chaque nom vers Clever Cloud avec l’enregistrement que la console de
   Clever affiche sur la page des noms de domaine de l’application (pour un sous-domaine, un CNAME). Clever Cloud le
   sert ensuite en HTTPS avec un certificat qu’il obtient lui-même ; ce projet n’a pas mesuré combien de temps cela
   prend.

<!-- step: config-urls -->
3. Écrivez les mêmes noms dans la configuration : `publicUrl`, `playUrl` et `worker.url`
   ([Configuration](clever.configuration.md)). Le serveur n’en garde que l’origine, et refuse de démarrer quand
   `publicUrl` et `playUrl` sont la même origine (« playUrl must be another origin than publicUrl »).

<a name="why-one-domain"></a>

### Pourquoi deux sous-domaines d’un même domaine

Le jeu tourne dans un cadre du Studio, sur `playUrl`, derrière son propre cookie de session
(`Secure; HttpOnly; SameSite=None; Partitioned`). Avec deux sous-domaines de votre domaine, le Studio et le jeu sont un
seul **site**. Là où cela a été vérifié, le cadre garde son cookie : l’e2e hébergé le montre dans Chromium, Firefox et
WebKit sous macOS. Pas partout : WebKit sous Linux (GNOME Web) ne garde aucun cookie posé par un cadre d’un autre hôte,
même sur un seul site, et un vrai Safari sous macOS et iOS n’a pas encore été vérifié (la passe `studio-hosted`). Un
seul domaine est l’architecture à choisir ; ce n’est pas une preuve sur chaque navigateur.

`cleverapps.io` figure dans la Public Suffix List (une entrée privée, celle de Clever Cloud) : `studio-x.cleverapps.io`
et `play-x.cleverapps.io` sont **deux sites**. Le cookie du jeu ne vit alors dans un cadre d’un autre site que parce
qu’il est partitionné (CHIPS) :

> [!MEASURE id=cross-site-cookie]
> Un cadre de jeu intersite sur deux noms `cleverapps.io` : un cookie `SameSite=None` a été gardé par Chromium et
> Firefox 157 et bloqué par WebKit (moteur de Safari 27.2) ; un cookie `Partitioned` (CHIPS) a été gardé par les trois.
> - date: 2026-10-17
> - version: 4.2.1
> - volume: une page `/iframe-test`, trois authentifications par navigateur
> - conditions: spike S, organisation Clever Cloud de test, région par ; navigateurs pilotés par Playwright ; vrai Safari sous macOS et iOS non mesuré
> - source: [SPIKE-4.2.1-CLEVER.md §7](https://github.com/Quest-n-Click/quest-n-click/blob/e7132fe6cdc4b5c0d9d9b9496aa2fda7965fa405/docs/dev/SPIKE-4.2.1-CLEVER.md)

> [!LIMIT id=never-cleverapps]
> N’utilisez jamais deux noms en `*.cleverapps.io` pour `publicUrl` et `playUrl` dans un déploiement dont on se sert.
> L’e2e hébergé montre Chromium, Firefox et WebKit sous macOS gardant le cookie partitionné ; WebKit sous Linux (GNOME
> Web) n’enregistre aucun cookie posé par un cadre d’un autre hôte, même sur un seul site : les cadres du jeu y restent
> vides. Un vrai Safari, sous macOS et iOS, c’est la passe `studio-hosted`, pas encore faite.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `clever domain --alias my-game-studio` liste les deux noms ; `clever domain --alias my-game-worker` liste celui du
  worker.
- Une fois déployé ([Premier déploiement](clever.first-deployment.md)), `https://studio.exemple.fr/livez` répond
  `{"ok":true}` avec un certificat valide, et `https://play.exemple.fr/` répond 401 (« open the game from the
  Studio ») : l’origine du jeu refuse toute requête sans la session du jeu.
- Dans le Studio, la vue de la pièce et l’onglet Jouer montrent le jeu.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `playUrl must be another origin than publicUrl (plan §6.1)` au démarrage | Le même nom aux deux | Deux noms, `studio.` et `play.` |
| Les cadres du jeu restent vides dans un navigateur | Deux sites (`*.cleverapps.io`), ou WebKit sous Linux | Deux sous-domaines d’un même domaine ; voir [Dépannage](clever.troubleshooting.md#missing-cookie) |
| Une erreur de certificat | L’enregistrement DNS ne pointe pas encore vers Clever Cloud | Vérifiez l’enregistrement ; attendez la propagation |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Les listes de domaines des applications chez Clever Cloud, votre zone DNS, et ensuite les URL de la configuration.

<a name="recovery"></a>

## Reprise ou retour arrière

`clever domain rm <nom> --alias <application>` retire un nom. Changer les noms d’un Studio en service, c’est
[Changer de domaine ou de fournisseur OIDC](clever.change-domain.md) : les URI de redirection du fournisseur changent
avec eux.

<a name="references"></a>

## Références

- Le cookie de l’origine du jeu : [`studio-server/src/server/play.ts`](../../studio-server/src/server/play.ts) ; les
  origines vérifiées : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).
- Le spike S, §7 et §9 : [`docs/dev/SPIKE-4.2.1-CLEVER.md`](../../docs/dev/SPIKE-4.2.1-CLEVER.md).
- [Sécurité](clever.security.md), pour les politiques de cookie.
