# Musique en stems

Un jeu nomme ses morceaux par id dans `audio.music` et les joue avec `titleScreen.music`, le `music` d’un lieu ou la
commande `music`. Cette page dit d’où viennent ces fichiers : la chaîne audio du dépôt du moteur transforme un MIDI en
arrangement Sega Mega Drive, le rend, le contrôle, et peut le découper en stems que le jeu remixe pendant la partie.
C’est aussi la référence de `audio.scores` et `audio.transitions`.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un morceau dans `games/<id>/audio/music/`, déclaré dans `audio.music`, qui sonne comme le reste du jeu (la même palette
que les bruitages), avec un rapport QA qui dit `ISSUES: none` ; en option, ses stems et une partition dont le mix suit
l’état du jeu.

<a name="context-and-versions"></a>

## Contexte et versions

- La chaîne (`npm run audio`) ne tourne que dans le **dépôt du moteur**. Un projet créé n’a pas de commande `audio`
  (`npx quest-n-click help` n’en liste pas) : rendez le morceau dans un clone du dépôt du moteur, puis copiez le `.mp3`
  (et ses stems) dans le `game/audio/music/` du projet.
- Déclarer et jouer la musique (`audio.music`, `audio.scores`, `audio.transitions`) se fait de la même façon dans les
  deux.
- Les stems et le directeur musical existent depuis la 3.5, les transitions entre partitions depuis la 3.6, la musique
  reprise depuis une sauvegarde depuis la 3.6.1. Cette page est vraie à partir de la 4.2.5 (le nom de commande
  `quest-n-click`).

<a name="prerequisites"></a>

## Prérequis

- Python 3 avec numpy, `ffmpeg` et `fluidsynth` (`brew install ffmpeg fluid-synth` sur macOS). Voir
  [Outils audio](install.audio-toolchain.md).
- Furnace 0.6.8.3, téléchargé par `npm run audio -- setup` dans `tools/audio/.furnace` (hors dépôt). Sur un système que
  `setup` ne couvre pas, installez Furnace vous-même et faites pointer `FURNACE_BIN` dessus.
