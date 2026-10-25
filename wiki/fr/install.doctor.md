# doctor : vérifier sa machine

`doctor` dit, une ligne par prérequis, si ce dont quest'n'click a besoin est présent sur la machine, et comment
installer ce qui manque. Il n'installe jamais rien. Il se lance dans le dépôt du moteur avec `npm run doctor`, et dans
un projet créé avec `npx quest-n-click doctor` (qui demande aujourd'hui un contournement : [plus bas](#in-created-project)).

<a name="run"></a>

## Le lancer

```bash
# dans le dépôt du moteur
npm run doctor
npm run doctor -- --release
```

```bash
# dans un projet créé (lisez d'abord « Dans un projet créé »)
npx quest-n-click doctor
```

Les deux lancent le même fichier, `tools/doctor.ts`, dont les vérifications sont dans `tools/doctor-checks.ts`.

<a name="checks"></a>

## Ce qu'il vérifie

| Ligne | Sonde | Requis | Correction affichée |
|---|---|---|---|
| `Node.js` | la version majeure du Node qui tourne vaut 22 ou plus | oui | `Install Node.js 22 or newer.` |
| `Python` | `python3 -c …` affiche sa version | optionnel (requis avec `--release`) | `Install Python 3 to prepare the assets (npm run assets).` |
| `Python image modules` | `python3` importe Pillow, NumPy et SciPy | optionnel (requis avec `--release`) | `Run: python3 -m pip install --require-hashes -r requirements.txt` |
| `ffmpeg` | `ffmpeg -version` réussit | optionnel (requis avec `--release`) | `Install ffmpeg to build audio.` |
| `Playwright Chromium` | l'exécutable Chromium de Playwright existe | oui | `Run: npx playwright install chromium` |
| `Playwright Firefox` | son exécutable existe | optionnel | `Run: npx playwright install firefox` |
| `Playwright WebKit` | son exécutable existe | optionnel | `Run: npx playwright install webkit` |
| `Reality Bridge` | Ed25519 dans le WebCrypto de Node, puis le WebAssembly de Biscuit se charge | Ed25519 seulement | `Install Node.js 22 or newer.` |

La ligne `Reality Bridge` n'échoue que si le WebCrypto de Node n'a pas Ed25519. Quand Biscuit ne se charge pas, elle
passe et dit `Biscuit not installed (only a Bridge needs it)` : un jeu qui ne fait pas tourner de Bridge n'en a jamais
besoin.

La correction Python cite `requirements.txt` dans le dossier courant : dans un projet créé, le fichier est
`node_modules/@quest-n-click/engine/requirements.txt`.

<a name="output"></a>

## Sortie et code de retour

Chaque ligne commence par `✔` (présent), `✖` (absent et requis) ou `○` (absent et optionnel, suivi de `(optional)`) ;
une ligne absente est suivie de sa correction. La dernière ligne est l'une de :

- `Development, asset and browser-test prerequisites are ready.`
- `Development and browser-test prerequisites are ready; <n> optional one(s) missing (assets, audio or a second browser).`
- `<n> prerequisite(s) missing.`

`doctor` sort avec 1 quand un prérequis requis manque, 0 sinon : une machine sans Python ni WebKit développe et joue
quand même (depuis la 4.1.6). Un exemple, sur le Mac du mainteneur le 23 octobre 2026, moteur 4.4.0 (chemins
raccourcis) :

```text
✔  Node.js: 22.14.0
✔  Python: 3.12.7
✔  Python image modules: Pillow 12.3.0, NumPy 2.4.6, SciPy 1.18.1
✔  ffmpeg: ffmpeg version 9.0.2 Copyright (c) 2000-2026 the FFmpeg developers
✔  Playwright Chromium: /Users/…/ms-playwright/chromium-1248/…/Google Chrome for Testing
✔  Playwright Firefox: /Users/…/ms-playwright/firefox-1555/…/firefox
✔  Playwright WebKit: /Users/…/ms-playwright/webkit-2370/pw_run.sh
✔  Reality Bridge: Ed25519 in WebCrypto; Biscuit not installed (only a Bridge needs it)

Development, asset and browser-test prerequisites are ready.
```

Cet exemple montre une limite de la sonde : Pillow 12.3.0 passe, alors que `requirements.txt` épingle la 13.0.0.
`doctor` vérifie que les modules s'importent, pas leur version.

> [!GUARANTEE id=doctor-optional-not-fatal]
> Un Python, un module Python, un ffmpeg ou un WebKit absent est signalé avec sa correction et ne fait pas échouer
> `doctor` ; un Node 22 ou un Chromium absent, si. Avec `--release`, Python, ses modules et ffmpeg deviennent requis, et
> WebKit reste optionnel. Le test lance les vérifications avec des sondes qu'il injecte, pas sur une vraie machine.

<a name="release"></a>
<!-- applies: .. since 4.1.8 -->

## `--release`

`npm run doctor -- --release` exige ce que lance `npm run release-check` : Python, ses modules et ffmpeg. Firefox et
WebKit restent optionnels (release-check n'ouvre aucun navigateur ; les e2e tournent en CI à chaque modification) ;
Chromium reste requis. Le rapport se termine par `(release mode: every prerequisite of npm run release-check is
required)`. `release-check` et le `release-check:ci` du candidat commencent par lui.

<a name="not-checked"></a>

## Ce qu'il ne vérifie pas

- La version mineure de Node : Node 22.0 à 22.11 passent, alors que le moteur demande 22.12, et 22.13 pour le Studio et
  SQLite ([Prérequis](install.requirements.md#node)).
- Les versions des modules Python, OpenCV (les outils de bouches qui parlent), fluidsynth, Furnace et `uv` (le pipeline
  audio).
- Le réseau, le registre npm, les archives de la release.

<a name="in-created-project"></a>

## Dans un projet créé

`npx quest-n-click doctor` lance `tools/doctor.ts` depuis le paquet du moteur, et ce fichier importe `playwright` pour
trouver les exécutables des navigateurs. Le paquet du moteur ne dépend pas de Playwright (`scripts/pack.mjs` le laisse
de côté avec les autres outils de test) : dans un projet neuf, la commande s'arrête donc avant d'afficher quoi que ce
soit :

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright' imported from …/my-game/node_modules/@quest-n-click/engine/tools/doctor.ts
```

Constaté le 23 octobre 2026 dans un projet créé depuis l'archive de la v4.4.0 ; le code de `main` est le même. Rien
d'autre dans un projet créé ne se sert de Playwright : `dev`, `assets`, `verify`, `build` et `release` n'ouvrent aucun
navigateur par lui. Deux façons de contourner, dans le projet créé :

```bash
# dans le projet créé : donner à doctor le Playwright qu'il importe, en dépendance de développement
npm install --save-dev playwright@^1.64.1
npx playwright install chromium     # seulement si doctor dit ensuite que Chromium manque
npx quest-n-click doctor
```

La plage `^1.64.1` est celle du dépôt du moteur (son `package.json` en v4.4.0 et sur `main` le 23 octobre 2026). Ou
vérifiez à la main ce dont un projet créé a besoin : `node --version` (22.12 ou plus récent),
`python3 -c "import PIL, numpy, scipy"`, et `ffmpeg -version` si votre jeu a des sons ou des vidéos. La version pas à
pas est dans [Dépannage de l'installation](install.troubleshooting.md#doctor-in-created-project).

> [!LIMIT id=doctor-needs-playwright]
> Dans un projet créé, `doctor` ne marche qu'une fois `playwright` installé dans ce projet, et il exige alors Chromium,
> dont un projet créé ne se sert jamais.

<a name="since"></a>

## Depuis

`npm run doctor` existe depuis la 3.0.0. Les prérequis optionnels absents ont cessé de le faire échouer en 4.1.6, quand
`quest-n-click doctor` (alors `web-scumm doctor`) a rejoint les commandes du paquet ; la ligne `Reality Bridge` est
arrivée avec la 4.1.1, `--release` avec la 4.1.8.

<a name="related"></a>

## Identifiants liés

- `npm run release-check` (lance d'abord `doctor -- --release`), `npx playwright install`
- [Prérequis](install.requirements.md), [Dépannage de l'installation](install.troubleshooting.md)
- Le Reality Bridge a son propre `doctor`, pour son journal (`npx quest-n-click-bridge doctor`) :
  [La CLI du Bridge](bridge.cli.md)
