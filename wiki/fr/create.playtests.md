# Playtests

Le solveur vous dit que le jeu peut se finir. Il ne peut pas vous dire où une personne bloque. Un playtest, si : les
joueurs partagent leur session depuis le menu pause, vous déposez les fichiers dans le jeu, et `playtests` les rejoue
sur le contenu actuel et en fait la synthèse.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un rapport sur la façon dont de vraies personnes ont joué : le temps de jeu par lieu, où elles ont bloqué, les indices
qu'elles ont vus, les mini-jeux joués, où chacune s'est arrêtée, les taps qui ont raté une cible de peu, et une carte
de chaleur sur le graphe de puzzles, avec les mêmes clés que celle du solveur. Les sessions restent dans le jeu et
sont rejouées par chaque vérification suivante : vous savez aussi quand un changement de contenu empêche une ancienne
session de se rejouer.

<a name="context-and-versions"></a>

## Contexte et versions

- Le dépôt du moteur (les fichiers vont dans `games/<id>/playtests/`) ou un projet créé (`game/playtests/`).
- Depuis la 3.9.0 : les playtests, les quotas de terrain (3.7.1) et les taps manqués de peu (3.8.0) sont tous là, et
  un projet créé a la commande `quest-n-click playtests`. L'onglet Check du Studio et l'outil MCP `playtests`
  montrent le même rapport.

<a name="prerequisites"></a>

## Prérequis

- Une version du jeu que les testeurs peuvent ouvrir sur leur téléphone : une URL déployée
  ([Construire et publier un jeu](create.build-release.md)) ou votre machine sur le réseau local
  ([Tester sur un téléphone en réseau local](create.lan-testing.md)).
- Des testeurs qui n'ont jamais vu le jeu.

<a name="where-to-run"></a>

## Où lancer les commandes

- Sur le téléphone du testeur : le menu pause du jeu.
- `npm run playtests …` : dans le dépôt du moteur, sur votre machine. `npx quest-n-click playtests …` : dans le projet
  créé, sur votre machine.

<a name="like-a-player"></a>

## Tester comme un joueur

Chaque vérification attrape ce que les autres ratent. Lancez-les dans cet ordre :

| Étape | Commande (dépôt du moteur) | Attrape |
|---|---|---|
| Valider | `npm run validate` | ids cassés, Regarder manquants, lignes trop longues, flags jamais posés |
| Résoudre | `npm run solve` | impasses, fin inatteignable, objets jamais utilisés |
| Test de parcours | `npm test` (`tests/demo-walkthrough.test.ts` pour la démo) | une partie complète scriptée sur le vrai moteur |
| Captures | `npm run e2e` | ce que le solveur ne voit pas : un personnage sur une table, une ligne coupée par le bord |
| Un vrai téléphone | `npm run dev:lan`, en paysage | taille des pouces, lisibilité, son, l'écran « tournez » |
| Fin scellée | `npm run seal`, `npm run build`, `npm run check:spoilers` | le texte de fin jamais en clair |
| Une personne | les étapes ci-dessous | ce que plus personne dans l'équipe ne voit |

