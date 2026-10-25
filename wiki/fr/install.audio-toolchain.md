# Outils audio : ffmpeg, fluidsynth, Furnace, uv

`npm run audio` est la chaîne Mega Drive du dépôt du moteur : elle transforme un MIDI (ou un fichier audio) en
arrangement Sega Mega Drive (FM YM2612, PSG SN76489 et batterie DAC) et synthétise les bruitages d'un jeu depuis la
même banque de sons, si bien que chaque piste et chaque blip d'un jeu partagent une identité sonore. Cette page
installe ce sur quoi elle tourne. Comment écrire une piste, la palette et la spec : voir [Musique](create.music.md) et
[Bruitages](create.sound-effects.md).

<a name="what-you-get"></a>

## Ce que vous obtenez

Une machine où `npm run audio -- setup` a téléchargé Furnace et une SoundFont General MIDI, et où la chaîne fait le
rendu d'une spec en `.fur`, `.wav`, `.vgm` et `.mp3` avec son rapport de QA. En option, un environnement virtuel
Python 3.11 qui transcrit des sources audio en MIDI.

<a name="context-and-versions"></a>

## Contexte et versions

- Le **dépôt du moteur**. `npm run audio` est un script de son `package.json` (`python3 tools/audio.py`, qui lance
  `tools/audio/mdpipe`) ; `quest-n-click` n'a pas de commande `audio` pour un projet créé.
- Furnace est épinglé en **0.6.8.3** (`FURNACE_VERSION` dans `tools/audio/mdpipe/render.py`).
- La chaîne est un outil d'auteur, pas une partie du jeu : un jeu joue les `.mp3` qu'elle a produits.

> [!LIMIT id=audio-repository-only]
> La chaîne n'est proposée que dans le dépôt du moteur. Ses fichiers sont dans le paquet du moteur
> (`node_modules/@quest-n-click/engine/tools/audio/`), mais aucune commande d'un projet créé ne la lance, et la lancer de là n'a
> pas été vérifié.

<a name="prerequisites"></a>

## Prérequis

