# Concepts : révision, transaction, pan, bail, aperçu, build

Le Studio d'équipe emploie quelques mots dans ses messages, ses écrans et son API. Cette page dit ce que chacun veut
dire, pourquoi il existe, et où on le croise. Le code et l'interface sont en anglais : un *span* est un **pan**, un
*lease* est un **bail** (un verrou), une *preview* est un **aperçu** (une prévisualisation).

<a name="why"></a>

## Pourquoi ces concepts

Plusieurs personnes modifient une même copie vivante d'un jeu en même temps. Pour chaque changement, le serveur doit
répondre à trois questions : est-il bien arrivé (et une seule fois), quelle version chacun regarde-t-il, et qui a le
droit d'écrire quoi en ce moment. Chaque concept ci-dessous répond à l'une d'elles
([ADR 0025](../../docs/dev/adr/0025-studio-server.md)).

<a name="transaction"></a>

## Transaction (opération)

Chaque changement est une **opération** dans un journal : elle peut toucher plusieurs fichiers, et elle s'applique en
entier ou pas du tout. Ses nouveaux contenus sont stockés d'abord, le jeu est validé dans son état final (un changement
qui ajoute des erreurs de validation est refusé par une 422), puis l'opération est confirmée. Sur un Studio hébergé,
elle est confirmée par son commit PostgreSQL, une fois ses contenus dans le bucket.

Une écriture peut porter un **identifiant d'opération** (`x-studio-op`, 8 à 64 lettres, chiffres, `-` ou `_`). Une
nouvelle tentative avec le même identifiant reçoit la première réponse et n'est appliquée qu'une fois ; la réponse
revient avec `x-studio-replayed: 1`. Le Studio, la CLI et le MCP en envoient un à chaque écriture. Les réponses sont
gardées 7 jours, et ne sont rendues qu'au membre qui a écrit.

<a name="revision"></a>

## Révision et époque

Chaque opération confirmée fait passer le projet à la **révision** suivante, un nombre qui ne fait que croître.
`GET /api/revision` la donne avec l'**époque** du projet, un identifiant qui change quand l'histoire repart de zéro
(un nouvel import, une restauration). Une lecture répond avec la révision à laquelle elle a été faite, dans
`x-studio-revision` ; l'en-tête du Studio affiche « revision N ».

La **révision de base** est celle qu'un éditeur a lue avant d'écrire. Le Studio l'envoie avec chaque écriture
(`x-studio-base`) ; si quelqu'un d'autre a écrit l'un des mêmes fichiers depuis, l'écriture est refusée par une 409
(voir [Écriture refusée : révision de base périmée (409)](team.write-refused-409.md)).

<a name="span"></a>

## Pan

Chaque fichier du jeu appartient à exactement un **pan**, décidé par son chemin
([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts)) :

| Pan | Fichiers |
|---|---|
| `room:<id>` | `rooms/<id>.ts`, `layout/<id>.json` |
| `game`, `items`, `cast`, `rules` | `game.ts`, `items.ts`, `cast.ts`, `rules.ts` |
| `story` | `storyboard.json`, `storyboard.md`, `STORY.md`, `prompts.md` |
| `lang:<code>` | `locales/<code>.json` |
| `voices` | `voices.json` |
| `assets` | `art/`, `audio/`, `assets.gen.json`, `talk-kits.json`, `provenance.json`, `provenance.lock.json` |
| `notes` | `notes.json` |
| `groupings` | `groupings.json` (la carte du scénario) |
| `meta` | `index.ts`, `site.json`, `e2e.mjs`, `ending.config.example.ts`, `ids.paths.json`, `ids.migration.json`, `spans.json`, `audit-allow.json`, `tests/` |
| `playtests` | `playtests/`, `replays/` |
| `reality` | `reality/` |

Un fichier qu'aucune règle ne nomme est refusé (422) sur un Studio partagé, tant que le moteur ne lui a pas donné de
pan.

Les fichiers propres à un jeu (4.5.1), que le moteur ne peut pas connaître (les modules qu'importe son `index.ts`, ses
notes, ses scripts), prennent leur pan dans le `spans.json` du jeu, lui-même `meta` : un chemin, un dossier
(`minigames/`) ou un motif (`prompts-*.md`, `art-tools/**/*.py`), chacun avec un pan qu'un client peut prendre. Le
premier qui correspond l'emporte ; les règles du moteur ci-dessus passent avant, si bien qu'un jeu ne déplace jamais un
fichier du moteur, et une clé qui nomme littéralement un fichier ou un dossier du moteur (`cast.ts`, `art/`) est
refusée. Un fichier que ni l'un ni l'autre ne nomme est toujours refusé. Le fichier tient au plus 256 entrées d'au plus
256 caractères, en 64 Kio ; le Studio hébergé le relit quand il change et, tant qu'il est fautif, dit pourquoi et les
fichiers propres au jeu n'ont pas de pan, `spans.json` lui-même restant modifiable pour le réparer.