Dans un projet créé, `npm run verify` lance la validation, le solveur, l'état des traductions, le lint et les
playtests ; les autres lignes n'ont pas de commande `quest-n-click`, voir
[Vérifier son jeu](create.checking.md#commands). L'onglet Check du Studio lance validate et solve au même endroit.

Puis donnez le téléphone à quelqu'un qui n'a jamais vu le jeu, et taisez-vous. Chaque fois qu'il hésite plus d'une
minute, notez-le : c'est un Regarder qui manque, un indice vague, ou une sortie que personne n'a vue.

<a name="steps"></a>

## Étapes

<!-- step: send-url -->
1. **Envoyez l'URL du jeu.** Dites seulement : « joue comme tu veux ; quand tu t'arrêtes, fini ou pas, ouvre le menu
   pause et touche *Partager la session* ». N'expliquez aucune énigme, même si on vous le demande : notez la question.

<!-- step: share-session -->
2. **Le testeur partage la session.** *Partager la session* (la ligne du menu pause, nommée par `ui.shareSession` ;
   « Share session » dans un jeu non traduit) fabrique un fichier `<jeu>-<date>-<heure>.session.json` et l'envoie par la feuille de partage du téléphone (Web
   Share), ou le télécharge quand le navigateur ne sait pas partager. Le fichier contient les entrées depuis le début
   de la partie, en ids et indices seulement (pas de texte du journal, pas de nom), l'heure de chaque entrée, la
   famille d'appareil (`ios`, `android` ou `desktop`, rien de plus fin) et les taps manqués de peu : un tap dans le
   vide à moins de 24 px d'une cible, par lieu et par cible. Le testeur l'envoie comme il veut.

> [!GUARANTEE id=session-ids-only]
> Une session de playtest partagée porte un horodatage à chaque étape et un journal vide, et une réplique dite par le
> jeu pendant la partie n'est pas dans le fichier.

<!-- step: drop-files -->
3. **Déposez les fichiers dans le jeu** et commitez-les :
   - dépôt du moteur : `games/<id>/playtests/` (`npm run audit` parcourt ce dossier avec le reste de `games/`) ;
   - projet créé : `game/playtests/`.

   Seuls les fichiers dont le nom finit par `.session.json` sont lus.

<!-- step: report -->
4. **Rejouez et lisez le rapport.**

   ```sh
   # dans le dépôt du moteur
   npm run playtests -- --out=.cache/playtests

   # dans un projet créé
   npx quest-n-click playtests --out=.cache/playtests
   ```

   Il rejoue chaque fichier sur le contenu actuel et affiche, en Markdown : le temps de jeu par lieu (un écart de plus
   d'une minute entre deux entrées compte comme une pause), où les joueurs bloquent (la même action trois fois de
   suite sans effet), les indices montrés, les mini-jeux joués, où chaque joueur s'est arrêté, les taps manqués de
   peu, et les sessions que le contenu a dépassées. `--out` écrit `report.md`, `report.json` et `heat.svg` (le graphe
   de puzzles, chauffé par les joueurs) ; `--json` affiche le rapport sur stdout et rien d'autre ; `--dir=<dossier>`
   lit un autre dossier.

<!-- step: act -->
5. **Faites du rapport du travail.** Un blocage, c'est une énigme à mieux indicer ; un tap manqué de peu, une zone
   cliquable à agrandir ; un abandon, un endroit à regarder. Dans l'onglet Check du Studio, la chaleur du graphe de
   puzzles peut venir des joueurs au lieu du solveur.

