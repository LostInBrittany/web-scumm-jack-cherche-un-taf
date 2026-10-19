# Spike 4.2.2 : quelle prévisualisation par révision

> **Date** : 18 octobre 2026.
> **Plan** : `docs/dev/PLAN-4.2.2-ATELIER-JOUABLE.md`, §2.1 (PR 1).
> **Question** : (a) un bundle moteur par version plus un paquet de contenu par révision, ou (b) un build complet par
> révision, coalescé. Chaque chiffre ci-dessous est une mesure, ou dit qu'il n'en est pas une ; les §1 et §3 sont
> une analyse et une décision.
> **Code** : aucun ; la commande est donnée au §2.

## 1. Ce que le contenu d'un jeu contient

La voie (a) suppose qu'une révision du jeu se réduit à des **données** : le moteur, construit une fois par version,
démarre un jeu décrit par un paquet de contenu (`patchGame`, `src/studio/demo-patch.ts`, le fait déjà pour les textes,
placements et storyboard de la démo).

- `games/demo/index.ts` exporte des **commandes personnalisées** (`commands`, `sparkle`) : du code, pas des données.
- Le format du contenu permet des mini-jeux propres au jeu (`minigames`) et des extensions de confiance
  (`trustedExtensions`, ADR 0013), qui sont du code.

**Conséquence** : la voie (a) ne sait pas prévisualiser le jeu d'exemple tel qu'il est. Elle demanderait un format de
contenu sans code, ce qui changerait le format (D40 l'interdit en 4.2.x). **Écartée.**

## 2. La voie (b), mesurée

Commande : `GAME=demo BASE_PATH=/preview/1/ npx vite build --outDir <dossier>`, cinq exécutions de suite, la
première après avoir vidé `node_modules/.vite`. Machine du mainteneur (Apple Silicon, 10 cœurs), Node 22.14.0,
Vite 8.3.4, commit `42cf574a`.

| Jeu | Premier build (cache vide) | Builds suivants (4 exécutions) | JavaScript produit | Total écrit |
|---|---|---|---|---|
| `games/demo` (avec commandes) | 2,1 s (2,5 s lors d'une première mesure) | 1,22 à 1,26 s | 852 Ko | 11 Mo |

- Le total se décompose en 3,9 Mo d'images, 3,3 Mo de sons, 2,1 Mo de polices, 852 Ko de JavaScript (dont 200 Ko
  d'outils), 128 Ko de licences, et moins de 100 Ko d'icônes, données, page et service worker.
- Les images, les sons et les polices sont des fichiers publics du jeu, identiques d'une révision à l'autre. **Une fois
  rangés par contenu** (à faire en PR 2), ce qui resterait propre à une révision serait son JavaScript et sa page :
  moins de 1 Mo. C'est une conception, pas une mesure.
- Le disque de l'application Clever est éphémère (spike S §1) : le premier build, cache vide, est sans doute le cas
  courant là-bas.
- `games/reference` : son dossier `art/` est un lien vers `../demo/art`, qu'une copie du seul dossier casse. Non
  mesuré, sans effet sur la décision.
- **Non mesuré** :
  - le temps de bout en bout (snapshot, worker, envoi, service), et donc son p50 et son p95 ;
  - un second jeu avec du code local ;
  - le temps sur l'application de traitement Clever. Spike S §1 a mesuré 1 vCPU et ≈ 1 Go pour la plus petite taille
    d'app Node ; la taille de l'app de traitement n'est pas fixée. La passe `studio-preview` mesure ces trois points.

## 3. Décision et seuil

- **La voie (b)** : un build complet par révision, produit par l'application de traitement depuis le snapshot immuable
  de la révision, **coalescé** (une rafale d'écritures ne construit que la dernière révision), publié par le Studio
  sous des clés qu'il choisit, servi immuable sur `play_url` à `/preview/<rev>/`.
- **Les outils d'édition** (le placement de Rooms) entrent dans ce build avec un drapeau de build propre
  (`VITE_STUDIO_PREVIEW`, à créer en PR 2), sans les correctifs de la démo ni son stockage local.
- **Seuil** : la cible du plan reste **5 s** de l'écriture à la prévisualisation jouable. Mesuré ici : 1,2 à 2,1 s de
  build seul, sans le reste du chemin. Rien ne montre encore que 5 s ne tient pas ; une **limite provisoire, p95 ≤
  10 s**, est choisie sous le go du mainteneur jusqu'à la mesure de la passe `studio-preview`, qui dira si la cible
  tient. Pendant un build, la page sert la dernière prévisualisation prête, étiquetée avec sa révision.
