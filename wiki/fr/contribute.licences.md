# Licences et crédits

Quelle licence couvre chaque partie de quest'n'click, qui a fait quoi, et d'où peut venir un son ou une image. Les
fichiers du dépôt sont les textes qui font foi : [`LICENSE`](../../LICENSE) (le code),
[`LICENSE-ASSETS`](../../LICENSE-ASSETS) (les images et le son du jeu d'exemple) et [`CREDITS.md`](../../CREDITS.md) ;
cette page les résume dans les deux langues.

<a name="licences"></a>

## Licences

| Partie | Licence | Où |
|---|---|---|
| Le code source du moteur et les outils | Licence MIT, Copyright (c) 2026 Wano | `LICENSE` |
| Les images du jeu d'exemple (tout `games/demo/art`) | Creative Commons Attribution 4.0 International (CC BY 4.0) | `LICENSE-ASSETS` |
| Les bruitages générés (`games/demo/audio/sfx`) | CC BY 4.0 | `LICENSE-ASSETS` |
| Le thème (`games/demo/audio/projects/swan-theme`, ses rendus sous `games/demo/audio/music`) | CC BY 4.0 | `LICENSE-ASSETS` |
| Les polices sous `public/fonts` et `src/engine/dom/fonts` | SIL Open Font License 1.1 | `src/engine/dom/fonts/OFL.txt` ; `licenses/THIRD_PARTY_NOTICES.txt` dans un build |

L'attribution que demandent les assets sous CC BY 4.0 est : « Artwork by Wano, from the quest'n'click project, formerly
web-scumm (https://github.com/Quest-n-Click/quest-n-click) ». En bref, comme le dit le README : code MIT ; images, bruitages et
thème du jeu d'exemple CC BY 4.0 (attribution « Wano ») ; le thème est le *Lac des cygnes* de Tchaïkovski (domaine
public), transcrit et arrangé pour le projet ; polices SIL OFL.

Tous les assets du jeu d'exemple sont sous CC BY 4.0 depuis la 3.7 ; `npm run verify:commercial` vérifie que les assets
d'un jeu peuvent être livrés commercialement ([Provenance des assets](create.asset-provenance.md)).

<a name="credits"></a>

## Crédits

### Code

Moteur et outils de quest'n'click (anciennement web-scumm) : licence MIT, (c) 2026 Wano. Construit avec Vite, Vitest,
Howler, earcut, navmesh, Tweakpane, Playwright et zod.

- Les vecteurs de test Biscuit de `bridge/test-vectors/biscuit/` viennent du projet Biscuit (Apache-2.0, leur `LICENSE`
  à côté).
- Le connecteur SSH (`@quest-n-click/connectors`, 4.1.9) tourne sur ssh2 (MIT, Brian White) et ses dépendances asn1
  (MIT), bcrypt-pbkdf (BSD-3-Clause), safer-buffer (MIT) et tweetnacl (Unlicense).

### Images du jeu d'exemple (`games/demo/art`)

Décors, personnages, objets et icônes d'interface : générés pour le projet par un modèle d'image à partir de prompts
écrits ([Images](create.images.md)), puis découpés et détourés avec les outils de ce dépôt. CC BY 4.0, attribution
« Wano ». Les quatre personnages humains sont des caricatures, utilisées avec l'accord des personnes dont elles
s'inspirent ; elles sont publiées sous des noms qui ne sont pas les leurs.

### Musique et bruitages (`games/demo/audio`)

Rendus pour le projet par la chaîne audio Mega Drive de `tools/audio` ([Musique](create.music.md)), qui pilote
[Furnace](https://github.com/tildearrow/furnace) (GPL-2.0, téléchargé par `npm run audio -- setup`, non inclus).

- **Musique** : le thème de hautbois du *Lac des cygnes* (Piotr Ilitch Tchaïkovski, 1876, domaine public), ses notes,
  son harmonie et son arrangement écrits pour le projet (`audio/projects/swan-theme/compose.py`, puis `spec.json`) et
  rendus pour YM2612 + SN76489. Aucune transcription d'un tiers : CC BY 4.0, attribution « Wano »
  (`audio/projects/swan-theme/SOURCE.md`). Depuis la 3.7 ; le thème précédent, arrangé d'après une transcription sous
  CC BY-NC, a disparu.
- **Bruitages** : synthétisés à partir de `audio/sfx.json` et de la palette commune (`tools/audio/palette.json`).
  CC BY 4.0, attribution « Wano ».

### Polices (`public/fonts`, `src/engine/dom/fonts`)

- **Galmuri11**, de Lee Minseo (quiple). SIL Open Font License 1.1 (sans Reserved Font Name). La police d'interface par
  défaut depuis la 4.3.0, livrée en sous-ensemble latin fait par `tools/subset-font.py` (`src/engine/dom/fonts/`).
- **DotGothic16**, de Fontworks. SIL Open Font License 1.1 (sans Reserved Font Name). Le moteur la livre entière
  (`public/fonts/`) et en sous-ensemble latin fait par `tools/subset-font.py` (`src/engine/dom/fonts/`).
- **Press Start 2P**, de CodeMan38. SIL Open Font License 1.1.

<a name="audio-sources"></a>

## D'où peut venir un son

Un morceau est l'arrangement d'une source que vous avez le droit d'utiliser : la vôtre, ou une œuvre du domaine
public. Ne déposez jamais dans `audio/` un fichier son d'origine inconnue.

Une source `.wav`, `.mp3` ou `.flac` est d'abord transcrite en MIDI par basic-pitch (le `.venv` audio est requis ; les
pistes séparées par demucs sont facultatives et lourdes). Le résultat est un brouillon : garder la mélodie, la basse et
les fondamentales des accords, supprimer les notes fantômes, vérifier le tempo (`--bpm`), réécrire la batterie en
motif. Préférez un MIDI quand il existe. Toute la démarche est dans [Musique](create.music.md#audio-sources) ; la
chaîne d'outils dans [Chaîne d'outils audio](install.audio-toolchain.md).

> [!LIMIT id=transcription-licence]
> Une transcription porte la licence de ce qu'elle transcrit : les outils ne rendent pas livrable une source que vous
> n'avez pas le droit d'utiliser. Le thème précédent du jeu d'exemple était arrangé d'après une transcription sous
> CC BY-NC ; depuis la 3.7, le thème est écrit à partir de la partition du domaine public sans aucune transcription
> d'un tiers, ce qui lui permet d'être sous CC BY 4.0.

<a name="not-affiliated"></a>

## Aucune affiliation

quest'n'click (anciennement web-scumm) est un projet indépendant. « Façon SCUMM » désigne un genre de jeu (des verbes,
un sac, des lieux, des dialogues à choix) ; le projet n'est ni affilié à, ni approuvé par, ni dérivé de LucasArts,
Lucasfilm, Disney ou du projet ScummVM, et n'en livre ni code, ni données, ni images.

<a name="related"></a>

## Identifiants liés

- `npm run verify:commercial`, `npm run audio`, `npm run provenance`.
- [Politique de sécurité](contribute.security-policy.md#licensing), [Provenance des assets](create.asset-provenance.md).
