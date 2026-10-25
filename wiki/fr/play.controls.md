# Commandes sur téléphone et ordinateur

Comment on joue à un jeu quest'n'click : du doigt sur un téléphone, à la souris ou au clavier sur un ordinateur. Les
libellés cités sont ceux du moteur par défaut et ceux du jeu d’exemple (*La Clé du garde-manger*) ; un jeu peut nommer
autrement ses verbes et ses boutons, et en avoir plus ou moins.

<a name="layouts"></a>

## Deux mises en page

- **Sur un téléphone**, le jeu se joue en paysage. Tenu en portrait, le téléphone affiche « Tourne ton téléphone »
  (les mots du jeu) jusqu’à ce que vous le tourniez. La scène occupe la gauche ; une colonne à droite contient les
  verbes, le sac (votre inventaire) et les outils : un portrait par personnage jouable quand le jeu en a plusieurs (un
  tap passe à ce personnage), la carte, le menu de pause, et un bouton de son qui coupe ou rétablit musique et
  bruitages ensemble. Sur un écran paysage bas (un téléphone sous les barres de son navigateur), la colonne réduit ses
  cases et ses verbes pour tenir, et défile au lieu de couper sous un plancher (4.4.0).
- **Sur un ordinateur**, avec une souris et une fenêtre d’au moins 720 × 450 pixels, la mise en page classique : la
  scène en haut, la ligne de phrase, puis les verbes, le sac et les outils sur une rangée en dessous. Survoler une
  chose la nomme dans la ligne de phrase et change le pointeur en main.

<a name="tap-and-verbs"></a>

## Verbes, taps et ligne de phrase

Un verbe est un bouton : Donner, Ouvrir, Fermer, Prendre, Regarder, Parler à, Utiliser, Pousser, Tirer dans le jeu
d’exemple. Ensuite :

- **Touchez (ou cliquez) un verbe, puis une chose** de la scène ou du sac : le héros y va et le fait. Toucher de
  nouveau le verbe choisi l’annule.
- **Utiliser et Donner prennent deux choses** : le verbe, la première chose (un objet du sac), puis la seconde
  (« Utiliser tuyau avec cuve », « Donner jeton au vendeur »).
- **Touchez une chose sans verbe choisi** : le héros y marche. Sur un téléphone, son nom s’affiche un instant
  au-dessus.
- **Touchez un endroit vide** : le héros y va, dans les limites du sol.
- **Touchez un objet du sac sans verbe** : il est pris pour Utiliser (ou Donner, sur un personnage) ; le tap suivant
  sur une cible dit ce qui se passe.
- **La ligne de phrase** dit ce que fera le prochain tap avant que vous touchiez : « Aller vers », « Regarder
  l’horloge », « Utiliser tuyau avec … ».
- Tant qu’une réplique est à l’écran, un tap n’importe où la fait avancer.

<a name="double-tap"></a>

## Un double tap : le verbe que vous voulez dire

Deux taps sur la même chose en moins de 400 ms agissent sans choisir de verbe (depuis la 4.0) :

- une **sortie** est franchie (son premier verbe) ;
- on **parle** à un personnage ;
- on **regarde** tout le reste ;
- une chose peut nommer son propre verbe (un placard qui s’ouvre d’un double tap, par exemple) ;
- avec un **objet pris dans le sac**, le double tap le donne à un personnage, ou l’utilise sur le reste.

Un verbe que le jeu n’a pas n’est jamais choisi.

> [!GUARANTEE id=double-tap-verb]
> Sans objet pris dans le sac, un double tap franchit une sortie, parle à un personnage et regarde tout le reste.

<a name="single-tap-exit"></a>

## Un simple tap qui fait passer

Certains jeux font qu’un simple tap sur une sortie y mène **et** la franchit à l’arrivée, comme « Aller vers » dans
les classiques (le `input.exitOnTap` d’un jeu, depuis la 4.2.4 ; une sortie ou un hotspot peut aussi le demander,
depuis la 4.2.4 et la 4.4.0). Un verbe choisi l’emporte toujours, et un tap ailleurs pendant la marche redirige le
héros et annule le passage. Une sortie fermée dit pourquoi.

<a name="keyboard"></a>

## Le clavier

Le jeu entier se joue au clavier :

| Touche | Effet |
|---|---|
| Tab, Maj+Tab | Passe des verbes aux cibles de la scène (une par chose visible, dans l’ordre de la scène), au sac et aux outils |
| Flèches | Se déplacent dans la grille des verbes ; choisissent parmi les sujets d’une conversation ou les lieux de la carte |
| Entrée, Espace | Activent le bouton qui a le focus ; font avancer une réplique |
| Échap | Ferme ce qui est au-dessus (un menu, la carte, un historique, le Passer d’une cinématique ou d’un mini-jeu), sinon ouvre le menu de pause |
| La lettre d’un verbe | Choisit ce verbe, quand le jeu donne une touche à ses verbes (depuis la 4.3.0) |

**Touches des verbes.** Un jeu peut donner une lettre à chaque verbe, comme les jeux LucasArts : O pour Ouvrir, R
pour Regarder. Le bouton souligne la lettre. La touche marche en minuscule comme en majuscule, sans Ctrl, Alt ni
Méta, et ne fait rien tant qu’une réplique est affichée, que le moteur est occupé, ou qu’une conversation, la carte, un
mini-jeu ou un menu est ouvert. Vous pouvez couper ces touches dans les réglages (« Touches des verbes »), par exemple
si vous tapez à la voix. Le jeu d’exemple ne donne pas de touche à ses verbes.

Sous macOS, Safari ne passe d’un bouton à l’autre avec Tab qu’en tenant Option (Option+Tab), sauf si vous changez ce
réglage dans les préférences clavier du système.

<a name="minigames"></a>

## Mini-jeux

Chaque mini-jeu fourni se joue jusqu’au bout au toucher ou au clavier : les flèches déplacent, Entrée choisit ou
tourne, et dans le runner ▲ / W saute et ▼ / S se baisse. Chacun a un bouton **Passer** (Échap l’active).

<a name="gamepad"></a>

## Manette

Une manette ne joue pas au jeu. La seule exception est la roue à code d’un monde Remix (depuis la 4.1.16) : gauche et
droite la tournent, haut et bas choisissent une réponse, A valide. Voir
[Ce que quest'n'click ne fait pas](index.not-supported.md).

> [!LIMIT id=controls-not-tried-by-people]
> Les commandes au toucher et au clavier sont vérifiées par des machines (Chromium et WebKit à la taille d’un
> téléphone, au toucher et au clavier, en CI). Sur un vrai téléphone, personne ne les a encore essayées : la passe
> `phone-both-renderers` est ouverte ([#83](https://github.com/Quest-n-Click/quest-n-click/issues/83)) à la 4.4.0.

<a name="see-also"></a>

## Voir aussi

- [Accessibilité](play.accessibility.md) : focus, lecteurs d’écran, ce qui est vérifié.
- [Réglages](play.settings.md) : vitesse et taille du texte, animations réduites, touches des verbes.
- Pour les auteurs : [Réactions](create.reactions.md), qui dit comment un jeu nomme le verbe par défaut d’une chose.
- Le code : [`src/engine/dom/input.ts`](../../src/engine/dom/input.ts),
  [`src/engine/core/default-verb.ts`](../../src/engine/core/default-verb.ts).
