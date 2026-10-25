# Autres hébergeurs statiques

`dist/` est un dossier statique : Netlify, Cloudflare Pages, un serveur nginx ou Apache, un bucket de stockage objet
derrière un frontal web, tout hébergeur qui sert des fichiers peut servir le jeu. Cette page dit ce qu'il faut à un tel
hébergeur, qu'il construise le jeu lui-même ou que vous téléversiez un `dist/` construit ailleurs.

<a name="what-you-get"></a>

## Ce que vous obtenez

Le jeu servi par l'hébergeur de votre choix, avec un service worker qui se met à jour proprement et un cache hors ligne
qui marche.

<a name="context-and-versions"></a>

## Contexte et versions

- Un projet créé ou le dépôt du moteur ; la construction est la même ([Construire et publier un jeu](create.build-release.md)).
- À partir de la 4.2.5.
- **Vérifié sur : non vérifié.** Le projet construit et contrôle `dist/` à chaque push, et ne le déploie que sur GitHub
  Pages ; aucun autre hébergeur n'est testé par le projet. Les réglages ci-dessous découlent de ce que produit la
  construction ([`vite.config.ts`](../../vite.config.ts)), pas d'un essai chez chaque hébergeur.

<a name="prerequisites"></a>

## Prérequis

- Le jeu se construit sur votre machine.
- L'adresse chez l'hébergeur : à la racine d'un domaine, ou sous un sous-chemin (ce qui fixe `BASE_PATH`).

<a name="where-to-run"></a>

## Où lancer les commandes

La construction se lance dans le projet créé ou le dépôt du moteur : sur votre machine, dans votre CI, ou dans l'étape
de construction de l'hébergeur. Le téléversement (ou les réglages) passe par l'outil de l'hébergeur.

<a name="steps"></a>

## Étapes

<!-- step: choose-build -->
1. **Choisir où tourne la construction.**

   - Sur votre machine ou dans votre CI, puis téléverser `dist/` : l'hébergeur n'a besoin que de fichiers. Le plus
     simple, et la seule voie quand l'hébergeur n'a pas Python.
   - Dans l'étape de construction de l'hébergeur : donnez-lui les mêmes réglages qu'à n'importe quelle CI.

   | Réglage | Valeur |
   |---|---|
   | Commande de construction (projet créé) | `pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt && npm run build` |
   | Commande de construction (dépôt du moteur, `public/assets` commité) | `npm run build:web` après les vérifications, ou `npm run build` |
   | Dossier de sortie | `dist` |
   | Node | 22.12 ou plus récent |
   | Python | 3, avec pip (projet créé) |
   | ffmpeg | quand le jeu a de l'audio ou de la vidéo à encoder |
   | `GAME` | l'id du jeu (dépôt du moteur) |

<!-- step: base-path -->
2. **Régler `BASE_PATH`** quand le site n'est pas à la racine de son domaine : `BASE_PATH=/games/my-game/` pour
   `https://example.org/games/my-game/`, avec une barre oblique à chaque bout. À la racine d'un domaine, laissez-le
   vide. Voir [Sous-chemin](create.deploy-issues.md#sub-path).

<!-- step: headers -->
3. **Régler les en-têtes de cache**, là où l'hébergeur le permet :

   | Chemin | En-tête | Pourquoi |
   |---|---|---|
   | `index.html`, `sw.js`, `manifest.webmanifest` | `Cache-Control: no-cache` | La page et le worker doivent être revérifiés à chaque visite pour qu'une mise à jour soit vue |
   | `assets/*.js`, `assets/*.css`, `workbox-*.js` | long, par exemple `max-age=31536000, immutable` | Leur nom porte une empreinte : une nouvelle construction donne de nouveaux noms |
   | `assets/img/`, `assets/audio/`, `assets/video/` | long sans risque | Leurs adresses portent `?v=<empreinte>`, qui change dès qu'un asset change |
   | `data/` (le fichier de la fin scellée) | `no-cache` | Le jeu le demande d'abord au réseau |

   Servez `.webmanifest` en `application/manifest+json`, `.webp` en `image/webp` et `.ogg` en `audio/ogg`.

<!-- step: upload -->
4. **Téléverser tout `dist/` d'un coup**, ou dans cet ordre : tout sauf `index.html` et `sw.js` d'abord, puis ces deux
   fichiers. Une page qui nomme des fichiers pas encore téléversés est une page blanche pour un nouveau visiteur
   ([Déploiement incomplet](create.deploy-issues.md#incomplete-deploy)).

Un serveur nginx, en exemple (non testé par le projet) :

```nginx
# le jeu à la racine de play.example.org, dist/ copié dans /srv/my-game
server {
  server_name play.example.org;
  root /srv/my-game;
  location = /index.html { add_header Cache-Control "no-cache"; }
  location = /sw.js { add_header Cache-Control "no-cache"; }
  location = /manifest.webmanifest { add_header Cache-Control "no-cache"; }
  location /data/ { add_header Cache-Control "no-cache"; }
  location /assets/ { add_header Cache-Control "public, max-age=31536000"; }
}
```

> [!LIMIT id=https-required]
> Un service worker ne s'enregistre qu'en HTTPS (ou sur `localhost`). En HTTP simple, le jeu se joue en ligne mais ne
> s'installe pas et ne se joue pas hors ligne.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Le jeu s'ouvre à son adresse ; les outils de développement du navigateur montrent `sw.js` actif, sous le chemin de
  l'adresse.
- La ligne « Offline » (ou sa traduction) du menu pause finit sur « complete » (le texte par défaut du moteur ; un jeu peut le changer).
- Après un nouveau déploiement, le bandeau « A new version is ready. » (« Une nouvelle version est prête. » dans un jeu
  traduit en français) apparaît à la visite suivante ; « Save and update » (« Sauvegarder et mettre à jour ») la charge.
- Dans le dépôt du moteur : `node scripts/e2e.mjs https://<votre-site>/` joue le jeu déployé jusqu'à la fin.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Une page blanche, 404 sur `/assets/index-….js` | Sous un sous-chemin, construit sans `BASE_PATH` | Étape 2 |
| Les joueurs ne reçoivent jamais la nouvelle version | `sw.js` ou `index.html` gardé longtemps en cache par l'hébergeur ou un CDN | Étape 3 |
| Le jeu ne s'installe pas et ne se joue pas hors ligne | Servi en HTTP simple : le navigateur ne donne pas de service worker | Servir en HTTPS |
| La musique coupe ou ne joue pas | L'hébergeur refuse le fichier, ou le sert avec un mauvais type | Servir `.ogg` en `audio/ogg` |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Seulement chez l'hébergeur : les fichiers de `dist/` et ses réglages. Rien dans le projet.

<a name="recovery"></a>

## Revenir en arrière

Téléversez le `dist/` d'une construction précédente (gardez les constructions publiées, ou reconstruisez le commit).
Les joueurs y passent par le bandeau de mise à jour ; voir [Retour arrière](create.deploy-issues.md#going-back).

<a name="references"></a>

## Références

- [`vite.config.ts`](../../vite.config.ts) : le service worker, son précache et ses caches à l'exécution.
- [`src/engine/dom/assets.ts`](../../src/engine/dom/assets.ts) : les adresses des assets et leur `?v=`.
- [Publier sur GitHub Pages](create.github-pages.md), [Le jeu statique sur Clever Cloud](create.clever-static.md).
