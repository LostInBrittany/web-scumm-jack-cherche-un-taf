# Installer le jeu comme une application

Un jeu quest'n'click est une page web qui s’installe comme une application (une PWA, application web progressive) et
se joue ensuite sans réseau. Cette page s’adresse aux joueurs : téléphones et ordinateurs, navigateur par navigateur.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une icône sur l’écran d’accueil ou parmi vos applications, qui ouvre le jeu en plein écran et en paysage, et une copie
du **jeu entier** dans le cache du navigateur : il se joue hors ligne après la première visite. Vos sauvegardes
restent sur l’appareil.

<a name="context-and-versions"></a>

## Contexte et versions

Tout jeu construit avec quest'n'click et servi en HTTPS (le jeu d’exemple est sur
[quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/)). Ce que dit cette page vaut depuis la 4.1.8,
quand l’installation, la mise à jour et la réinstallation ont été prouvées dans Chromium, WebKit et Firefox en CI ; la
copie hors ligne du jeu entier existe depuis la 3.1. L’auteur d’un jeu peut choisir de ne garder en cache que les
salles proches (`offline: 'nearby'`) : le menu de pause n’a alors pas de ligne hors ligne, et une salle jamais visitée
peut demander le réseau.

<a name="prerequisites"></a>

## Prérequis

- Un navigateur récent : Chrome, Edge ou un autre navigateur Chromium, Safari, ou Firefox.
- Une connexion pour la première visite, assez longue pour que le jeu entier se télécharge (le menu de pause le
  montre).
- Un peu de place : avec moins de 64 Mo libres, le jeu ne lance pas le téléchargement et le dit.

<a name="where-to-run"></a>

## Où le faire

Sur l’appareil où vous jouerez, dans son navigateur. Rien à taper dans un terminal.

<a name="steps"></a>

## Étapes

<!-- step: open-online -->
1. **Ouvrez l’adresse du jeu en ligne** et commencez ou continuez une partie. Depuis l’écran titre et après chaque
   salle, le jeu récupère d’abord la salle courante et ses voisines ; puis, quand rien ne se passe, le reste du jeu,
   lot par lot.

<!-- step: install -->
2. **Installez-le** depuis votre navigateur :
   - **iPhone et iPad (Safari)** : le bouton Partager, puis **Sur l’écran d’accueil**. Ouvrez le jeu une fois depuis
     cette icône, en ligne.
   - **Android (Chrome)** : le menu (⋮), puis **Installer l’application** ou **Ajouter à l’écran d’accueil**.
   - **Ordinateur (Chrome, Edge)** : l’icône d’installation dans la barre d’adresse, ou le menu, puis **Installer**.
   - **Firefox** : Firefox garde la copie hors ligne dans le navigateur comme les autres ; qu’il propose d’installer
     la page comme une application dépend de votre version et de votre système. Le jeu hors ligne marche dans les
     deux cas.

<!-- step: wait-complete -->
3. **Attendez la copie hors ligne.** Ouvrez le menu de pause : la ligne **Hors ligne** compte les fichiers
   (« 312/400… ») et affiche **jeu entier en cache** (dans le jeu d’exemple ; « complete » par défaut en anglais) quand
   chaque fichier du jeu est en cache. Un signe d’alerte (« 312/400 ⚠ ») veut dire qu’il en manque ; touchez la ligne
   pour réessayer. Un fichier déjà en cache n’est jamais téléchargé deux fois : le téléchargement reprend où il s’est
   arrêté, même après un rechargement.

<!-- step: check-offline -->
4. **Vérifiez** : passez en mode avion, fermez complètement le jeu, rouvrez-le. L’écran titre s’affiche,
   **Continuer** reprend votre sauvegarde, et une salle jamais visitée montre ses images et ses sons.

> [!GUARANTEE id=offline-complete-means-cached]
> Quand chaque fichier du plan hors ligne du jeu est en cache, l’état hors ligne est complet, et la ligne du menu de
> pause le dit.

