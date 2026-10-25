# Fonctionnalités

Ce que fait quest'n'click, à la 4.4.0, rangé selon ce que vous voulez faire, chaque point avec la page qui en dit plus.
Ce que chaque fonction promet, et jusqu’où c’est prouvé : [Stabilité et support](start.stability.md#surfaces). Ce
qu’il ne fait pas : [Ce que quest'n'click ne fait pas](index.not-supported.md).

<a name="playing"></a>

## Pour les joueurs

- **Une interface de point-and-click classique** : des verbes, un sac, une ligne de phrase ; un double tap agit avec le
  verbe que vous voulez dire ; une touche par verbe quand le jeu en donne une ([Commandes](play.controls.md)).
- **Téléphone et ordinateur** : en paysage sur un téléphone, la mise en page classique à la souris ; le jeu entier au
  clavier ([Accessibilité](play.accessibility.md)).
- **S’installe et se joue hors ligne** : une PWA qui met le jeu entier en cache après la première visite et dit quand
  c’est complet ([Installer le jeu comme une application](play.install-app.md)).
- **Sauvegarde automatique et emplacements**, avec export et import en fichier ([Sauvegardes](play.saves.md)).
- **Réglages** : vitesse et taille du texte, animations réduites, police lisible, sous-titres des sons, volumes, langue
  ([Réglages](play.settings.md), [Langues](play.languages.md)).
- **Speedruns** : catégories, horloge de jeu, temps intermédiaires, fantôme, preuve scellée, OBS et LiveSplit
  ([Speedrun pour les joueurs](play.speedrun.md)).

<a name="further"></a>

## Dans un jeu

- **Plusieurs personnages jouables**, et depuis la 4.3.0 le héros choisi à la Nouvelle partie parmi autant qu’on veut,
  avec des portraits, un nom par héros et des répliques qui suivent le héros ([Héros](create.heroes.md)).
- **Une carte du monde**, ses lieux débloqués par l’histoire ; depuis la 4.4.0, une épingle peut porter plusieurs lieux
  ([Carte du monde](create.world-map.md)).
- **Des mini-jeux** au toucher ou au clavier (pick, hide, pipes, runner, stroke, scratch, cables, la roue à code), et
  les vôtres ([Mini-jeux fournis](create.minigames.md)).
- **Des cinématiques et des coups de téléphone**, des scripts et des événements qui font agir le monde sans un tap, des
  personnages qui marchent et patrouillent ([Scripts et événements](create.scripts-events.md),
  [Déplacer les personnages](create.moving-characters.md)).
- **La mise en scène** : salles larges et caméra, animations avec événements d’image, calques, masques, lumières,
  particules, zones de marche et passages ([Mise en scène](create.staging.md), [La scène](create.stage.md)).
- **Une musique en pistes séparées** qui suit l’état du jeu, des bruitages tirés d’une même palette, des voix
  enregistrées par langue et par héros ([Musique en pistes](create.music.md), [Voix](create.voices.md)).
- **Remix** : des mondes générés depuis une graine, chacun validé et résolu avant d’être livré ; un défi du jour et des
  mondes mystère avec un Bridge ([Remix](create.remix.md)).
- **Speedrun** : des runs enregistrés, scellés et vérifiés par un rejeu ; des classements sur le Bridge
  ([Speedrun pour les auteurs](create.speedrun.md)).
- **Reality** : un jeu réagit à un fait du monde (un email reçu, une commande de terminal, un badge) par un signal signé
  venu d’un Bridge, sans que son contenu touche au réseau ([Le Bridge Reality](bridge.what-it-is.md)).

<a name="making"></a>

## Pour les auteurs

- **Le contenu en données**, des objets TypeScript sans code ; les commandes sur mesure comme du code de confiance
  nommé dans le jeu ([Principes du contenu](create.principles.md), [Code sur mesure](create.custom-code.md)).
- **Vérifié avant que quiconque joue** : le validateur trouve les références cassées, les salles inatteignables et les
  répliques non traduites ; le solveur fait tourner le vrai moteur pour trouver un chemin gagnant (`npm run verify`) ou
  prouver que chaque état atteignable peut finir (`solve --prove`) ([Vérifier son jeu](create.checking.md),
  [Ce que prouve le solveur](create.solver-proofs.md)).
- **Rejoué** : une session reproduit exactement la partie d’un testeur ([Parties de test](create.playtests.md)).
- **Images, son et langues** : un prompt pour chaque planche de sprites, des planches découpées en sprites, une musique
  chiptune arrangée depuis un MIDI, chaque réplique traduisible ([Images](create.images.md),
  [Traductions](create.translations.md)).
- **Livré** : un site statique avec un budget de téléchargement et chaque fichier compté avec sa licence
  ([Construire et publier](create.build-release.md), [Provenance des assets](create.asset-provenance.md)).
- **Le Studio local** : le vrai moteur avec un éditeur par-dessus, le storyboard, les assets, les vérifications après
  chaque enregistrement, un onglet de jeu qui explique une règle et rejoue une session, la matrice héros × langue, un
  assistant avec votre propre clé ([Le Studio local](studio.overview.md)).
- **Travailler avec une IA** : chaque opération est une commande et un outil MCP
  ([Travailler avec une IA](create.working-with-ai.md)).

<a name="teams"></a>

## Pour les équipes et les opérateurs

- **Le Studio d’équipe hébergé** (expérimental) : un jeu, plusieurs personnes derrière OpenID Connect, des pans et des
  baux, des prévisualisations par révision, des commentaires, un diff sémantique, Git, un MCP distant pour les agents,
  des sauvegardes et des restaurations ; documenté pour Clever Cloud ([Ce qui tourne où](team.what-runs-where.md),
  [Clever Cloud : vue d’ensemble](clever.overview.md)).
- **Le Bridge Reality** : sur SQLite (stable) ou Postgres (expérimental), plusieurs locataires, des sauvegardes, des
  classements ; quatre connecteurs (expérimentaux) ([Installer et faire tourner le Bridge](bridge.install-run.md)).

<a name="in-numbers"></a>

## En chiffres

Mesuré sur le commit de la release par les vérifications automatiques (`npm run quality:baseline` les écrit dans les
README) :

> [!MEASURE id=in-numbers]
> 2945 déclarations de tests unitaires, lancées sous Node 22 et 24, avec des planchers de couverture et des tests de
> mutation bloquants ; le jeu de référence prouvé en 288 états ; la première visite du joueur à 136 Ko de JavaScript
> compressé.
> - date: 2026-10-22
> - version: 4.4.0
> - volume: la suite unitaire du dépôt du moteur ; le jeu de référence (`games/reference`) ; la première visite construite du jeu d’exemple
> - conditions: `npm run quality:baseline` sur le commit de la release, chiffres écrits dans le README
> - source: [README.md, « In numbers »](https://github.com/Quest-n-Click/quest-n-click/blob/c00b44fcffe56ffa99f9d2228297414ebe3145ac/README.md)

> [!MEASURE id=hosted-preview-time]
> Sur le Studio hébergé, de l’écriture à la prévisualisation prête : médiane 17,8 s avant les changements de la 4.4.0,
> 5,6 s après ; maximum 26,0 s, puis 11,7 s. Dix révisions par série : un ordre de grandeur, pas une distribution.
> - date: 2026-10-22
> - version: 4.4.0
> - volume: dix révisions par série (révisions 436 à 445, puis 446 à 455), une note toutes les 40 s
> - conditions: le déploiement de référence sur l’organisation de test de Clever Cloud, les plus petits plans
> - source: [QUALIF-4.2.3-REFERENCE.md §6](https://github.com/Quest-n-Click/quest-n-click/blob/c00b44fcffe56ffa99f9d2228297414ebe3145ac/docs/dev/QUALIF-4.2.3-REFERENCE.md)

Chaque release est construite depuis le commit que son candidat a testé. Le candidat produit les quatre archives de
packages, l’image du Bridge, les SBOM, les parties enregistrées et la baseline, et la release publie ces fichiers
mêmes ; la release ne produit elle-même que le jeu construit, son manifeste d’assets, les catalogues Remix prouvés, le
speedrun de référence et les sommes, depuis le même commit. Chaque fichier est publié avec sa somme SHA-256 et une
attestation de provenance ([la liste](../../tools/release/artifacts.mjs), [Publier une release](contribute.releasing.md)).

<a name="references"></a>

## Références

- [Galerie](start.gallery.md) : des captures du jeu et du Studio.
- [Ce qu’est quest'n'click](start.what-it-is.md), [Feuille de route](start.roadmap.md).
