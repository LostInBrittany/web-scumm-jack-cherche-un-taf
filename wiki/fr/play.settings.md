# Réglages

Les réglages qu’un joueur peut changer dans un jeu quest'n'click, ce que fait chacun, et où ils sont gardés. Le menu
n’existe que si l’auteur du jeu l’a activé (`settings: true`) ; le jeu d’exemple l’a. Les libellés cités sont ceux du
jeu d’exemple en français ; un autre jeu peut les formuler autrement.

<a name="where"></a>

## Où les trouver

Menu de pause › **Réglages** (⚙). Chaque ligne montre sa valeur ; la toucher passe à la valeur suivante, tout de
suite. **Reprendre** ferme le menu. Sans ligne Réglages, le jeu n’offre que les interrupteurs **Musique** et **Sons**
du menu de pause et le bouton de son des outils.

Les réglages sont gardés dans ce navigateur, pour ce jeu (clé `<jeu>.settings` du stockage local), à part de la
sauvegarde : charger une sauvegarde ou recommencer ne les change pas, et ils ne voyagent pas avec une sauvegarde
exportée.

<a name="text-speed"></a>

## Vitesse du texte

Lent, normal ou rapide : combien de temps une réplique reste à l’écran quand elle n’a pas de clip de voix. Un tap
passe toujours une réplique. Le réglage ne change rien au temps de jeu d’un speedrun (voir
[Accessibilité](play.accessibility.md#fairness)).

<a name="text-size"></a>

## Taille du texte

Normal ou grand (1,3 fois la taille normale), pour les répliques et les textes de l’interface dans la scène.

<a name="reduce-motion"></a>

## Réduire les animations

Oui ou non. Oui : plus de tremblement d’écran, la caméra se place d’un coup au lieu de glisser, pas de parallaxe, pas
de particules, pas de transition entre salles, pas de fondus. Quand votre système demande moins d’animations
(`prefers-reduced-motion`), le jeu fait comme si le réglage était activé, et les animations propres à l’interface
(indices qui clignotent, générique qui défile) s’arrêtent aussi.

<a name="readable-font"></a>

## Police lisible

Oui ou non, seulement dans un jeu qui fournit une police lisible (par exemple pensée pour la dyslexie) : l’interface et
les répliques l’utilisent à la place de la police pixel du jeu.

<a name="captions"></a>

## Sous-titres des sons

Oui (par défaut) ou non, seulement dans un jeu qui sous-titre certains de ses sons : un son qui compte est aussi écrit
à l’écran (« [Une porte claque à l’étage] »), traduit comme toute réplique.

<a name="verb-keys"></a>

## Touches des verbes

Oui (par défaut) ou non, seulement dans un jeu dont les verbes ont une touche (depuis la 4.3.0) : coupe les raccourcis
d’une seule lettre qui choisissent un verbe, pour qui tape à la voix ou appuie sur des touches par accident. Voir
[Commandes](play.controls.md#keyboard).

<a name="language"></a>

## Langue

Seulement dans un jeu qui propose plus d’une langue : chaque tap passe à la langue suivante et recharge la page dans
cette langue. Le choix est retenu dans ce navigateur. Voir [Langues](play.languages.md).

<a name="volumes"></a>

## Volumes de la musique, des sons et des voix

Chacun passe par 0 %, 25 %, 50 %, 75 % et 100 %. Le volume des voix n’est proposé que dans un jeu qui a des voix
enregistrées. Quand quelqu’un parle, la musique baisse d’elle-même.

Les lignes **Musique** et **Sons** du menu de pause coupent ou rétablissent la musique et les bruitages ; le bouton de
son parmi les outils coupe ou rétablit les deux ensemble. Ces deux interrupteurs valent pour la page : ils ne sont pas
gardés avec les réglages.

> [!LIMIT id=no-contrast-setting]
> Il n’y a ni mode à fort contraste, ni réglage des couleurs, ni remappage des touches. Les couleurs d’un jeu sont
> celles de son auteur.

<a name="for-authors"></a>

## Pour les auteurs

`settings: true` dans `game.ts` ajoute l’entrée Réglages au menu de pause : vitesse du texte (lent / normal / rapide),
taille du texte (normal / grand), réduire les animations (pas de tremblement, caméra et fondus instantanés), une police
lisible quand le jeu en fournit une (`skin.fonts.readable`), les volumes musique / sons / voix, la ligne des
sous-titres quand le jeu sous-titre un son, et les touches des verbes activées ou non quand un verbe a une `key`
(4.3.0). Les préférences restent dans le navigateur, hors de la sauvegarde. Textes : `ui.settings`, `ui.textSpeed`,
`ui.textSize`, `ui.reduceMotion`, `ui.readableFont`, `ui.captions`, `ui.volumeMusic`, `ui.volumeSfx`,
`ui.volumeVoice`, `ui.verbKeys`, `ui.language`, `ui.slow`, `ui.normal`, `ui.fast`, `ui.large` (valeurs anglaises par
défaut quand ils manquent). Plus dans [Mise en scène](create.staging.md#settings).

<a name="related"></a>

## Voir aussi

- [Accessibilité](play.accessibility.md), [Commandes](play.controls.md), [Langues](play.languages.md).
- Le code : [`src/engine/dom/settings.ts`](../../src/engine/dom/settings.ts).
