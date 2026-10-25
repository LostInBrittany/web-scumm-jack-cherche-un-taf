# Assets hébergés

Sur un Studio d'équipe, l'onglet **Assets** travaille sur le serveur : un reviewer lit la liste, les prompts et les
fichiers ; un dev téléverse des sons et des décors, découpe des planches de sprites, et prépare les images et les sons
du jeu, en jobs sur le worker. Cette page donne chaque action, ses bornes et ses routes.

<a name="what-you-get"></a>

## Ce que vous obtenez

De nouvelles images et de nouveaux sons dans le jeu hébergé, chacun écrit en une opération ; les images et sons
préparés que jouent chaque aperçu et chaque build ; et un travail long (découpes, Prepare) qui se suit et s'annule.

<a name="context-and-versions"></a>

## Contexte et versions

Un Studio hébergé avec son worker : Prepare depuis la 4.2.2, les uploads, les découpes de l'onglet Assets et les jobs
depuis la 4.2.3. Le code est
[`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts),
[`prepared.ts`](../../studio-server/src/server/prepared.ts) et [`jobs.ts`](../../studio-server/src/server/jobs.ts).
Sur un Studio local, voir [Assets et découpe](studio.assets.md).

<a name="prerequisites"></a>

## Prérequis

- `reviewer` pour lire, `dev` pour téléverser, découper et préparer (voir
  [Rôles et actions](team.roles.md#matrix-assets)).
- Le worker déployé avec ses paquets Python (son hook de build installe `requirements.txt`, empreintes vérifiées ;
  voir [Configuration](clever.configuration.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le Studio, l'onglet **Assets**, et l'onglet **Play** pour **Prepare assets**. Ou par l'API avec le jeton d'un
membre.

<a name="steps"></a>

## Étapes

<!-- step: upload -->
1. **Téléverser un son ou un décor** (un dev). Un son est une musique ou un effet (`kind`), un fichier `.ogg`, `.mp3`
   ou `.wav` dont les octets disent la même chose ; un décor est une image PNG ou JPEG. Il est écrit en une opération,
   jamais exécuté.

<!-- step: cut-sheet -->
2. **Découper une planche de sprites** (un dev). Téléversez la planche (une image PNG, JPEG ou WebP) avec son
   identifiant et sa grille (`6x4` par défaut). Les cellules qui existent déjà ne sont jamais redécoupées par accident :
   nommez les cellules à redécouper (`r1c1,r2c3`), ou téléversez dans un nouvel identifiant de planche. La découpe
   tourne sur le worker, en job.

<!-- step: key-cell -->
3. **Remplacer ou détourer une cellule** (un dev) : une image pour une cellule d'une planche, détourée (son fond rendu
   transparent) en `auto`, `always` ou `never`. C'est aussi un job.

<!-- step: prepare -->
4. **Préparer les assets** (un dev). Cliquez sur **Prepare assets** (onglet Play ou Assets). Le worker lance `prepare`
   sur l'art et les sons de la tête ; l'ensemble préparé est gardé par le Studio et servi avant `publicDir`, et le
   `assets.gen.json` du jeu est écrit en une opération. Chaque passe prépare tout à nouveau.

<!-- step: follow-job -->
5. **Suivre le job.** Une découpe, un détourage ou Prepare répond tout de suite (202) avec un job ; un petit panneau dit
   où il en est (« Cutting the sheet », « Keying the cell », « Preparing the assets ») avec un bouton **Cancel**.

<a name="jobs"></a>

## Les jobs

- La requête répond **202** avec le job. Ses états vont au flux en direct (événements `job`, dans l'ordre : `queued`,
  `running` avec ses étapes `packing`, `on the worker`, `writing`, puis `done`, `failed` ou `cancelled`), et
  `GET /api/jobs/<id>` le relit (la page le fait quand le flux est coupé).
- **Un seul tourne à la fois ; quatre autres peuvent attendre** (429 au-delà).
- **Annuler** (`POST /api/jobs/<id>/cancel`, qui l'a lancé, ou un owner) : un job en attente ne tourne jamais ; un job
  en cours voit sa requête au worker fermée, et le worker tue son processus enfant avec son groupe ; rien n'est écrit
  (aucune opération, aucun ensemble préparé gardé) et le bail exclusif est rendu. Un job qui écrit ne s'annule plus
  (409).
- Un job vit dans la mémoire de l'instance : après un redémarrage son état est perdu (son écriture, si elle a eu lieu,
  est dans le journal).
- Les découpes et Prepare tournent **sous le bail exclusif** du membre qui les a lancés : personne n'écrit pendant ce
  temps, et le pan d'un autre les refuse, avec son nom (le job échoue avec cette 423).

<a name="routes"></a>

## Routes

| Route | Corps | Fait |
|---|---|---|
| `GET /api/assets` | | la liste |
| `GET /api/assets/prompts[?missing=1]` | | les prompts d'images (seulement les images pas encore découpées avec `missing=1`) |
| `GET /api/assets/file/<chemin>` | | un fichier de membre de `art/` ou `audio/`, servi avec son propre type, jamais exécuté |
| `GET /api/assets/prepared` | | les passes de préparation |
| `POST /api/assets/sound` | `{kind: "music" \| "sfx", file, data}` | un upload (200, avec la révision) |
| `POST /api/assets/decor` | `{name, data}` | un upload (200) |
| `POST /api/assets/sheet` | `{sheetId, grid?, cells?, data}` | une découpe, en job (202) |
| `POST /api/assets/cell` | `{sheetId, cell, data, key?: "auto" \| "always" \| "never"}` | un détourage, en job (202) |
| `POST /api/assets/prepare` | | Prepare, en job (202) |
| `GET /api/jobs/<id>`, `POST /api/jobs/<id>/cancel` | | un job relu, annulé |

`data` est le fichier en base64 (une data URL est acceptée).

<a name="bounds"></a>

## Bornes

> [!LIMIT id=upload-bounds]
> Un upload fait 10 Mio au plus une fois décodé (413 au-delà). Son type se lit dans ses octets : une image PNG, JPEG ou
> WebP (un décor : PNG ou JPEG), un son Ogg, MP3 ou WAV dont l'extension dit la même chose (415 sinon). Un Studio local
> prend aussi les sons M4A, FLAC, AAC, Opus et WebM.

> [!LIMIT id=cut-on-worker]
> La découpe d'une planche et le détourage d'une cellule tournent sur le worker (jobs `cut`, Python avec les paquets du
> hook, aucun code du jeu). Le worker reçoit l'image, les cellules de cette planche et `site.json`, et ne rend que des
> cellules de cette planche ; les cellules, avec les sauvegardes de celles redécoupées, sont écrites en une opération.
> Un Studio hébergé ne garde pas la planche téléversée elle-même (un Studio local la garde sous `private/sheets/`,
> qu'aucun pan ne nomme).

> [!LIMIT id=prepare-bounds]
> Prepare tourne en 2 minutes au plus. Il est refusé, et le jeu se prépare sur un Studio local, quand son art et ses sons
> dépassent environ 31 Mio (en base64) ou les fichiers préparés environ 22 Mio ; quand il nomme ses sources dans
> `sources.json` (elles vivent hors de l'art et des sons que garde un Studio hébergé) ; ou quand le nouveau manifeste
> perdrait une image ou un son que le jeu avait. Les builds publiés servent l'ensemble préparé tel qu'il est
> maintenant, pas celui contre lequel ils ont été construits. Le code du jeu tourne sur le worker sous l'utilisateur
> des outils d'assets (ADR 0028 : une machine, un utilisateur).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Un upload ou une découpe ajoute une révision (l'en-tête avance) ; la liste montre les nouveaux fichiers. Après
Prepare, les aperçus construits ensuite jouent les nouvelles images et les nouveaux sons, et
`GET /api/assets/prepared` liste la passe.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| `an upload is 10 MiB at most` (413) | Trop gros | Compressez ou découpez |
| `a sound on a hosted Studio is an .ogg, .mp3 or .wav file` (415) | Un autre format | Convertissez-le |
| `the file is not MP3 sound: its bytes say otherwise` (415) | L'extension ment | Corrigez le fichier |
| `a decor is a PNG or a JPEG image` (415) | Un décor WebP ou autre | Convertissez-le |
| `N cell(s) of "<planche>" already exist: name the cells to recut (cells), or upload into a new sheet id` (409) | Des cellules existent | Nommez les cellules, ou prenez un nouvel identifiant |
| `too many jobs are waiting: try again when one is done` (429) | Déjà cinq jobs | Attendez |
| `the assets are being prepared: try again when it is done` (429) | Prepare tourne déjà | Attendez |
| `refused: the prepared assets would lose N image(s) or sound(s) the game had (…)` (422) | Les outils d'assets ne les ont pas trouvés | Préparez sur un Studio local |
| `this game names its sources in sources.json: prepare its assets on a local Studio` | `sources.json` | Préparez en local |
| `too late: the job is writing its result` (409) | Annulation après le début de l'écriture | Défaites le résultat s'il le faut |
| `preparing the assets needs a hosted Studio with its processing worker` (404) | Pas de worker | Configurez le worker |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`art/`, `audio/` (pan `assets`), les sauvegardes des cellules redécoupées, `assets.gen.json` ; l'ensemble préparé dans
le bucket et une ligne de `studio_prepared`.

<a name="recovery"></a>

## Revenir en arrière

Les uploads, les découpes et Prepare sont écrits sans annulation. Un fichier remplacé par un upload ou une découpe est
gardé en sauvegarde (la réponse le nomme, `backup` ou `backups`) : pour revenir en arrière, téléversez de nouveau ce
fichier, ou préparez de nouveau. Un retour du jeu entier passe par une restauration (voir
[Sauvegardes](clever.backups.md)).

<a name="references"></a>

## Références

- [ADR 0028](../../docs/dev/adr/0028-studio-content-execution.md).
- [`tests/studio-assets-hosted.test.ts`](../../tests/studio-assets-hosted.test.ts), [`tests/studio-prepared.test.ts`](../../tests/studio-prepared.test.ts).
