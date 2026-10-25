# Accessibilité

Ce qu’un jeu quest'n'click offre au joueur qui utilise le clavier, un lecteur d’écran, un texte plus grand ou moins
d’animations ; ce que vérifient les machines, ce que seules des personnes peuvent vérifier, et où en sont ces
vérifications. Vrai depuis la 4.3.0 (les touches des verbes et leur annonce) ; le reste est plus ancien et dit depuis
quand.

<a name="engine"></a>

## Ce que fait le moteur

Tout jeu fait avec le moteur reçoit ceci, sans que son auteur écrive quoi que ce soit :

- **Le jeu entier se joue au clavier** : Tab atteint les verbes (les flèches se déplacent dans la grille, et le verbe
  choisi est annoncé comme enfoncé), les cibles de la scène (un bouton caché par hotspot, accessoire ou personnage
  visible, dans l’ordre de la scène), le sac et les outils. Les choix d’une conversation et les lieux de la carte
  prennent le focus quand ils apparaissent (flèches, Entrée). Espace ou Entrée fait avancer une réplique. Échap ferme
  ce qui est au-dessus (un menu, la carte, un historique, le Passer d’une cinématique ou d’un mini-jeu), sinon ouvre
  le menu de pause, dont le focus ne sort pas. Les touches : [Commandes](play.controls.md#keyboard).
- **Une zone annoncée** (live region) dit la salle où vous entrez, chaque réplique avec qui parle, et chaque objet
  gagné. Le repère « touche pour continuer » a un nom pour les lecteurs d’écran (`ui.advance`, « Continuer » dans le
  jeu d’exemple).
- **Touches des verbes** (au choix du jeu, depuis la 4.3.0) : un verbe qui a une lettre est annoncé avec ce raccourci
  (`aria-keyshortcuts`), et les réglages peuvent couper ces touches, comme le demande le critère WCAG 2.1.4 pour les
  raccourcis d’une seule lettre.
- **Les images** sont décoratives sauf si elles ont un nom : la scène s’atteint par ses cibles, un objet par son nom ;
  une case vide du sac est hors de l’arbre d’accessibilité.
- **Les mini-jeux** se jouent jusqu’au bout au clavier, pas seulement en les passant : `pick` et `hide` (les options
  et les cachettes sont des boutons nommés, les flèches se déplacent, Entrée choisit), `pipes` (les flèches parcourent
  la grille, Entrée tourne une tuile), `runner` (▲ / W saute, ▼ / S se baisse), `stroke` (◀ ▶ en alternance à un
  rythme calme ; tenir une touche, c’est « trop vite »), `scratch` (les flèches déplacent une pièce sur la couche
  argentée, le texte révélé est annoncé) et `cables` (Entrée sur une fiche la prend, Entrée sur une prise la branche).
  Le mini-jeu prend le focus sur sa première commande ; Passer reste toujours atteignable. La roue à code de Remix
  tourne avec des boutons, les flèches ou une manette, annonce chaque cran, et s’imprime.

<a name="text-and-motion"></a>

## Texte, animations, son et couleur

- **Texte** : un texte plus grand, et une vitesse plus lente qui garde chaque réplique plus longtemps à l’écran, dans
  les [réglages](play.settings.md) ; une police lisible quand le jeu en fournit une. Une réplique qui a un clip de
  voix reste le temps du clip ; un tap passe n’importe quelle réplique.
- **Animations** : « Réduire les animations » retire tremblements, glissements de caméra, parallaxe, particules et
  transitions ; la préférence du système fait de même et arrête aussi les animations de l’interface.
- **Son** : chaque réplique parlée est aussi écrite. Un son qui compte peut être sous-titré à l’écran (« [Une porte
  claque à l’étage] ») quand l’auteur a écrit un sous-titre ; les sous-titres sont activés par défaut. Qu’une énigme
  demande d’entendre, c’est un choix de l’auteur. Musique, sons et voix ont des volumes séparés.
- **Couleur** : les verbes, les objets et les sujets portent leur nom en texte. Il n’y a ni mode à fort contraste ni
  réglage des couleurs : les couleurs d’un jeu sont celles de son auteur.

<a name="checked"></a>

## Ce qui est vérifié, et ce qui ne l’est pas

Par des machines, en CI, à chaque changement qui peut toucher le lecteur de jeu :

- `npm run e2e -- --axe` passe axe-core sur l’écran titre, une salle, le menu de pause et la fin ; `npm run e2e:a11y`
  sur un menu de conversation, la carte, les emplacements de sauvegarde et de chargement, les confirmations d’écraser
  et de recommencer, et chaque mini-jeu fourni à son ouverture. Une violation `serious` ou `critical` fait échouer la
  vérification ; la liste des règles acceptées est vide.
- `npm run e2e:a11y` gagne aussi chaque mini-jeu fourni dans un vrai navigateur, au clavier seulement, en lisant la
  page comme un joueur.
- Le chemin gagnant du solveur est rejoué au clavier (`npm run e2e -- --generic --keyboard`), dans Chromium et, depuis
  la 3.3.1, dans WebKit.

Ce que le moteur peut affirmer est donc « testé au clavier, aucune violation axe sérieuse ou critique sur les écrans
vérifiés ». **Ce n’est pas une conformité WCAG.**

> [!LIMIT id=no-screen-reader-pass]
> Personne n’a encore joué à un jeu quest'n'click avec un lecteur d’écran pour une release. La liste de vérification
> existe ([`docs/dev/SCREEN-READER.md`](../../docs/dev/SCREEN-READER.md) : VoiceOver sur iOS ou TalkBack sur Android,
> l’écran titre, une salle, une action, un objet, une conversation, la carte, le menu de pause, un mini-jeu, la fin),
> et la matrice de support range une passe VoiceOver ou NVDA parmi « vérifié par des personnes (pas encore fait) ».
> À la 4.4.0, les passes humaines qui lisent cette surface, `phone-both-renderers`
> ([#83](https://github.com/Quest-n-Click/quest-n-click/issues/83)), `code-wheel-human`
> ([#78](https://github.com/Quest-n-Click/quest-n-click/issues/78), l’alternative textuelle de la roue à code par une personne
> qui utilise un lecteur d’écran) et `blind-playtesters` ([#76](https://github.com/Quest-n-Click/quest-n-click/issues/76)),
> ne sont pas faites.

<a name="fairness"></a>

## Accessibilité et équité en speedrun

Une catégorie de speedrun déclare les entrées qu’elle permet (souris, toucher, clavier, manette, macros). Une option
d’accessibilité n’est **jamais une triche implicite** : la vitesse et la taille du texte, les animations réduites et
la police lisible ne changent rien au temps de jeu (une réplique coûte le même temps logique à toutes les vitesses), et
les cibles du clavier et du lecteur d’écran sont les mêmes actions qu’un tap. Une catégorie qui interdit une entrée le
dit ; les entrées utilisées par un run sont déclarées par le navigateur du joueur (sa parole, comme l’horloge réelle).
Voir [Speedrun pour les joueurs](play.speedrun.md) et, pour les auteurs,
[Speedrun pour les auteurs](create.speedrun.md#fairness).

<a name="report"></a>

## Signaler un obstacle

Un obstacle est un bug. Ouvrez un ticket sur [le suivi du projet](https://github.com/Quest-n-Click/quest-n-click/issues) avec
l’écran, votre appareil, votre navigateur et votre aide technique, et ce que vous avez entendu ou n’avez pas pu
atteindre. Un fichier de session (menu de pause › Sauver › Exporter la session) aide l’auteur à rejouer ce que vous
avez fait.

<a name="references"></a>

## Références

- [Stabilité et support](start.stability.md) : les statuts du lecteur de jeu, ses passes.
- Le code : [`src/engine/dom/a11y.ts`](../../src/engine/dom/a11y.ts) (le piège à focus, la navigation aux flèches),
  [`src/engine/dom/input.ts`](../../src/engine/dom/input.ts) (les touches),
  [`tests/dom/minigames-keyboard.test.ts`](../../tests/dom/minigames-keyboard.test.ts) (cinq mini-jeux gagnés par des
  événements clavier).