```json
{ "minigames/": "meta", "commands/": "meta", "swag.ts": "items", "prompts-*.md": "story", "art-tools/": "assets" }
```

<a name="lease"></a>

## Bail

Écrire un fichier vous donne son pan pour **120 secondes** : c'est un **bail**. Votre Studio renouvelle vos baux
toutes les 30 secondes tant qu'il est ouvert (le battement de présence). Tant que vous tenez un pan, l'écriture d'un
autre membre dedans est refusée par une 423 qui vous nomme (voir
[Écriture refusée : pan verrouillé (423)](team.write-refused-423.md)). Une écriture qui touche plusieurs pans les
prend tous ou aucun, sans attendre.

Vous pouvez aussi prendre un pan d'avance, pour réserver une salle, et le rendre, depuis le panneau *Spans*. Un owner
peut **reprendre un pan** : il devient le sien, la prochaine écriture de l'ancien détenteur y est refusée, et le
journal d'audit le note.

Chaque bail porte un **jeton de bail** (*fence*), un nombre qui grandit à chaque nouveau détenteur. Un script peut
renvoyer les jetons reçus (`x-studio-fences`) ; son écriture est alors refusée si son bail a expiré ou a été repris
entre-temps. Le Studio et le MCP n'envoient pas de jetons.

<a name="exclusive-lease"></a>

## Bail exclusif

Le pan `*` est le jeu entier. Son bail est **exclusif** : il n'est accordé que si personne d'autre ne tient de pan, et
il bloque toute autre écriture tant qu'il dure. Les jobs qui touchent à tout le prennent pour le membre qui les lance
et le rendent à la fin : Prepare et la découpe de planches (un dev), la montée de version du moteur et un import Git
(un owner). Un owner peut aussi le prendre et le rendre à la main.

<a name="preview"></a>

## Aperçu

Le jeu que vous voyez dans le Studio est l'**aperçu** d'une révision : après chaque modification, le worker construit
la tête (une rafale de modifications ne construit que sa dernière révision), et l'origine du jeu le sert à
`/preview/<rev>/`. Un aperçu ne change plus une fois construit. L'étiquette sous la vue de salle dit quelle révision
vous voyez, celle en construction, et une révision qui ne se construit pas. Voir
[Reprendre après un bail perdu, une déconnexion ou un aperçu périmé](team.recovery.md).

<a name="health"></a>

## Santé

Après chaque rafale de modifications, le worker juge la tête : le validateur, puis le solveur depuis une nouvelle
partie, 45 s au plus. L'en-tête affiche le verdict d'une révision. Un solveur interrompu dit « inconnu », jamais
« valide ». Voir [Routes de santé et de métriques](team.health-metrics.md#game-health).

<a name="build"></a>

## Build publié

Un **build** est le jeu du joueur à une révision, numéroté (`#n`), servi à `/play/<n>/` sur l'origine du jeu, et
jamais modifié. `/play/` mène toujours au dernier build vert. Voir [Publier des builds](team.builds.md).

<a name="job"></a>

## Job

Le travail long d'un Studio hébergé (Prepare, la découpe d'une planche, le détourage d'une cellule) tourne en **job** :
la requête répond 202 tout de suite, les états du job arrivent par le flux en direct, et on peut l'annuler tant qu'il
n'a pas commencé à écrire. Voir [Assets hébergés](team.hosted-assets.md#jobs).

<a name="roles"></a>

## Rôles

`owner`, `dev`, `reviewer` : lire revient au reviewer, écrire au dev, les membres et l'audit à l'owner. La matrice
complète est dans [Rôles et actions](team.roles.md).

> [!LIMIT id=hosted-only]
> Les pans, les baux, les aperçus, la santé, les builds publiés et les jobs n'existent que sur un Studio hébergé. Le
> Studio local n'a qu'un écrivain, aucun bail et pas d'aperçu par révision.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0025](../../docs/dev/adr/0025-studio-server.md) : transactions, un propriétaire par fichier, révisions.
- [ADR 0026](../../docs/dev/adr/0026-saves-across-revisions.md) : les sauvegardes d'une révision à l'autre.
- [Ce qui tourne où](team.what-runs-where.md) : les morceaux qui portent tout cela.
