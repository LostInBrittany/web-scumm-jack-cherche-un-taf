# Notes

L'onglet Notes est le journal partagé du jeu, `games/<id>/notes.json` : vous, vos collègues et n'importe quelle IA y
laissez des notes sur une case, un lieu, une entité ou n'importe quoi, et vous y répondez.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une note que l'IA lit avec `get_notes` (ou en lisant `notes.json`), sa réponse affichée en direct dans le Studio, et
toute la conversation gardée avec le jeu, dans git.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local, dépôt du moteur ou projet créé ; le Studio de démo garde ses notes dans le navigateur (et son patch).
Vrai depuis la 4.2.1. Un Studio hébergé ajoute des commentaires au même onglet ([Commentaires](team.comments.md)).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Notes (et en bas d'un lieu dans l'onglet Rooms, sous une case dans l'onglet
Storyboard).

<a name="steps"></a>

## Étapes

<!-- step: write -->
1. **Écrivez une note** dans la zone de saisie : **about** (un id de case, un id de lieu, `lieu.entité`, ou vide pour
   une note générale), **author** (`you` par défaut, et mémorisé), le texte. Ctrl/Cmd+Entrée l'ajoute. La note reçoit
   un id et l'heure (`at`, une date ISO) ; `notes.json` est créé à la première note.

<!-- step: read -->
2. **Lisez le journal.** Le journal entier, le plus récent d'abord, groupé par `about` : un lieu, une case ou une
   entité est étiqueté, avec « Open in Rooms » ou « Open in Storyboard ». Filtres : texte libre, about (lieux avec
   leurs entités, cases, autres), auteur. Chaque note montre son auteur et son heure.

<!-- step: answer -->
3. **Reply** préremplit `about` avec celui de la note ; **Edit** modifie une note sur place (texte débarrassé des
   espaces superflus, `edited` réglé à maintenant ; son heure, son auteur et sa place dans le journal inchangés) ;
   **Delete** la retire.

<!-- step: elsewhere -->
4. **Les notes là où vous travaillez.** Les notes sur un lieu ou une de ses entités apparaissent aussi en bas de la
   section de ce lieu dans l'onglet Rooms (« Notes (n) », avec une zone pour en ajouter une) ; les notes sur une case
   apparaissent sous la case dans l'onglet Storyboard.

<a name="with-an-ai"></a>

### Travailler avec une IA par les notes

- Un agent branché en MCP écrit des notes avec `add_note` ; son auteur est le nom du client MCP, sinon `ai`. Il les lit
  avec `get_notes` ([MCP local : configurer chaque client](studio.mcp-setup.md)).
- Une IA sans MCP modifie les fichiers ; le Studio se recharge (il surveille les fichiers), vous voyez le résultat et
  répondez dans Notes ou dans le Storyboard, et l'IA relit `notes.json`. Git porte l'historique.
- Sans clé d'API, **Send as a task to the AI agent** de l'Assistant écrit une note avec `task: true` ; l'onglet Notes
  l'étiquette « task » ([L'Assistant](studio.assistant.md#no-key-tasks)).

Le journal suit les changements sur le disque : une note qu'une IA écrit apparaît sans recharger.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

La note s'affiche en haut du journal, et `games/<id>/notes.json` la contient : `{ id, about, author, text, at, edited? }`.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| `` `text` is required `` (400) | Une note vide | Écrire quelque chose |
| `no such note: "<id>"` (404) | La note a été supprimée entre-temps (par vous, un collègue, une IA) | Recharger le journal |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`games/<id>/notes.json` seulement.

<a name="recovery"></a>

## Revenir en arrière

Undo dans l'en-tête ne couvre pas les notes ; une note supprimée revient avec git
(`git checkout -- games/<id>/notes.json`).

<a name="references"></a>

## Références

- [`src/studio/notes.ts`](../../src/studio/notes.ts) ; les opérations `getNotes`, `addNote`, `editNote`, `deleteNote`
  de [`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts).
- Les routes `GET/POST notes`, `PUT/DELETE notes/:id` : [API du Studio](studio.api.md). Travailler avec une IA en
  général : [Travailler avec une IA](create.working-with-ai.md).