Un fichier en échec, un lot sauté ou un manque de place le laisse partiel, avec la raison.

> [!LIMIT id=safari-not-tried-on-device]
> Personne n’a encore installé un jeu depuis Safari sur un vrai iPhone, joué hors ligne et fait sa mise à jour : la
> passe `safari-ios-offline-update` est ouverte ([#86](https://github.com/Quest-n-Click/quest-n-click/issues/86)) à la 4.4.0.
> La CI ne sait pas naviguer hors ligne dans WebKit : sous Safari, le jeu n’est vérifié que pour l’installation et la
> mise à jour. La règle de Safari qui efface les données d’un site après sept jours d’utilisation sans visite vaut
> pour un onglet Safari, pas pour un jeu ajouté à l’écran d’accueil ([WebKit](https://webkit.org/tracking-prevention/)) ; un iPhone à court de place peut quand même
> les évincer. Exportez les sauvegardes qui comptent.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Le jeu s’ouvre depuis son icône, en plein écran, en paysage.
- La ligne **Hors ligne** du menu de pause affiche le jeu entier en cache.
- En mode avion, l’écran titre, votre sauvegarde et chaque salle sont là.

<a name="common-errors"></a>

## Erreurs fréquentes

| Ce que vous voyez | Pourquoi | Que faire |
|---|---|---|
| La ligne Hors ligne reste à « 0/400 » ou affiche ⚠ tout de suite | Le navigateur demande d’économiser les données (Économiseur de données, Save-Data), ou la connexion est en 2G : rien n’est téléchargé. Sous la 3G, musique et vidéo attendent | Passez en Wi-Fi, puis touchez la ligne pour réessayer |
| ⚠ avec moins de fichiers que le total | Un fichier n’a pas pu être téléchargé | Touchez la ligne pour réessayer ; ce qui est déjà en cache reste |
| ⚠ et rien ne se télécharge, même en Wi-Fi | Moins de 64 Mo libres sur l’appareil | Libérez de la place, puis réessayez |
| ⚠ juste après la première installation | Le service worker du jeu n’a pas pris la main sur la page à temps | Rechargez la page, puis réessayez depuis le menu de pause |
| Pas de ligne Hors ligne dans le menu de pause | Le jeu ne garde que les salles proches (`offline: 'nearby'`) | Jouez en ligne ; une salle visitée reste en cache |

Plus de cas dans [Dépannage pour les joueurs](play.troubleshooting.md#offline-incomplete).

<a name="files-changed"></a>

## Fichiers ou données modifiés

Dans votre navigateur, pour le site du jeu seulement : le squelette de l’application et les fichiers du jeu dans le
cache (Cache Storage), vos sauvegardes dans IndexedDB, vos réglages dans le stockage local. Voir
[Confidentialité](play.privacy.md#device).

<a name="recovery"></a>

## Reprise ou retour arrière

Pour retirer l’application : supprimez son icône (appui long sur un téléphone ; désinstaller depuis le navigateur sur
un ordinateur). Retirer l’icône peut laisser les données du site ; pour les effacer (vos sauvegardes avec), effacez
les données du site dans les réglages du navigateur. Exportez d’abord une sauvegarde si vous voulez la garder
([Sauvegardes](play.saves.md#export-import)).

<a name="references"></a>

## Références

- [Dépannage pour les joueurs](play.troubleshooting.md), [Sauvegardes](play.saves.md),
  [Stabilité et support](start.stability.md).
- Pour les auteurs : [Sous-chemin, cache et service worker](create.deploy-issues.md).
- Le code : [`src/engine/dom/offline.ts`](../../src/engine/dom/offline.ts) (le plan et son état),
  [`src/engine/dom/update.ts`](../../src/engine/dom/update.ts) (le préchargement et la mise à jour).
- La liste que suivent les personnes pour Safari : [`docs/dev/SAFARI-OFFLINE.md`](../../docs/dev/SAFARI-OFFLINE.md).
