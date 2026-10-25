# Sous-chemin, cache et service worker, déploiement incomplet, retour arrière

Un jeu qui tourne bien sous `npm run dev` peut encore casser une fois en ligne : servi sous `/<dépôt>/` au lieu de `/`,
figé par un service worker, téléversé à moitié, ou ramené en arrière par-dessus des sauvegardes plus récentes. Cette
page explique comment la construction traite chaque cas, et comment savoir lequel vous avez sous les yeux.

<a name="sub-path"></a>

## Sous-chemin : `BASE_PATH`

Un site à la racine de son domaine (`https://play.example.org/`) n'a besoin de rien. Un site sous un chemin
(`https://<utilisateur>.github.io/<dépôt>/`) doit être construit avec ce chemin :

```sh
# dans le projet créé ou le dépôt du moteur
BASE_PATH=/my-repo/ npm run build
```

`BASE_PATH` (par défaut `/`) devient le `base` de Vite ([`tools/vite/plugins.ts`](../../tools/vite/plugins.ts)). Il est
écrit dans :

- les scripts et les styles de la page (`/<dépôt>/assets/index-<empreinte>.js`) ;
- les liens d'`index.html` vers `manifest.webmanifest` et `og.png` ;
- le manifeste de l'application web : `start_url` et les deux icônes (`<BASE_PATH>icons/icon-192.png`, `icon-512.png`) ;
- le service worker, enregistré à `<BASE_PATH>sw.js`, dont la portée est ce chemin.

Les images, les sons et les vidéos sont adressés en relatif (`assets/img/<id>.webp?v=…`), résolus par rapport à
l'adresse de la page : ils suivent la page où qu'elle soit servie, tant que l'adresse finit par `/`.

Écrivez `BASE_PATH` avec une barre oblique à chaque bout. Le manifeste est construit en mettant des chaînes bout à
bout : `BASE_PATH=/my-repo` donne des icônes à `/my-repoicons/…`.

<a name="cache-and-service-worker"></a>

## Cache et service worker

Le service worker est produit par vite-plugin-pwa (Workbox) à partir de [`vite.config.ts`](../../vite.config.ts).

**Ce qu'il garde, et comment.**

| Quoi | Quand il est mis en cache | Stratégie |
|---|---|---|
| L'application de base : `**/*.{js,css,html,ttf,webmanifest}`, `icons/*.png` | À l'installation (précache) | Depuis le cache ; une nouvelle construction apporte une nouvelle liste |
| Images, `assets/img/` | Premier usage ou préchargement | Cache d'abord, jusqu'à 2 000 fichiers, 90 jours |
| Sons, `assets/audio/` | Premier usage ou préchargement | Cache d'abord, requêtes partielles, jusqu'à 600 fichiers, 90 jours |
| Vidéos, `assets/video/` | Premier usage ou préchargement | Cache d'abord, requêtes partielles, jusqu'à 10 fichiers |
| Polices complètes, `fonts/` | La première fois qu'un caractère en a besoin | Cache d'abord, jusqu'à 10 fichiers |
| `data/` (le fichier de la fin scellée) | À chaque demande | Réseau d'abord, le cache après 4 s sans réponse |

Hors du précache : `assets/img`, `assets/audio`, `assets/video`, `data`, `assets/tools` (le Studio et les outils de
développement), `studio-demo`, `fonts`, et `assets/reality` pour un jeu qui ne déclare pas `reality`.

**Préchargement.** Dès l'écran titre puis après chaque changement de lieu, le moteur télécharge en tâche de fond le lieu
courant, les lieux directement accessibles et leur audio, par lots dimensionnés par `GameDef.assetBudgets`. Puis, une
fois par page, le reste du jeu (`GameDef.offline`, défaut `full`) : chaque image, bruitage, voix, musique et vidéo, lot
par lot pendant que le navigateur est inactif, en pause quand la page est cachée. Rien n'est téléchargé en « économie
de données » ou en 2G ; musiques et vidéos attendent mieux que la 3G. `offline: 'nearby'` garde seulement le
préchargement par lieu.