- Pour une source audio (pas un MIDI) seulement : un environnement virtuel Python 3.11 pour la transcription (voir
  [Sources audio](#audio-sources)).

<a name="where-to-run"></a>

## Où lancer les commandes

À la racine du dépôt du moteur, sur votre machine. `<id>` est le dossier du jeu sous `games/`, `<slug>` le nom du
projet.

<a name="one-palette"></a>

## Une chaîne, une identité sonore

`tools/audio` transforme un MIDI (ou un fichier audio) en arrangement **Sega Mega Drive** : FM YM2612, PSG SN76489 et
batterie DAC. Il synthétise les bruitages depuis la même banque de sons : chaque piste et chaque blip d’un jeu partagent
une identité, comme `npm run prompts` donne un style à chaque image. Les décisions sont un fichier JSON (`spec.json`),
le reste est du code : un assistant IA ou une personne suit les mêmes étapes.

```bash
npm run audio -- setup                                              # une fois par machine : Furnace 0.6.8.3 + une SoundFont GM
npm run audio -- ingest song.mid games/<id>/audio/projects/<slug>   # MIDI (ou .wav/.mp3 : voir « Sources audio »)
npm run audio -- all games/<id>/audio/projects/<slug>/spec.json     # .fur + .wav + .vgm + .mp3 + rapport QA
npm run audio -- sfx games/<id>/audio/sfx.json                      # les bruitages du jeu → audio/sfx/*.mp3
npm run assets                                                      # publie audio/ dans public/assets
```

Les autres sous-commandes : `analyze <fichier.mid> [--dump N] [--drums N]`, `transcribe <audio> -o <sortie.mid>
[--bpm N] [--no-separate]`, `build <spec.json>` (le `.fur` seul), `qa <spec.json>` (le rapport seul),
`stems <spec.json> [--out <dossier>]`. Les bruitages ont leur page : [Bruitages](create.sound-effects.md).

<a name="rules"></a>

## Les règles

1. **Les sources.** La source d’un morceau doit être à vous, dans le domaine public, ou sous une licence qui autorise
   une œuvre dérivée (un MIDI d’une pièce du XIXᵉ siècle, oui ; un thème de film, non). Dites d’où elle vient dans
   `spec.json` (`author`, `comment`), dans un `SOURCE.md` à côté de `source.mid`, et dans `CREDITS.md`. Une
   transcription a sa propre licence, et l’arrangement en hérite. Le thème du jeu d’exemple est le *Lac des cygnes* de
   Tchaïkovski (domaine public), ses notes écrites pour le projet par un script
   (`games/demo/audio/projects/swan-theme/compose.py` écrit `source.mid`) : aucune transcription dont hériter, donc
   CC BY 4.0, et un jeu peut être vendu avec (3.7 ; le thème d’avant venait d’un MIDI en CC BY-NC). Les licences en
   général : [Licences et crédits](contribute.licences.md).
2. **Une seule palette.** [`tools/audio/palette.json`](../../tools/audio/palette.json) contient les patches FM, les
   enveloppes PSG, le kit de batterie DAC et les cibles de mix. Chaque projet et chaque bruitage s’y construisent. Un
   son manquant est un nouveau patch dans la palette (avec un `desc`), jamais un patch ad hoc dans un spec ; un patch
   dont dépendent des morceaux livrés ne se modifie pas (on en ajoute un, ou on incrémente `version`).
3. **Réorchestrer, jamais convertir piste par piste.** Garder la mélodie, l’harmonie qui compte, la structure et le
   tempo ; réduire la polyphonie à dessein (fusionner les doublures, retirer les voix intérieures, transformer les
   accords tenus en arpèges).
4. **Une construction est finie quand le rapport QA dit `ISSUES: none`.** Il mesure les niveaux par rapport aux cibles
   de la palette, la justesse et la saturation.
5. **Les fichiers rendus sont commités** (`audio/music/*.mp3`, `audio/sfx/*.mp3`, le `spec.json` du projet,
   `source.mid`, `analysis.md`, `qa.txt`) ; les intermédiaires lourds non (`out/*.wav`, `reference.wav`).

> [!LIMIT id=qa-does-not-listen]
> Le rapport QA mesure ; il n’écoute pas. Une construction à `ISSUES: none` peut encore sonner faux : dites-le, et
> dites à la personne quoi vérifier à l’oreille (équilibre lead / basse, niveau de l’écho, répartition stéréo).

<a name="workflow"></a>

## Étapes

<!-- step: ingest -->
1. **Importer.** Copiez la source dans un nouveau projet :

   ```sh
   # dans le dépôt du moteur
   npm run audio -- ingest song.mid games/<id>/audio/projects/<slug>
   ```

   La commande copie le MIDI en `source.mid`, écrit `analysis.md` et `analysis.json` (pistes, tessitures, polyphonie,
   doublures détectées, une carte d’activité mesure par mesure qui fait apparaître les sections, changements de tempo
   et de mesure), un squelette de `spec.json` (dix canaux avec leurs rôles par défaut, et une table de batterie quand
   une piste est une batterie), et rend `reference.wav` avec une SoundFont GM pour comparer.

<!-- step: analyse -->
2. **Analyser.** Lisez `analysis.md` en entier. Décidez ce qui est essentiel (mélodie, basse, riffs qui définissent
   le morceau, rythme harmonique) et ce qui peut partir. Une construction ne gère pas les changements de tempo : coupez
   le morceau à un changement (`bars`), ou faites un projet par section.
   `npm run audio -- analyze source.mid --dump N` liste les notes de la piste N mesure par mesure.

<!-- step: arrange -->
3. **Arranger : écrire `spec.json`.** Le plan de canaux par défaut, à adapter et justifier :

   | Canal | Rôle (`role` = cible QA) | Contenu typique |
   |---|---|---|
   | FM1 | lead | la mélodie (`lead_brass`, `synth_lead`, `bright_strings`) |
   | FM2 | double, pan L | la mélodie à l’octave sur un patch contrasté, désaccordé (`fx_init: [["E5", "86"]]`) |
   | FM3 | bass | la voix la plus grave (`slap_bass`, `finger_bass`) |
   | FM4 | harmony | cor / contre-chant / voix d’accord ; le patch peut changer par section |
   | FM5 | counter, pan R | une ligne secondaire, une note d’accord |
   | FM6 | drums (DAC) | grosse caisse / caisse claire / toms ; une partie FM s’il n’y a pas de batterie |
   | PSG1 | echo | la mélodie retardée `delay_rows: 4` à vol ~8 |
   | PSG2 | arp | `type: arp` (`00 7C` arpèges de quinte, `00 37` / `00 47` mineur / majeur) |
   | PSG3 | accent | mordant de cuivres +12, une note d’accord |
   | NOISE | noise | charleys, charley ouvert, crash |

   Famille GM → palette : cuivres → `lead_brass` ; cor / trombone / tuba → `horn_section` ; cordes / nappes →
   `bright_strings` ou `soft_pad` ; piano → `e_piano` ; mailloches / cloches → `bell` ; orgue → `organ` ; guitare
   saturée → `power_guitar` (lui donner l’octave basse : elle ajoute l’octave et la quinte) ; guitare claire →
   `muted_pluck` ; basse → `slap_bass` (chargée) ou `finger_bass` (tenue) ; lead synthé → `synth_lead` ; coups
   d’orchestre → `orch_hit`.

   Les champs sont dans [La référence du spec](#spec-reference) plus bas ;
   `games/demo/audio/projects/swan-theme/spec.json` est un exemple complet.

<!-- step: build -->
4. **Construire, rendre, contrôler, recommencer.**

   ```sh
   # dans le dépôt du moteur
   npm run audio -- all games/<id>/audio/projects/<slug>/spec.json
   ```

   La commande écrit `out/<slug>.fur` (éditable dans Furnace), `.wav`, `.vgm` (émulateurs, lecteurs sur vraie
   console), `.mp3` (−14 LUFS), `<slug>_patterns.txt` et `qa.txt`. Corrigez ce que liste `ISSUES` et reconstruisez :
   un niveau hors cible → le `vol` de la partie (FM : un pas ≈ 0,75 dB en haut de l’échelle, davantage plus bas ;
   PSG : un pas = 2 dB) ; une justesse faible → un `transpose` faux, deux parties qui se chevauchent sur un canal, ou
   `voice` qui prend la mauvaise ligne ; `note collision` → deux notes sur une ligne.

<!-- step: deliver -->
5. **Livrer.** Copiez `out/<slug>.mp3` dans `games/<id>/audio/music/<id>.mp3`, déclarez-le dans `audio.music`,
   jouez-le (`titleScreen.music`, le `music` d’un lieu, une commande `music`), puis publiez-le :

   ```sh
   # dans le dépôt du moteur
   npm run assets
   ```

   Dites à la personne quel canal joue quoi, quelles libertés l’arrangement a prises, et quoi vérifier à l’oreille.

<a name="spec-reference"></a>

### La référence du spec

- Haut niveau : `title`, `author`, `comment`, `slug`, `source`, `bars` (combien de mesures construire),
  `rows_per_beat` (8 = lignes de triple croche), `pattern_rows` (64), `hz` (60), `extra_bars` (résonance),
  `stop_at_end`, `sections` `{ nom: [première, dernière] }`, `bpm` (forçage), `stems` (voir [Stems](#stems)).
- `channels.<CH>` : `name`, `role`, `pan` (`L` / `R` / `C`, FM seulement), `fx_init` `[["E5", "86"]]`,
  `fx` `[["mesure:temps", "04", "00"]]`, `parts`.
- Une partie : `track` (un index, un fragment de nom, ou une liste à fusionner), `voice` (`high` / `low` / `latest` /
  `rankN`), `bars` (`[a, b]`, un nom de section, ou une liste des deux) ou `from` / `to` (`"mesure:temps"`),
  `exclude_bars`, `ins` (clé de la palette), `vol` (FM 0–127, PSG 0–15), `weak_vol` (accent hors temps),
  `accent_long`, `transpose`, `delay_rows`, `vibrato` (hex `"34"`, sur les notes ≥ 1,5 temps), `offs`.
- Une partie arpège : `type: "arp"`, `root_track`, `voice`, `bars`, `every_rows`, `transpose`, `arp` (hex xy), `ins`,
  `vol`, `weak_vol`.
- `drums` : `track`, `dac`, `noise`, `accent: "beat"`, `map` (note GM → `kick` / `snare` / `ghost` / `tom:G3` / `hat` /
  `ohat` / `crash` / `noise_snare`), `hat_fill`, `extra_crash`, `noise_vols`.
- `extras` : notes isolées pour les fins et les coups `{ ch, at: "mesure:temps", note: "C5", beats, ins, vol }`.

Ce que le constructeur gère du matériel à votre place (l’octave du PSG dans Furnace, le DAC sans volume) est sur
[Outils audio](install.audio-toolchain.md#furnace).

<a name="audio-sources"></a>

### Sources audio

Un `.wav`, `.mp3`, `.flac` (ou `.ogg`, `.m4a`, `.aac`, `.aif`, `.aiff`, `.opus`) est d’abord transcrit en MIDI par
basic-pitch. Il faut un environnement virtuel Python 3.11, créé une fois :

```sh
# dans le dépôt du moteur
uv venv --python 3.11 tools/audio/.venv && uv pip install --python tools/audio/.venv/bin/python -r tools/audio/requirements-audio.txt
```

La séparation en pistes par demucs est optionnelle et lourde (`transcribe --no-separate` la saute). Le résultat est un
brouillon : gardez la mélodie, la basse et les fondamentales des accords, supprimez les notes fantômes, vérifiez le
tempo (`--bpm`), réécrivez la batterie en motif. Préférez un MIDI quand il existe.

<a name="stems"></a>

## Les stems et le directeur musical

Un morceau de `audio.music` peut aussi avoir une **partition** : ses stems (des pistes séparées), joués ensemble par
le directeur musical, le mix suivant le jeu : il change selon la salle, un drapeau ou le personnage actif
([`audio.scores`](#audio-scores)).

```sh
# dans le dépôt du moteur
npm run audio -- stems games/<id>/audio/projects/<slug>/spec.json
```

La commande rend l’arrangement canal par canal (la sortie par canal de Furnace) et additionne les canaux en stems :
les `"stems": { "<nom>": ["FM1", "PSG1"], … }` du spec ou, sans eux, par rôle de canal (melody : lead et echo ;
harmony : double, harmony, counter, accent, arp ; bass ; drums : le DAC et le bruit). Chaque stem vient du même rendu :
tous ont la même longueur et le même départ, et leur somme est le mix. Un seul gain, le même pour chaque stem, amène la
somme à −14 LUFS : jamais une normalisation par stem, l’équilibre est celui de l’arrangement. Elle écrit
`games/<id>/audio/music/<slug>-stems/<stem>.mp3` (ou `--out <dossier>`) et un `score.json` à coller sous
`audio.scores`, sous l’id du mix unique. Le tempo y est mesuré sur le rendu (mesures × temps sur sa durée) ;
`pcmBytes` est le poids décodé des stems à 48 kHz.

Regroupez les canaux selon ce que le jeu allumera ou éteindra : le thème du jeu d’exemple a mélodie, cordes, harpe et
basse, et ne joue que la harpe et la basse quand Biscuit est actif. Un stem presque muet (un canal de bruit seul,
−54 LUFS) est un téléchargement perdu : fondez-le dans un autre.

Des stems faits à la main sont bienvenus ; `npm run validate -- --release` les mesure avec ffprobe (3.6). Chaque stem
doit avoir la même fréquence, les mêmes canaux et le même nombre d’échantillons, la boucle doit finir dans les
fichiers, et `pcmBytes` doit être leur poids décodé (1 % de marge pour le remplissage d’un encodeur).

> [!GUARANTEE id=stems-consistent]
> Le contrôle des stems signale des stems qui se décaleraient : une fréquence, un nombre de canaux ou une longueur
> différents, chaque écart nommé.

<a name="audio-scores"></a>

### `audio.scores`

```ts
audio: {
  music: { theme: 'swan_theme.mp3' },            // le mix unique : Save-Data, appareils modestes, sans Web Audio
  scores: {
    theme: {
      stems: { melody: 'swan-theme-stems/melody.mp3', strings: 'swan-theme-stems/strings.mp3', harp: 'swan-theme-stems/harp.mp3', bass: 'swan-theme-stems/bass.mp3' },
      bpm: 80, beatsPerBar: 4,                  // depuis score.json
      states: [                                 // le premier qui tient fixe le mix ; aucun : tous les stems
        { if: { player: 'biscuit' }, stems: ['harp', 'bass'] },
        { if: { room: 'garden' }, stems: ['strings', 'harp', 'bass'] },
      ],
      // quantize: 'bar' (défaut) ou 'beat' ; fadeBeats: 2 ; loop: [première mesure, mesure de fin)
    },
  },
}
```

| Champ | Forme | Par défaut |
|---|---|---|
| `stems` | id de stem → fichier sous `audio/music/` | obligatoire |
| `bpm`, `beatsPerBar` | tempo ; temps par mesure | `beatsPerBar` 4 |
| `loop` | `[première, fin)` en mesures, comptées depuis 0 | tout le fichier |
| `states` | `{ if?, stems }[]`, le premier dont la condition tient gagne (sans `if` : toujours) | tous les stems |
| `quantize` | où tombe un changement de mix : `bar` ou `beat` | `bar` |
| `fadeBeats` | le fondu d’un changement de mix, en temps | 2 |
| `pcmBytes` | les stems décodés, en octets | aucun |
| `markers` | des mesures nommées, comptées depuis 0, où une transition peut tomber | aucun |
| `phraseBars` | la longueur d’une phrase en mesures, pour `at: 'phrase'` | 4 |

Un état est n’importe quelle condition du DSL (un flag, le lieu, le personnage actif ; voir
[Conditions](create.conditions.md)). Un changement d’état prend effet à la mesure (ou au temps) suivante, en fondu ;
un autre lieu avec le même morceau garde la musique et ne change que le mix. `npm run validate` vérifie les stems, le
tempo, les stems et conditions des états, et que le mix unique existe. L’onglet Musique du Studio joue une partition et
le mix de chaque état ([Studio : musique](studio.music.md)).

> [!GUARANTEE id=score-first-state-wins]
> Le mix est le premier état dont la condition tient, dans l’ordre écrit ; quand aucun ne tient, tous les stems jouent.

<a name="transitions"></a>

### `audio.transitions` : d’une partition à l’autre

D’une partition à une autre (3.6), une règle dit où l’ancienne laisse entrer la nouvelle, sur sa propre grille :

```ts
audio: {
  scores: { day: { …, markers: { calm: 8 }, phraseBars: 4 }, night: { … } },
  transitions: [
    { from: 'day', to: 'night', at: 'calm', bridge: 'dusk_sting' },  // à la mesure 8 de « day », puis le pont, puis « night »
    { from: '*', to: 'day', at: 'phrase', fadeBeats: 2 },             // à la phrase suivante, en fondu sur 2 temps
  ],
  maxDecodedMB: 160,                                                  // audio décodé gardé (160 par défaut)
}
```

- `at` vaut `beat`, `bar` (défaut), `phrase` ou un marqueur de l’ancienne partition, compté à travers sa boucle. Un
  marqueur que la boucle n’atteint plus retombe sur la mesure suivante.
- `bridge` est un morceau de `audio.music`, joué une fois entre les deux ; `fadeBeats` vaut 0 par défaut (sur le temps
  fort).
- La première règle qui nomme les deux partitions (ou `*`) s’applique : `validate` refuse une règle qu’une précédente
  couvre, et un marqueur depuis `'*'` qu’une partition qu’elle peut quitter n’a pas.
- Sans règle, une partition en remplace une autre aussitôt, en fondu, comme en 3.5.
- Une sauvegarde garde où en est la musique ; la charger la reprend là, en coupe, jamais par une transition (3.6.1).
- `maxDecodedMB` (160 par défaut) : au-delà, le directeur lâche les partitions jouées le moins récemment, et une
  partition plus grosse à elle seule joue son mix unique.

> [!LIMIT id=not-imuse]
> C’est un mixeur adaptatif à stems avec transitions, pas iMUSE : pas de changement de tempo, pas de branches à
> l’intérieur d’une partition. Le mix unique (sans directeur) ignore les transitions.

<a name="who-hears-stems"></a>

### Qui entend les stems, qui entend le mix unique

Le mix unique de `audio.music` reste toujours : le directeur ne joue les stems que là où ils tiennent
([`src/engine/dom/director.ts`](../../src/engine/dom/director.ts), `directorFits`) :

- pas de Web Audio (`AudioContext`) : le mix unique ;
- le navigateur demande d’économiser les données (Save-Data) : le mix unique ;
- un appareil modeste (2 Go de mémoire ou moins, ou 2 cœurs ou moins) : le mix unique ;
- un navigateur qui ne donne pas sa mémoire (Safari, iOS compris) : les stems seulement quand chaque partition déclare
  `pcmBytes` et que la plus grosse fait au plus 128 Mo, sinon le mix unique.

Aucune musique ne joue avant le premier tap, clic ou appui de touche du joueur : les navigateurs refusent le son avant
un geste. Un morceau demandé avant démarre à ce premier geste.

<a name="tools"></a>

## Dans le Studio et les outils

L’onglet Assets du Studio liste les ids de musique et de son qu’un jeu déclare et si un fichier existe pour chacun ;
`npm run assets` publie ce qui est là et signale ce qui manque. L’onglet Musique est décrit sur
[Studio : musique](studio.music.md). L’outil MCP `read_doc` servait l’ancienne page de ce sujet sous le nom `AUDIO`.

<a name="sound-design"></a>

## Une boucle par lieu

Une boucle par lieu, posée avec `music` sur le lieu : courte et discrète, le joueur l’entend quinze minutes. Le jeu
d’exemple n’en a pas encore et le dit dans `game.ts` : mieux vaut le silence qu’une mauvaise boucle. Le reste du design
sonore (un bruitage à chaque changement d’état, la voix d’aide) est dans
[Concevoir des énigmes](create.puzzle-design.md#sound).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `qa.txt` dans `games/<id>/audio/projects/<slug>/out/` finit par `ISSUES: none`.
- `npm run assets` ne signale aucun fichier `music:` manquant ; `npm run validate` aucune erreur `audio.scores`.
- Dans le jeu, le morceau joue après votre premier tap ; avec une partition, le mix change à la mesure suivante quand
  l’état change.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| « Furnace not found: run \`python -m mdpipe setup\` or set FURNACE_BIN » | Furnace absent | `npm run audio -- setup`, ou `FURNACE_BIN=<chemin>` |
| `unsupported source type .xyz` | `ingest` ne prend qu’un MIDI ou un fichier audio | Convertir la source en MIDI ou en WAV |
| `ISSUES` liste un niveau hors cible | Le `vol` d’une partie | Changer `vol` (FM ≈ 0,75 dB par pas en haut, PSG 2 dB) |
| `note collision` | Deux notes sur une ligne d’un canal | Séparer les parties, ou changer `voice` |
| `audio.scores.<id>.stems.<s> › "<fichier>" is missing or not readable audio` (`validate --release`) | Un stem absent ou abîmé | Rendre les stems à nouveau, ou corriger le chemin |
| La musique ne démarre jamais | Pas encore de geste, ou musique coupée dans le menu pause | Toucher l’écran ; vérifier le réglage Musique |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`games/<id>/audio/projects/<slug>/` (`source.mid`, `analysis.md`, `analysis.json`, `spec.json`, `out/`, `qa.txt`),
`games/<id>/audio/music/` (le `.mp3`, le dossier `<slug>-stems/`), `game.ts` (`audio`), et `public/assets/audio/` avec
`games/<id>/assets.gen.json` après `npm run assets`. Commitez les `.mp3` rendus, `spec.json`, `source.mid`,
`analysis.md` et `qa.txt` ; ni `out/*.wav` ni `reference.wav`.

<a name="recovery"></a>

## Revenir en arrière

Une construction n’écrase que `out/` ; le morceau précédent reste dans `audio/music/` tant que vous ne copiez pas le
nouveau par-dessus. Git garde les versions commitées : `git checkout -- games/<id>/audio/music/<fichier>.mp3` en ramène
une.

<a name="references"></a>

## Références

- [`tools/audio/mdpipe/__main__.py`](../../tools/audio/mdpipe/__main__.py), [`tools/audio/mdpipe/stems.py`](../../tools/audio/mdpipe/stems.py), [`tools/audio/palette.json`](../../tools/audio/palette.json)
- [`src/engine/core/types/audio.ts`](../../src/engine/core/types/audio.ts), [`src/engine/core/score.ts`](../../src/engine/core/score.ts), [`src/engine/tools/stems.ts`](../../src/engine/tools/stems.ts)
- [Bruitages](create.sound-effects.md), [Voix](create.voices.md), [Outils audio](install.audio-toolchain.md)
