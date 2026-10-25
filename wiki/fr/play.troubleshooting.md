# Dépannage pour les joueurs

Quatre problèmes que rencontrent les joueurs d’un jeu quest'n'click dans un navigateur : pas de son, une sauvegarde
qui ne se charge pas, une copie hors ligne incomplète, et une mise à jour qui n’apparaît pas. Chaque section part de
ce que vous voyez.

<a name="symptom"></a>

## Symptômes

| Ce que vous voyez | Section |
|---|---|
| Pas de musique, pas de bruitages, ou pas de voix | [Pas de son](#no-sound) |
| « Échec de la sauvegarde », « save belongs to game … », « save version … cannot be migrated … », Continuer commence une nouvelle partie | [Une sauvegarde qui ne se charge pas](#save-will-not-load) |
| La ligne Hors ligne du menu de pause affiche ⚠, ou une salle demande le réseau en mode avion | [Hors ligne incomplet](#offline-incomplete) |
| Le jeu a été mis à jour, et vous voyez toujours l’ancienne version | [Une mise à jour qui n’apparaît pas](#update-not-showing) |

<a name="no-sound"></a>

## Pas de son

Le jeu reste muet : vous n’entendez rien, ni musique, ni bruitages, ni voix.

**Causes possibles**, de la plus fréquente à la plus rare :

1. **La page n’a pas encore été touchée.** Les navigateurs ne laissent une page jouer du son qu’après une interaction :
   le jeu débloque son son à votre premier tap, clic ou appui de touche. Jusque-là, l’écran titre est muet.
2. **Le son est coupé dans le jeu** : le bouton de son parmi les outils coupe musique et bruitages ensemble ; le menu
   de pause a des lignes **Musique** et **Sons** séparées ; les réglages ont des volumes, et 0 % est muet.
3. **L’appareil est en silencieux** : le volume, ou sur un iPhone le bouton sonnerie/silence, qui peut rendre les
   pages web muettes.
4. **Pas de voix dans votre langue** : dans un jeu traduit, une réplique sans clip enregistré dans cette langue ne joue
   aucune voix ([Langues](play.languages.md#voices)). Avant la 4.4.0, les clips d’une traduction n’étaient pas livrés
   du tout.

<!-- step: fix-sound -->
**Correction.** Touchez une fois la scène. Ouvrez le menu de pause et vérifiez que **Musique** et **Sons** sont sur
oui, puis les volumes des réglages. Vérifiez le volume de l’appareil et son bouton silence. Rechargez la page si le
son ne vient toujours pas.

<a name="save-will-not-load"></a>

## Une sauvegarde qui ne se charge pas

| Message | Cause | Correction |
|---|---|---|
| « Échec de la sauvegarde » (avec la raison du navigateur) | Le navigateur a refusé d’écrire : stockage plein, navigation privée, stockage du site bloqué | Libérez de la place, quittez la navigation privée, puis continuez ; exportez une sauvegarde qui compte |
| « save belongs to game "x", not "y" » | Vous avez importé le fichier d’un autre jeu | Importez-le dans le jeu d’où il vient |
| « save version 5 cannot be migrated to 4 » | La sauvegarde est plus récente que cette copie du jeu (faite après une mise à jour, importée dans une copie plus ancienne) | Mettez le jeu à jour ([plus bas](#update-not-showing)), puis importez de nouveau |
| « state.room: unknown current room … », « state.active: unknown active player … », ou une erreur de format | Le fichier est abîmé, ou le jeu n’a plus la salle où vous aviez sauvegardé (ou le héros que vous jouiez) : une telle sauvegarde est refusée, alors qu’une salle que l’auteur a renommée avec une migration se charge toujours | Chargez un emplacement plus ancien ou un fichier exporté ; la partie en cours n’est pas touchée ; prévenez l’auteur du jeu si une nouvelle version a supprimé la salle |
| « this save was played in another world (seed …) » | Une sauvegarde Remix, faite dans un autre monde | Laissez le jeu ouvrir ce monde, ou gardez celui en cours |
| « this save belongs to another link » (un jeu Reality) | La sauvegarde était liée à un autre joueur sur le Bridge : rien n’est appliqué | Menu de pause › la ligne du lien › **Use this link with this save**, ou continuez sans lien |
| « Sauvegarde adaptée à cette version : … » | Pas une erreur : une version plus récente du jeu n’a plus quelque chose que la sauvegarde nommait (un objet, un lieu, une salle visitée), pas la salle où vous êtes ; elle s’est chargée sans | Continuez |
| Continuer commence une nouvelle partie | L’auteur du jeu a changé la version des sauvegardes sans moyen de reprendre les anciennes | Demandez à l’auteur du jeu ; un fichier exporté peut attendre une version corrigée |

<!-- step: fix-save -->
**Correction.** Lisez le message, puis suivez la ligne ci-dessus. Une sauvegarde refusée ne remplace jamais la partie
en cours. Pour garder une sauvegarde à l’abri d’un appareil à l’autre et d’une mise à jour à l’autre, exportez-la :
menu de pause › Sauver › **Exporter en fichier** ([Sauvegardes](play.saves.md)).

<a name="offline-incomplete"></a>

## Hors ligne incomplet

**Ce que dit le menu de pause.** La ligne **Hors ligne** compte les fichiers en cache : « 312/400… » pendant le
téléchargement, « jeu entier en cache » (dans le jeu d’exemple) quand tout le jeu y est, « 312/400 ⚠ » (et le mot du
jeu pour réessayer) quand il en manque. Pas de ligne Hors ligne : le jeu ne garde que les salles proches
(`offline: 'nearby'`), par choix de son auteur.

**Causes et corrections :**

<!-- step: fix-offline -->
1. **Économie de données ou 2G** : rien n’est téléchargé tant que le navigateur demande d’économiser les données ou
   que la connexion est en 2G ; musique et vidéo attendent mieux que la 3G. Passez en Wi-Fi, puis touchez la ligne.
2. **Un fichier a échoué** (le réseau a coupé) : touchez la ligne ; les fichiers déjà en cache ne sont pas
   retéléchargés.
3. **Moins de 64 Mo libres** : le téléchargement ne démarre pas. Libérez de la place, puis touchez la ligne.
4. **Le service worker du jeu n’avait pas pris la main** sur la page à la première visite : rechargez la page en
   ligne, puis touchez la ligne.
5. **Safari a effacé le site** : dans un onglet Safari (pas un jeu ajouté à l’écran d’accueil), après sept jours
   d’utilisation de Safari sans visite ([WebKit](https://webkit.org/tracking-prevention/)), ou l’appareil a manqué de place. Rouvrez le jeu en ligne et laissez-le
   télécharger.

Voir aussi [Installer le jeu comme une application](play.install-app.md#common-errors).

<a name="update-not-showing"></a>

## Une mise à jour qui n’apparaît pas

**Comment marchent les mises à jour.** Le jeu garde ses propres fichiers en cache pour pouvoir jouer hors ligne. Quand
le site a une nouvelle version, la page affiche un bandeau, « Une nouvelle version est prête. » avec **Sauvegarder et
mettre à jour** : le jeu sauvegarde d’abord, vérifie la sauvegarde, et seulement alors passe à la nouvelle version.
Tant que vous n’appuyez pas, vous continuez à jouer la version que vous avez. Les images et les sons modifiés ont une
nouvelle adresse (`?v=<empreinte>`) : une fois la nouvelle version lancée, ils ne viennent jamais de l’ancien cache.

<!-- step: fix-update -->
**Correction.**

1. Ouvrez le jeu **en ligne** et attendez quelques secondes sur l’écran titre : le navigateur cherche une nouvelle
   version au chargement de la page.
2. Appuyez sur **Sauvegarder et mettre à jour** dans le bandeau.
3. Si aucun bandeau n’apparaît : fermez tous les onglets et fenêtres du jeu (une application installée compte), puis
   rouvrez-le en ligne.
4. Si « Échec de la sauvegarde » s’affiche quand vous appuyez, la mise à jour attend : la sauvegarde n’a pas pu être
   vérifiée, donc le jeu ne change pas de version. Libérez de la place, puis réessayez.
5. Pour savoir quelle version tourne, ouvrez le menu de pause : la ligne **Version** (« Build » par défaut en anglais)
   montre l’empreinte du jeu (quatre courtes empreintes : logique, extensions, présentation, moteur). Comparez-la avec
   quelqu’un qui a la version actuelle, ou donnez-la dans un signalement de bug.

<a name="check-fixed"></a>

## Comment vérifier que c’est réglé

- Son : la musique de l’écran titre, ou un bruitage au prochain tap.
- Une sauvegarde : **Charger** montre votre emplacement avec sa salle et sa date, et le charger vous ramène dans cette
  salle.
- Hors ligne : la ligne **Hors ligne** annonce le jeu entier en cache ; en mode avion, chaque salle se joue.
- Mise à jour : le bandeau a disparu et la ligne **Version** montre la nouvelle empreinte.

<a name="neighbours"></a>

## Cas voisins

- **Le jeu ne se charge pas du tout**, ou sans images, sur un site que vous publiez vous-même : c’est un problème de
  déploiement (un sous-chemin, un cache, un service worker), côté auteur :
  [Sous-chemin, cache et service worker](create.deploy-issues.md).
- **« Tourne ton téléphone »** en portrait : le jeu ne se joue qu’en paysage ([Commandes](play.controls.md#layouts)).
- **Un speedrun qui ne démarre pas ou ne s’exporte pas** : [Speedrun pour les joueurs](play.speedrun.md#common-errors).
- **Le Studio**, pas le jeu : [Dépannage du Studio](studio.troubleshooting.md).

<a name="report"></a>

## Signaler un bug

Ouvrez un ticket sur le suivi du jeu (pour le jeu d’exemple, [celui du projet](https://github.com/Quest-n-Click/quest-n-click/issues))
avec votre appareil, votre système et votre navigateur, ce que vous avez fait, ce que vous avez vu, la ligne
**Version** du menu de pause, et si possible un fichier de session : menu de pause › Sauver › **Exporter la session**
(il rejoue exactement ce que vous avez fait, sur la machine de l’auteur).