| Outil | Sert à | Installer |
|---|---|---|
| Python 3 avec NumPy | chaque commande | `python3 -m pip install --require-hashes -r requirements.txt` ([Prérequis](install.requirements.md#python)) |
| ffmpeg | encoder les `.mp3`, la loudness | `brew install ffmpeg`, ou le paquet de votre système |
| fluidsynth | le rendu de référence General MIDI, pour comparer avec l'arrangement | `brew install fluid-synth`, ou le paquet de votre système |
| curl | les téléchargements de `setup` | en général déjà là |
| Furnace 0.6.8.3 | le rendu de l'arrangement (`.wav`, `.wav` par canal, `.vgm`) | `npm run audio -- setup` sous macOS et Linux (plus bas) |
| `uv` et Python 3.11 | les sources audio (un `.wav`, `.mp3`, `.flac` transcrit en MIDI) | optionnel, étape 3 |

<a name="where-to-run"></a>

## Où lancer les commandes

À la racine du dépôt du moteur, sur votre machine.

<a name="steps"></a>

## Étapes

<!-- step: system-tools -->
1. Installez ffmpeg et fluidsynth (macOS avec Homebrew) :

   ```bash
   # n'importe où
   brew install ffmpeg fluid-synth
   ```

<!-- step: setup -->
2. Téléchargez Furnace et la SoundFont, une fois par machine :

   ```bash
   # à la racine du dépôt du moteur
   npm run audio -- setup
   ```

   Sous macOS, il télécharge le `.dmg` de Furnace pour votre processeur (arm64 ou Intel) depuis la release GitHub de
   Furnace, copie `Furnace.app` et lève sa quarantaine ; sous Linux, il télécharge le `.tar.gz` x86_64. Les deux vont
   dans `tools/audio/.furnace/` (ignoré par git). La SoundFont est `GeneralUser-GS.sf2`, téléchargée à côté. Il affiche
   les deux chemins à la fin.

<!-- step: audio-sources-venv -->
3. En option, pour les sources audio (pas MIDI) : un environnement virtuel Python 3.11 avec les modules de
   transcription (`basic-pitch`, NumPy ; `demucs` est optionnel, lourd, et tire `torch`) :

   ```bash
   # à la racine du dépôt du moteur
   uv venv --python 3.11 tools/audio/.venv
   uv pip install --python tools/audio/.venv/bin/python -r tools/audio/requirements-audio.txt
   ```

   `npm run audio` appelle `python3`, qui ne voit pas cet environnement. Pour une source audio, lancez la chaîne avec le
   Python de l'environnement (ou activez-le d'abord) :

   ```bash
   # à la racine du dépôt du moteur
   tools/audio/.venv/bin/python tools/audio.py ingest song.wav games/<id>/audio/projects/<slug>
   ```

<!-- step: first-render -->
4. Lancez la chaîne une première fois :

   ```bash
   # à la racine du dépôt du moteur
   npm run audio -- ingest song.mid games/<id>/audio/projects/<slug>   # MIDI (ou .wav/.mp3, étape 3)
   npm run audio -- all games/<id>/audio/projects/<slug>/spec.json     # .fur + .wav + .vgm + .mp3 + rapport QA
   npm run audio -- sfx games/<id>/audio/sfx.json                      # les bruitages du jeu → audio/sfx/*.mp3
   npm run assets                                                      # publie audio/ dans public/assets
   ```

<a name="furnace"></a>

## Furnace

### Où la chaîne le trouve

Dans cet ordre : la variable [`FURNACE_BIN`](reference.environment-variables.md#furnace-bin), puis
`tools/audio/.furnace/Furnace.app/Contents/MacOS/Furnace`, `tools/audio/.furnace/furnace`, puis un `furnace` dans
votre `PATH`. Rien trouvé : `Furnace not found: run python -m mdpipe setup or set FURNACE_BIN`.

### Sous Windows

`setup` ne télécharge pas Furnace sous Windows (Furnace y est livré en zip) : il s'arrête sur
`mdpipe: install Furnace 0.6.8.3 yourself on Windows and put its executable in …/tools/audio/.furnace (the Mega Drive
pipeline downloads it on macOS and Linux only)`. Installez vous-même cette version et mettez son exécutable à cet
endroit, ou nommez-le avec `FURNACE_BIN`. Le reste de la chaîne ne change pas.

### Licence

Furnace est sous GPL-2.0 : il est téléchargé sur votre machine, jamais livré avec le moteur ni avec un jeu.

### Matériel et Furnace (géré dans le code)

Furnace joue les canaux tonals du SN76489 deux octaves au-dessus de la note écrite ; le constructeur compense, les specs
utilisent donc les vraies hauteurs (garder les notes PSG ≥ A2). Le DAC n'a pas de volume : les nuances sont des
échantillons séparés (`snare` / `ghost`). Une note par canal, quatre effets par cellule, des lignes de triple croche à
60 Hz avec un groove pour le tempo.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`setup` se termine par `Furnace: <chemin>` et `SoundFont: <chemin>`. `all` écrit le `.fur`, le `.wav`, le `.vgm` et le
`.mp3` de la spec et son rapport de QA dans le dossier du projet. `npm run doctor` dit si ffmpeg est là ; il ne vérifie
ni fluidsynth, ni Furnace, ni `uv`.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `Furnace not found: run python -m mdpipe setup or set FURNACE_BIN` | Étape 2 pas faite, ou Windows | L'étape 2, ou `FURNACE_BIN=<chemin de furnace>` |
| `needs fluidsynth (brew install fluid-synth) and python -m mdpipe setup for the SoundFont` | fluidsynth ou la SoundFont manque | Étapes 1 et 2 |
| `missing "basic_pitch": pip install "basic-pitch[onnx]" (python <= 3.11 recommended)` | Une source audio lancée sans l'environnement de l'étape 3 | L'étape 3, et `ingest` lancé avec `tools/audio/.venv/bin/python` |
| `ffmpeg` introuvable | ffmpeg absent du `PATH` | Étape 1 |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`tools/audio/.furnace/` (Furnace et la SoundFont) et `tools/audio/.venv/`, tous deux hors de git ; les dossiers de
projets sous `games/<id>/audio/projects/`, et `games/<id>/audio/sfx/*.mp3` pour les bruitages.

<a name="recovery"></a>

## Reprise ou retour arrière

Supprimez `tools/audio/.furnace/` et `tools/audio/.venv/` ; `setup` retélécharge Furnace.

<a name="references"></a>

## Références

- [Musique](create.music.md) (la palette, la spec, la démarche), [Bruitages](create.sound-effects.md)
- [Prérequis](install.requirements.md), [Outils pour les images](install.image-toolchain.md)
- [`tools/audio/README.md`](../../tools/audio/README.md), [`tools/audio/mdpipe/render.py`](../../tools/audio/mdpipe/render.py),
  [`tools/audio/requirements-audio.txt`](../../tools/audio/requirements-audio.txt)
