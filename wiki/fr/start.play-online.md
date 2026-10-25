# Jouer en ligne et essayer le Studio de démo

Comment jouer au jeu d’exemple et ouvrir le Studio dans votre navigateur, sans rien installer.

<a name="what-you-get"></a>

## Ce que vous obtenez

*La Clé du garde-manger*, le jeu d’exemple, qui tourne dans votre navigateur, et le Studio qui modifie ce même jeu, vos
modifications gardées dans votre navigateur seulement.

<a name="context-and-versions"></a>

## Contexte et versions

Le site web du projet, `https://quest-n-click.cleverapps.io` (le dépôt `Quest-n-Click/quest-n-click-site`, hébergé chez Clever Cloud) : le
jeu sous `/demo/`, la démo du Studio sous `/demo/studio.html`, la dernière documentation sous `/fr/docs` (`/docs` en anglais). La démo
est le `quest-n-click-v<version>-web.tar.gz` de la dernière release, vérifié contre les sommes de la release : une
version publiée, pas `main`. Depuis la 4.5.2 ; avant, la démo était sur GitHub Pages, à `wanoo.github.io/quest-n-click`
(de la 4.2.5 à la 4.5.1) et `wanoo.github.io/web-scumm`, abandonné.

<a name="prerequisites"></a>

## Prérequis

- Un navigateur récent sur un téléphone (en paysage) ou un ordinateur. Rien d’autre.
- Pour l’Assistant du Studio seulement : votre propre clé d’un modèle de conversation (voir
  [L’Assistant](studio.assistant.md)).

<a name="where-to-run"></a>

## Où le faire

Dans votre navigateur. Aucune commande.

<a name="steps"></a>

## Étapes

<!-- step: play -->
1. **Jouer** : ouvrez [quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/). Sur un téléphone,
   tournez-le en paysage. Touchez **New game**. Le jeu est en anglais ; `?lang=fr` dans l’adresse, ou les réglages, le
   passent en français ([Langues](play.languages.md)). Comment jouer : [Commandes](play.controls.md).

<!-- step: install -->
2. **Le garder** (facultatif) : installez-le comme une application et jouez hors ligne
   ([Installer le jeu comme une application](play.install-app.md)).

<!-- step: studio -->
3. **Ouvrir le Studio** : [quest-n-click.cleverapps.io/demo/studio.html](https://quest-n-click.cleverapps.io/demo/studio.html).
   C’est le mode démo : le même Studio, la même vue du moteur et le même éditeur de placement que sur votre machine,
   sans aucun serveur. Un bandeau dit « Demo: your edits stay in this browser ».

<!-- step: edit -->
4. **Modifier** : changez une réplique, déplacez un accessoire, ajoutez une note. Validate et Solve tournent dans la
   page, sur le jeu avec vos modifications. **Download patch** enregistre vos modifications dans
   `studio-patch-<jeu>.json` ; **Reset demo** les efface toutes.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Le jeu : l’écran titre, puis le salon de Grand-mère avec neuf verbes et le sac.
- Le Studio : l’onglet Rooms sur la maison de Grand-mère, et l’onglet Check au vert après une modification qui laisse
  le jeu faisable.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| « Tourne ton téléphone » (« Rotate your phone ») | Le jeu se joue en paysage | Tournez le téléphone |
| Pas de son | Le son démarre au premier tap | Touchez une fois ; [Dépannage pour les joueurs](play.troubleshooting.md#no-sound) |
| Le panneau des captures du Studio manque | Les captures demandent un serveur de développement local | Lancez le Studio en local ([Le Studio local](studio.overview.md)) |
| L’Assistant refuse un appel depuis la page | Certains fournisseurs refusent les appels d’un navigateur depuis une origine inconnue | Utilisez Ollama sur votre machine, ou le Studio local, dont le serveur relaie l’appel ([L’Assistant](studio.assistant.md)) |

> [!LIMIT id=demo-edits-local]
> Le Studio de démo ne garde vos modifications que dans le stockage local de ce navigateur : un autre navigateur, un
> site effacé ou **Reset demo** les perd. Téléchargez le patch pour les garder.

<a name="files-changed"></a>

## Fichiers ou données modifiés

Dans votre navigateur : les sauvegardes et le cache du jeu ([Confidentialité](play.privacy.md#device)), et les
modifications de la démo dans le stockage local (clé `web-scumm.studio-demo.<jeu>`). Un patch téléchargé arrive dans
votre dossier de téléchargements.

<a name="recovery"></a>

## Reprise ou retour arrière

**Reset demo** ramène le Studio au jeu publié. Un patch téléchargé s’applique à votre propre copie du jeu avec
`npm run studio-apply` ([Mode démo et studio-apply](studio.demo-mode.md)).

<a name="next"></a>

## Faire son propre jeu

Le moteur s’installe depuis l’archive d’une release, pas encore depuis npm :
[Installer depuis l’archive de la release](install.from-archive.md), puis [Votre premier jeu](create.first-game.md).

<a name="references"></a>

## Références

- [Mode démo et studio-apply](studio.demo-mode.md), [Le Studio local](studio.overview.md).
- [Ce qu’est quest'n'click](start.what-it-is.md), [Galerie](start.gallery.md).