<!-- step: gate -->
6. **Gardez les sessions comme garde-fou.** Les sessions restent dans le jeu. Une fois le contenu changé, elles
   peuvent ne plus se rejouer :
   - sans `--strict` (ce que lancent `verify:game`, `npm run build`, et `verify` et `build` d'un projet créé), une
     session divergente est signalée, pas en erreur : un changement de contenu ne bloque jamais un push ;
   - avec `--strict` (le garde-fou de release : `verify:release` et `release-check` dans le dépôt du moteur,
     `quest-n-click release` dans un projet créé, et le workflow hebdomadaire `prove`), une session divergente est une
     erreur, code 1 : réenregistrez-la ou supprimez-la.

   `--strict` seul ne demande aucun nombre de sessions : zéro session le passe, et il le dit.

<!-- step: quotas -->
7. **Pour une version testée par des joueurs, demandez des quotas.**

   ```sh
   # dans le dépôt du moteur : verify:commercial, puis 5 sessions qui se rejouent, 3 jouées jusqu'au bout, 2 familles d'appareils
   npm run verify:field

   # dans les deux contextes, vos propres nombres
   npm run playtests -- --strict --require=5 --require-completed=3 --require-devices=2
   npx quest-n-click playtests --strict --require=5 --require-completed=3 --require-devices=2
   ```

   Une session divergente ne compte pour rien ; chaque famille d'appareil compte une fois. Un quota manqué est une
   erreur, et aucune session du tout aussi. `verify:field` n'est pas une étape de `release-check` (décision D12) :
   c'est ce dont a besoin une version testée par des joueurs. La passe de terrain du mainteneur est décrite dans
   [Passes de terrain](contribute.field-passes.md#playtesters).

<a name="sessions"></a>

## Les sessions : l'unité de reproduction

Le moteur enregistre chaque entrée depuis le début de la partie ou le chargement d'une sauvegarde (actions, carte,
changements de personnage, pas de script) avec les réponses données en route (réponses aux choix, tirages
aléatoires). En plus de *Partager la session*, le menu de sauvegarde du jeu, le panneau de dev et l'onglet Play du
Studio l'exportent en `<jeu>-session.json`. Le rapport de bug d'un testeur, c'est ce fichier et une capture d'écran.

```sh
# dans le dépôt du moteur
npm run replay -- session.json
npm run replay -- session.json --upTo=40 --json
```

`npm run replay` la rejoue sans affichage et imprime le journal, le journal sémantique (4.1.11) et l'état final. Il
sort avec 1 à la première entrée dont le résultat diffère de l'enregistrement, ou quand son journal sémantique diffère
de celui du fichier. `--upTo=N` s'arrête plus tôt ; `--json` est pour les scripts. Un projet créé n'a pas de commande
`replay` : jouez la session dans l'onglet Play du Studio
([Jouer et rejouer une session](studio.sessions.md)). La solution du solveur est aussi une session
(`npm run solve -- --json` donne `steps`), et c'est elle que `npm run e2e` tapote. Le format du fichier est dans
[Formats de fichiers](engine.file-formats.md).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

La commande finit par `N session(s) replayed in … s`, sans divergence. Avec `--out`, ouvrez `report.md` et
`heat.svg`. Avec `--strict` et des quotas, le code de sortie est 0.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `no playtests in games/<id>/playtests` | Le dossier est vide, ou les fichiers ne finissent pas par `.session.json` (l'export du menu de sauvegarde s'appelle `<jeu>-session.json`) | Utilisez *Partager la session*, ou renommez le fichier pour qu'il finisse par `.session.json`. |
| `✖ <fichier>: recorded on game "x", not "y"` (code 1) | La session d'un autre jeu | Déplacez-la dans le dossier de ce jeu. |
| `⚠ <fichier>: recorded with save version N, the game is at M` | La version de sauvegarde a changé depuis | Un avertissement : le rejeu peut diverger. |
| `… diverged (content changed since: re-record or delete)` | Le contenu a dépassé la session | Réenregistrez-la, ou supprimez-la. Avec `--strict`, c'est le code 1. |
| `✖ [<id>] field quotas missed: …` (code 1) | Moins de sessions, de parties finies ou de familles d'appareils que demandé | Récoltez plus de sessions, sur d'autres sortes d'appareils. |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Les fichiers de session que vous ajoutez dans `playtests/`. `--out` écrit dans le dossier que vous lui donnez
(`.cache/playtests` plus haut). Rien d'autre n'est écrit.

<a name="recovery"></a>

## Revenir en arrière

Une session est un simple fichier : supprimez-le, ou remplacez-le par un nouvel enregistrement. Rien d'autre n'en
dépend.

<a name="references"></a>

## Références

- [`tools/playtests.ts`](../../tools/playtests.ts), [`src/engine/tools/playtests.ts`](../../src/engine/tools/playtests.ts)
- [`tests/playtests.test.ts`](../../tests/playtests.test.ts)
- [Vérifier son jeu](create.checking.md), [Ce que prouve le solveur](create.solver-proofs.md)
- [Passes de terrain](contribute.field-passes.md#playtesters), [Confidentialité](play.privacy.md)
