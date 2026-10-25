# Jouer et rejouer une session

L'onglet Play fait tourner le jeu dans un cadre à côté de son état en direct et de son journal, exporte ce que vous
avez joué en fichier de session, en rejoue un pour poser le jeu là où il finit, et, pour un jeu speedrun ou un jeu à
choix du héros, ajoute les panneaux qui vont avec.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un fichier de session (`<jeu>-session.json`) qui reproduit un bug, le jeu remis exactement là où un testeur s'est
arrêté, et le journal de ce que chaque action a répondu.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local, dépôt du moteur ou projet créé. Vrai depuis la 4.1.14 (le panneau speedrun) ; les aiguillages de
texte depuis la 4.3.0. Sur un Studio hébergé, le jeu tourne sur sa propre origine : le cadre le montre avec ses outils
de dev, et les panneaux qui lisent dans le cadre (état, journal, explication des règles, sessions, aiguillages) sont
retirés.

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Play. `npm run replay` se lance dans le dépôt du moteur.

<a name="steps"></a>

## Étapes

<!-- step: play -->
1. **Jouez dans le cadre.** Le jeu tourne avec ses outils de dev. À côté, l'**état** en direct : lieu, sac, flags, ce
   qui est débloqué, où sont les personnages mobiles, les scripts en cours, les joueurs. En dessous,
   l'[explication des règles](studio.rule-explainer.md).

<!-- step: journal -->
2. **Lisez le journal.** Ce que chaque action a répondu (une règle, une ligne de Regarder, un repli…), les événements
   émis et les écouteurs atteints, chaque pas de script, les personnages déplacés, les changements de joueur ;
   filtrable par sorte. Le moteur ne le garde qu'en mode dev (`Engine.trace`, les 200 dernières entrées).

<!-- step: export -->
3. **Export session** télécharge les entrées depuis le début de la partie, avec le journal : `<jeu>-session.json`. Ce
   fichier est un rapport de bug.

<!-- step: replay -->
4. **Replay…** charge un fichier de session : le moteur le joue en silence et le jeu se pose là où il finit. Un
   curseur parcourt les entrées (en toucher une y pose le jeu), et une divergence avec l'enregistrement est signalée.
   En ligne de commande, le même fichier se rejoue sans affichage, imprime le journal et l'état final, et sort en 1 là
   où le rejeu cesse de suivre l'enregistrement :

   ```sh
   # dans le dépôt du moteur
   npm run replay -- <jeu>-session.json
   ```

<a name="speedrun"></a>

### Le panneau speedrun

Pour un jeu qui déclare `speedrun` ([Speedrun pour les auteurs](create.speedrun.md)) : les catégories et leurs
règles ; les splits avec un éditeur (nom, déclencheur ; **+ split** ; **Write to the game** écrit le manifeste avec
`set_value` sur `@game`) ; **Preview on this session** (la session du cadre rejouée avec les splits de la catégorie :
les temps qu'un run enregistrerait) ; **Export route** / **Import route** (`.wsroute`) ; **Logical route (solver)**
(le témoin du solveur, jamais un record) ; les deux dernières routes comparées ; et **Export run (.wsrun)** une fois
une tentative du cadre scellée.

<a name="text-switches"></a>
<!-- applies: 4.3.0.. -->

### Aiguillages de texte : voir le jeu avec un autre héros

Pour un jeu dont les textes portent des aiguillages (`{form?m=…|f=…}`, `{hero}`), **Text switches** sous l'état
propose un menu par flag qu'un aiguillage lit ; ses valeurs sont celles que les aiguillages listent et celles qu'un
`set` littéral (ou le départ, un checkpoint) écrit. Un choix pose le flag dans le cadre (« unset » l'enlève) : le
lieu, la variante de sprite du héros, `{hero}` et chaque ligne montrent ce héros ; le nom du héros tel qu'affiché est
dans le titre. L'onglet Rooms lit ce même choix pour montrer un texte aiguillé tel qu'un joueur le lit
([Modifier une salle](studio.edit-room.md#text-switches)).

> [!LIMIT id=text-switches-local]
> Les aiguillages de texte sont propres au Studio local : le jeu d'un Studio hébergé tourne sur sa propre origine ;
> posez-y le flag dans le panneau DEV du jeu.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Après **Replay…**, le cadre montre le jeu là où finit la session et le curseur est sur sa dernière entrée ; aucune
divergence n'est signalée. `npm run replay` sort en 0.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| Une divergence est signalée au rejeu | Le contenu a changé depuis l'enregistrement de la session | Regarder l'entrée signalée : c'est là que le jeu répond autrement aujourd'hui |
| Le journal est vide | Personne n'a encore joué dans le cadre | Jouer dans le cadre |
| Ni état, ni journal, ni rejeu sur un Studio hébergé | Le jeu est sur une autre origine | Passer par un Studio local, ou le panneau DEV du jeu |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Aucun dans le jeu, sauf **Write to the game** du panneau speedrun (le manifeste `speedrun` du jeu, par `set_value`).
Sessions, routes et runs sont des téléchargements.

<a name="references"></a>

## Références

- [`src/studio/play.ts`](../../src/studio/play.ts), [`src/studio/speedrun-panel.ts`](../../src/studio/speedrun-panel.ts),
  [`src/studio/hero-picker.ts`](../../src/studio/hero-picker.ts), [`tools/replay.ts`](../../tools/replay.ts).
- [Playtests](create.playtests.md) (sessions partagées et cumulées), [Héros : plusieurs personnages et choix du héros](create.heroes.md).