**Versions.** Chaque adresse d'image ou de son porte `?v=<empreinte>` : une seule empreinte de tous les fichiers de
`public/assets`, si bien que tout changement d'un asset donne une nouvelle adresse à tous les assets et que les
anciennes entrées du cache ne servent plus. Le fichier de la fin scellée est toujours demandé d'abord au réseau.

**Ce que le joueur voit.** Le préchargement finit par un statut (`App.offlineStatus`, `offlineReady`) :

| Statut | Sens |
|---|---|
| `complete` | Chaque fichier du plan est dans le cache |
| `partial` | Avec sa raison : `network` (et les fichiers en échec), `save-data`, `slow`, `quota` (le navigateur annonce moins de 64 Mo libres avant de commencer) |
| `skipped` | Rien n'a été tenté ; `worker` : le service worker n'a pas pris le contrôle de la page à temps, télécharger n'aurait rien mis en cache |
| `off` | `offline: 'nearby'` |

Le menu pause l'affiche sur sa ligne « Offline » (`ui.offlineStatus` ; pas de ligne avec `offline: 'nearby'`) :
« 312/400… » pendant qu'il tourne, puis « complete », ou « 312/400 ⚠ retry » (les textes `ui.offlineComplete` et
`ui.offlineRetry` ; le jeu de démo dit « jeu entier en cache » et « toucher pour réessayer » en français). Un toucher
relance un préchargement partiel ou sauté ; un fichier déjà dans le Cache API n'est jamais redemandé, si bien que le
préchargement reprend d'un rechargement à l'autre sans état propre. Avec `offline: 'nearby'`, un lieu jamais visité ni
préchargé peut encore demander le réseau.

**Mises à jour.** Le worker prend le contrôle de la page dès sa première activation (`clientsClaim`), pour que le
préchargement de la première visite passe par lui. Une nouvelle version ne s'active jamais seule (`skipWaiting: false`) :
quand un nouveau `sw.js` est trouvé, le jeu affiche « A new version is ready. » avec « Save and update » (« Une nouvelle
version est prête. », « Sauvegarder et mettre à jour » dans un jeu traduit), qui sauvegarde la partie, attend que la
sauvegarde soit écrite, puis active le nouveau worker et recharge. Les anciens précaches sont alors supprimés
(`cleanupOutdatedCaches`).

`npm run e2e:pwa` (dépôt du moteur) exige `complete`, puis vérifie hors ligne chaque fichier du plan dans le cache et
rend un lieu jamais visité. Il le prouve sur Chromium ; WebKit ne sait pas naviguer hors ligne sous automatisation et
répond « skipped » (code 3), que seul le `--allow-skip` de la CI accepte.

<a name="docs-denylist"></a>
<!-- applies: 4.5.0.. since 4.5.0 -->

### Le repli de navigation et `/docs/`

Hors ligne, le worker répond à une navigation dans sa portée avec l'`index.html` en cache (`navigateFallback`). À
partir de la 4.5.0, il ne le fait pas pour une adresse qui contient `/docs/` (`navigateFallbackDenylist: [/\/docs\//]`) :
le Pages du projet sert la documentation sous `/<dépôt>/docs/`, à côté du jeu, et un lecteur qui a déjà joué doit
recevoir cette page, pas le jeu.

> [!GUARANTEE id=sw-skips-docs]
> Le service worker du jeu est configuré pour ne jamais répondre par le jeu à une adresse qui contient `/docs/` : le
> motif reconnaît les pages de la documentation sous le chemin de base de Pages et aucune page du jeu. Le test lit la
> configuration et le motif ; il ne lance pas de navigateur.

Pour votre jeu, cela veut dire : ne le servez pas sous un chemin qui contient `/docs/` (par exemple
`https://example.org/docs/my-game/`). Il se joue en ligne, mais hors ligne le repli ne le couvre plus : une navigation
que le précache ne garde pas sous son adresse exacte (une adresse avec des paramètres, par exemple) échoue.

