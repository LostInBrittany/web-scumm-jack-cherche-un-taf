# Diff sémantique

« Changes between revisions », dans l'onglet Check, dit ce qui a changé entre deux révisions du jeu par ce que le jeu
nomme : les règles, lieux, répliques et valeurs ajoutés, supprimés ou modifiés, fichier par fichier, plutôt qu'un diff
de texte.

<a name="what-you-get"></a>

## Ce que vous obtenez

Pour deux numéros de révision, la liste des fichiers que les opérations du Studio entre elles ont changés, et dans
chacun les ids ajoutés, supprimés et modifiés (avec les champs qui ont changé), ou les chemins de valeurs JSON, ou
« file changed » quand il ne peut pas en dire plus.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local (`npm run studio`) et un Studio hébergé ; pas le Studio de démo (il n'a pas de journal). Depuis la
4.2.3. Sur un Studio hébergé, un build est une révision : on compare deux builds par les leurs
([Carte et diff sémantique](team.map-diff.md)).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)), avec des écritures faites par lui (ou par le serveur MCP, qui
  partage le journal).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Check, panneau **Changes between revisions**.

<a name="revisions"></a>

## Ce qu'est une révision ici

Chaque écriture dans le jeu est une opération de son journal (`.cache/studio-journal/`), numérotée : ce numéro est la
révision. Une écriture du Studio, une écriture MCP et une annulation en font chacune une ; un changement fait dehors
(un éditeur, git) est enregistré comme une opération à part avant que la prochaine écriture touche ce fichier. La
révision 0 est avant la première opération.

> [!LIMIT id=local-revision-numbers]
> Le Studio local n'affiche pas le numéro de la révision courante. Demander une révision au-delà de la dernière répond
> `no revision <n> yet` (404) : baissez le numéro jusqu'à ce qu'il réponde.

<a name="steps"></a>

## Étapes

<!-- step: numbers -->
1. Tapez deux révisions, **From** et **to** (nombres entiers, from ≤ to ; 2 000 d'écart au plus).

<!-- step: show -->
2. **Show the changes.** Pour chaque fichier que les opérations entre elles ont écrit, comparé aux deux bouts (son
   contenu avant la première de ces opérations, après la dernière) :
   - une source : les ids **ajoutés**, **supprimés** et **modifiés**, chaque id modifié avec les champs qui ont changé
     (ou « its place » quand seule sa position a bougé) ;
   - un fichier JSON : les chemins de valeurs ajoutés, supprimés et modifiés ;
   - tout le reste, ou un contenu qu'il ne sait pas lire : « file changed » ;
   - un fichier réécrit à l'identique : aucun changement.

<!-- step: captures -->
3. Pour voir les lieux que ces changements nomment, dessinés aux deux révisions : [Captures avant et après](studio.captures.md).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Une liste de fichiers avec ce qu'ils ont gagné et perdu, ou « Nothing changed between them. » Une liste de plus de 500
entrées finit par « … and more (cut at 500) » ; au-delà de 500 fichiers, « … and more files (cut at 500) ».

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| `two revisions, as numbers` | Un champ est vide ou n'est pas un nombre entier | Taper deux nombres |
| `from and to are revisions, from ≤ to` | From est après to | Les inverser |
| `2,000 revisions at most between from and to` | L'écart est trop grand | Le réduire |
| `no revision <n> yet` (404) | Le journal n'a pas atteint ce numéro | Le baisser |
| « file changed » pour une source connue | Un contenu que le journal local n'a pas gardé (un fichier adopté du dehors) | Comparer avec `git diff` |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Aucun : le diff ne fait que lire le journal. Le dossier `private/` du jeu en est exclu.

<a name="references"></a>

## Références

- [`tools/studio/semantic-diff.ts`](../../tools/studio/semantic-diff.ts), [`src/studio/diff-panel.ts`](../../src/studio/diff-panel.ts),
  l'opération `diff` de [`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts).
- La route `GET diff/<from>..<to>` : [API du Studio](studio.api.md).
