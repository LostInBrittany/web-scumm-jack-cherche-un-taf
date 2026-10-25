# Commentaires

Sur un Studio d'équipe, les membres commentent ce que le jeu nomme (une salle, une porte, un objet, une règle, une case
du storyboard) ou le jeu lui-même, en fils de discussion. Les commentaires sont gardés par le Studio, jamais dans un
fichier du jeu : un reviewer peut donc commenter aussi.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un fil ancré sur un identifiant stable du jeu, avec la révision où il a été écrit, auquel l'équipe répond, qu'elle
résout et rouvre ; et les anciennes notes de `notes.json` reprises en commentaires.

<a name="context-and-versions"></a>

## Contexte et versions

Un Studio hébergé (le Studio Server), depuis la 4.2.3. Le Studio local a des notes (`notes.json`), pas de commentaires.
Le code est [`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts).

<a name="prerequisites"></a>

## Prérequis

- N'importe quel rôle : un `reviewer` commente, répond et résout ses propres fils ; un `dev` ou un `owner` résout
  n'importe quel fil ; faire entrer les notes revient à un owner (voir
  [Rôles et actions](team.roles.md#matrix-comments)).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le Studio, l'onglet **Notes**, panneau **Comments**. Ou par l'API avec le jeton d'un membre.

<a name="steps"></a>

## Étapes

<!-- step: write -->
1. **Écrire un commentaire.** Dans le champ *about*, tapez ce dont il parle : l'identifiant d'une salle (`hall`), une
   entité (`hall.door`), un objet (`item:key`), un personnage (`char:lou`), l'identifiant d'une règle, un objectif
   (`objective:<id>`), un point de passage (`checkpoint:<id>`), ou l'identifiant d'une planche ou d'une case du
   storyboard. Laissez-le vide pour le jeu lui-même. Tapez le texte (1 à 4 000 caractères), puis **Comment**.

<!-- step: reply -->
2. **Répondre.** Sous un fil, tapez dans **Reply**. Un fil n'a qu'un niveau : la réponse à une réponse rejoint le même
   fil, sur son ancre.

<!-- step: resolve -->
3. **Résoudre, ou rouvrir.** **Resolve** ferme tout le fil ; **Open again** le rouvre.

<!-- step: import-notes -->
4. **Faire entrer les notes (owner).** **Bring the notes in** transforme chaque note de `notes.json` en commentaire,
   une seule fois : son `about` devient l'ancre quand c'est un identifiant, sinon la note rejoint le fil du jeu, son
   `about` en tête du texte. Le relancer ne fait entrer que les nouvelles notes. La réponse est `{imported, already}`.

Par l'API :

```sh
# n'importe où, avec le jeton d'un membre
curl -H "Authorization: Bearer $TOKEN" "https://studio.example.fr/api/comments?anchor=hall.door"
curl -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"anchor": "hall.door", "text": "The door should creak."}' https://studio.example.fr/api/comments
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"resolved": true}' https://studio.example.fr/api/comments/<id>
```

| Route | Fait |
|---|---|
| `GET /api/comments[?anchor=<id>]` | tous les commentaires (ou ceux d'une ancre), du plus ancien au plus récent, les 2 000 derniers au plus |
| `POST /api/comments` `{anchor?, text, parent?}` | un commentaire, ou une réponse avec `parent` (201) |
| `PUT /api/comments/<id>` `{text?, resolved?}` | son texte changé (par son auteur seulement), son fil résolu ou rouvert |
| `POST /api/comments/import-notes` | les notes de `notes.json`, chacune une fois (owner) |

Chaque commentaire a `id`, `anchor` (`''` pour le jeu), `rev` (la révision où il a été écrit), `parent`, `author`,
`text`, `resolved`, `at`, `edited`, et `orphan`.

<a name="rules"></a>

## Les règles

- **Un commentaire garde sa révision.** Il dit de quelle version du jeu il parlait.
- **Orphelin, jamais déplacé.** Un commentaire dont l'ancre n'est plus nommée par le jeu (une salle supprimée, un
  identifiant renommé) s'affiche « orphan: the game no longer names it » ; il n'est jamais rattaché ailleurs. Les
  ancres sont les salles, règles, scripts, entités, objectifs et points de passage du jeu, et les planches et cases du
  storyboard. **L'identifiant d'une ligne n'est pas une ancre.** Tant que le jeu ne se charge pas, aucun commentaire
  n'est dit orphelin.
- **Seul son auteur change son texte.** Le panneau du Studio n'a pas de bouton de modification : le texte se change
  par `PUT /api/comments/<id>` avec `text`.
- **Un reviewer résout ses propres fils** ; un dev ou un owner, n'importe lequel.
- **Gardés par le Studio** : dans sa base et dans ses sauvegardes, jamais dans un fichier du jeu ; aucun fichier du jeu
  n'est écrit, donc un commentaire ne demande aucun pan et n'est jamais refusé par une 423.

> [!GUARANTEE id=comment-author-edits]
> Seul son auteur change le texte d'un commentaire ; un fil se résout d'un bloc ; un reviewer ne résout que ses propres
> fils.

> [!LIMIT id=comments-limits]
> Un commentaire ne peut pas être supprimé (aucune route). Un membre garde 2 000 commentaires ouverts au plus (429
> au-delà : résolvez-en d'abord). La liste donne les 2 000 plus récents. Les commentaires ne sont ni dans le dépôt Git
> du jeu ni dans un export : ils vivent dans la base du Studio.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le fil apparaît dans le panneau Comments de chacun, sous son ancre, avec sa révision.
`GET /api/comments?anchor=<id>` le liste.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| `a comment is a text of 1 to 4000 characters` (400) | Vide ou trop long | Raccourcissez, ou coupez-le en deux |
| `an anchor is a stable id of the game (letters, digits, . : @ - _)` (400) | Des espaces ou d'autres caractères dans *about* | Mettez l'identifiant, pas une phrase |
| `only its author changes a comment's text` (403) | Le commentaire de quelqu'un d'autre | Répondez plutôt |
| `a reviewer resolves their own threads` (403) | Un reviewer sur le fil d'un autre | Demandez à un dev |
| `comments are a shared Studio's` (404) | Un Studio Server sans OIDC (mode local) | Les commentaires demandent un Studio d'équipe |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Des lignes de la table `studio_comments`. Aucun fichier du jeu, aucune révision.

<a name="recovery"></a>

## Revenir en arrière

Un fil résolu par erreur se rouvre. Un texte se corrige par son auteur. Rien d'autre ne s'annule.

<a name="references"></a>

## Références

- [Rôles et actions](team.roles.md#matrix-comments).
- [Les notes du Studio local](studio.notes.md).
- [`tests/studio-comments.test.ts`](../../tests/studio-comments.test.ts).