<a name="incomplete-deploy"></a>

## Déploiement incomplet

Un déploiement est incomplet quand l'hébergeur sert le nouvel `index.html` (ou `sw.js`) alors que des fichiers qu'il
nomme manquent : un téléversement arrêté en route, des fichiers copiés dans le mauvais ordre, un CDN qui a la nouvelle
page et les anciens scripts.

- **Un joueur qui a déjà le jeu** le garde : sa page vient du précache du worker. Le nouveau worker ne s'installe que
  si chaque fichier de son précache se télécharge ; d'ici là l'ancienne version continue de tourner, et le navigateur
  réessaie à une visite suivante.
- **Un nouveau visiteur** reçoit la nouvelle page, qui nomme des scripts absents : une page blanche, et des 404 sur
  `<BASE_PATH>assets/index-<empreinte>.js` dans l'onglet réseau du navigateur.
- **Une page gardée par le cache HTTP.** `npm start` (le lanceur sirv du dépôt du moteur) envoie chaque fichier avec
  `max-age=3600` : un visiteur sans le worker peut garder un ancien `index.html` jusqu'à une heure, qui nomme des
  scripts que la nouvelle construction a retirés.

Pour l'éviter : déployez d'un bloc (GitHub Pages et un déploiement Clever Cloud publient une construction entière d'un
coup), ou téléversez `index.html` et `sw.js` en dernier ; servez `index.html` et `sw.js` avec `no-cache`
([Autres hébergeurs statiques](create.other-hosts.md#steps)).

<a name="going-back"></a>

## Revenir à une version précédente

Déployer la construction d'un commit précédent la remet en ligne : pour les joueurs, c'est une nouvelle version comme
une autre.

- Les joueurs qui ont la version récente voient « A new version is ready. » et reviennent en arrière en cliquant
  « Save and update ». D'ici là, ils gardent la version qu'ils ont.
- Leurs sauvegardes restent dans le navigateur (IndexedDB, par adresse de site) : revenir en arrière n'en efface
  aucune.
- Une sauvegarde faite par la version récente ne se charge dans l'ancienne que si l'ancienne sait la lire. Si la
  version récente a augmenté le `saveVersion` du jeu, l'ancienne n'a pas de migration pour elle et refuse cette
  sauvegarde (`save version N cannot be migrated to M`) : « Continuer » échoue pour ces joueurs jusqu'au retour de la
  version récente. Les sauvegardes ne migrent que vers l'avant ([État et sauvegardes](create.state-saves.md)).
- Une sauvegarde faite dans un monde de remix ne se charge que dans ce même monde.

Donc : revenir en arrière est sans risque quand la version récente n'a pas changé `saveVersion`. Sinon, préférez
corriger vers l'avant.

<a name="symptoms"></a>

## Symptômes, causes et corrections

| Symptôme | Cause probable | Diagnostic | Correction |
|---|---|---|---|
| Marche sous `npm run dev`, page blanche sous `/<dépôt>/` | Construit sans `BASE_PATH` | Onglet réseau : 404 sur `/assets/index-….js` (sans `/<dépôt>/`) | Construire avec `BASE_PATH=/<dépôt>/` |
| Icônes ou installation absentes, 404 sur `/<dépôt>icons/…` | `BASE_PATH` sans sa barre finale | Les `icons` de `manifest.webmanifest` | `BASE_PATH=/<dépôt>/` |
| Images absentes sous `/<dépôt>` (sans barre finale) | L'adresse de la page ne finit pas par `/` | Les adresses d'images résolues en `/assets/img/…` | Lier `/<dépôt>/` ; Pages redirige |
| L'ancienne version reste après un déploiement | Le nouveau worker attend le joueur | Outils de développement : un worker « en attente d'activation » | Cliquer « Save and update » ; fermer tous les onglets du jeu |
| Aucun bandeau de mise à jour | `sw.js` gardé en cache par l'hébergeur ou un CDN ; ou le précache du nouveau worker échoue | Onglet réseau sur `sw.js` ; la console pendant l'installation | `no-cache` sur `sw.js` ; compléter le téléversement |
| Page blanche pour les nouveaux visiteurs seulement | Déploiement incomplet | 404 sur les scripts à empreinte | Téléverser de nouveau tout `dist/` |
| Hors ligne, un lieu demande le réseau | Préchargement `partial`, ou `offline: 'nearby'` | Le statut du menu pause | Toucher pour réessayer en ligne ; ou `offline: 'full'` |
| « Continuer » échoue après un retour arrière | La sauvegarde vient d'un `saveVersion` plus récent | L'erreur de la console | Redéployer la version récente |
| Hors ligne, une adresse du jeu sous un chemin `/docs/…` ne se charge pas | La liste d'exclusion, voulue | L'adresse contient `/docs/` | Servir le jeu sous un autre chemin |

<a name="check-fixed"></a>

## Vérifier que c'est corrigé

- Les outils de développement du navigateur (Application → Service workers) montrent un seul `sw.js` actif sous votre
  chemin de base, et rien en attente.
- La ligne « Offline » du menu pause dit « complete » ; réseau coupé, un rechargement se joue et un lieu jamais visité
  s'ouvre.
- Dans le dépôt du moteur : `npm run e2e:pwa` sur votre construction, et `node scripts/e2e.mjs https://<votre-site>/`
  sur le site en ligne.

<a name="neighbours"></a>

## Cas voisins

- Un joueur dont la sauvegarde ne se charge pas pour d'autres raisons (un monde de remix, une sauvegarde abîmée) :
  [Dépannage joueur](play.troubleshooting.md).
- Installer le jeu comme une application, et les limites de Safari hors ligne : [Installer comme une application](play.install-app.md).
- Comment le graphe d'assets et le directeur musical du moteur se servent de ce cache :
  [Comment fonctionne le moteur](engine.how-it-works.md#cache).

<a name="alternatives"></a>

## Alternatives écartées

- **Activer une nouvelle version tout de suite (`skipWaiting`).** Le code changerait sous une partie en cours. Le jeu
  demande, sauvegarde, puis bascule.
- **Mettre au précache toutes les images et tous les sons.** La première visite téléchargerait tout le jeu avant que
  rien ne se joue. L'application de base est au précache ; le reste est préchargé en tâche de fond, et le joueur sait
  quand le jeu entier est là (décision D5, « jeu complet hors ligne après la première visite »).
- **Une empreinte dans le nom de chaque asset.** Les ids du jeu nomment les fichiers (`assets/img/<id>.webp`) ; un seul
  `?v=` sur `public/assets` les garde stables et invalide quand même le cache dès qu'un asset change, au prix de
  retélécharger tous les assets après n'importe quel changement.

<a name="trade-offs"></a>

## Compromis

- Une mise à jour n'atteint un joueur que s'il l'accepte, ou ferme tous les onglets du jeu.
- Tout changement d'asset donne une nouvelle adresse à tous les assets : le préchargement complet suivant retélécharge
  le jeu entier.
- `/docs/` est réservé dans la portée du jeu, pour la documentation qui est à côté.

<a name="decisions"></a>

## Décisions et ADR

- D5 (`docs/dev/DECISIONS.md`) : le jeu entier hors ligne après la première visite, `GameDef.offline`.
- D50 et l'[ADR 0030](../../docs/dev/adr/0030-documentation-from-wiki-sources.md) : la documentation publiée sous
  `/docs/` à côté du jeu sur Pages.
- Sources : [`vite.config.ts`](../../vite.config.ts), [`src/engine/dom/update.ts`](../../src/engine/dom/update.ts),
  [`src/engine/dom/offline.ts`](../../src/engine/dom/offline.ts), [`src/engine/boot.ts`](../../src/engine/boot.ts),
  [`src/engine/core/save.ts`](../../src/engine/core/save.ts), [`scripts/e2e-pwa.mjs`](../../scripts/e2e-pwa.mjs).
