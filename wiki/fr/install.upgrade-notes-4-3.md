# Notes de mise à jour : 4.3

Ce que la 4.3.0 « Hero Choice » et la 4.3.1 ont changé, conservé tel quel. La 4.3.0 est la seule mineure à avoir
retiré quelque chose : les anciens noms `web-scumm…`, alias pendant toute la 4.2.x (D47). Un jeu qui dit encore
`web-scumm` lance une fois `npx quest-n-click migrate` ([Venir de web-scumm](install.from-web-scumm.md)). Le reste est
optionnel pour un jeu, avec trois points à vérifier après le passage à la 4.3.0 : un `{hero}` littéral ou un groupe
d'accolades en forme d'aiguillage dans un texte, la nouvelle police d'interface sur un téléphone, et, pour un
opérateur de Bridge, les `limits` de chaque `config.json`.

La mise à jour elle-même est [Mettre à jour](install.upgrade.md). Les numéros de section sont ceux de l'ancien
`docs/fr/UPGRADING.md` : « §39 » retrouve donc sa section.

<a name="from-4-2-5-to-4-3-0"></a>

## 39. De la 4.2.5 à la 4.3.0 « Hero Choice »

Rien à changer dans le contenu d'un jeu : le format du contenu ne fait que grandir (ADR 0022, D49), `schemaVersion` reste 3, les
sauvegardes et leur enveloppe sont celles de la 4.2.0, l'empreinte logique d'un jeu qui n'utilise rien de ce qui suit
ne bouge pas. Le moteur s'installe depuis `releases/download/v4.3.0/…`. Ce qui est nouveau, tout optionnel
(CONTENT_GUIDE, « Choisir le héros ») :

- **Une variante de personnage peut porter un `name`** : tant qu'elle s'applique, la bulle, la transcription,
  l'en-tête de conversation et `{name}` dans une réplique de repli le lisent. Une traduction le liste
  (`char:<id>/variants[<i>].name`).
- **Les aiguillages de texte et `{hero}`**, remplis quand un texte s'affiche, après la traduction : `{hero}` est le
  nom du héros actif, `{form?knight=le|witch=la|*=le}` le texte listé pour la valeur courante du drapeau. Dans les
  répliques, les choix, les descriptions, les indices, les toasts, les sous-titres, les noms d'objets et les titres
  d'objectifs ; le validateur les refuse dans les noms de lieux, les verbes, les noms de personnages et de
  variantes, `ui`, le titre, la carte, la fin et les params des mini-jeux.
- **`img` sur une option de choix** : l'option devient une carte, l'image avec son `text` pour étiquette.
- **Des voix par valeur** : une réplique à aiguillage cherche `<id>~<drapeau>=<valeur>` avant son id seul (AUDIO.md).
- **Une touche par verbe** (#203) : `key: 'o'` sur un verbe le choisit au clavier, traduite comme le libellé ; avec
  `settings: true`, le joueur peut couper ces touches (`ui.verbKeys`, CONTENT_GUIDE, « Une touche par verbe »).
- **`npm run lint`** a `hero-looks-default` (info), et ne traite plus d'`action-dead` une règle qui ne pose qu'un
  drapeau lu par une variante de personnage ou par un aiguillage.

**Un Bridge vérifie les `limits` de son `config.json` au démarrage** (4.3.0) : un nom inconnu, ou une valeur qui
n'est pas un entier d'au moins 0 (au moins 1 pour `streamPage`, `bodyBytes` et `streamBufferBytes`), l'arrête en
nommant la limite et la valeur ; sur un Bridge partagé, ce sont tous les locataires. Avant la mise à jour, listez
les limites de chaque locataire et comparez-les aux noms de `DEFAULT_LIMITS` (`bridge/src/config.ts`) :
`node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).limits ?? {})' <dir>/config.json`.

**Les noms `web-scumm` disparaissent** (D47). Pendant toute la 4.2.x, les anciens noms du moteur étaient des alias ;
la 4.3.0 les retire. Il n'y a plus d'archive `web-scumm-<version>.tgz`, `create-web-scumm`, `web-scumm-bridge`,
`web-scumm-connectors` ni `web-scumm-studio-server`, plus de commande `web-scumm`, `web-scumm-bridge`,
`web-scumm-connector`, `web-scumm-studio-server` ni `web-scumm-studio-worker`, et `web-scumm/content` et les autres
anciens imports ne se résolvent plus. Un jeu passé aux nouveaux noms (§38) n'a rien à faire. Un jeu qui dit encore
`web-scumm` passe ainsi, puis `npm run verify` :

```bash
npm uninstall web-scumm
npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.3.0/quest-n-click-4.3.0.tgz
npx quest-n-click migrate
```

`quest-n-click migrate` renomme, dans toutes les sources du projet (hors `node_modules`, `dist`, `public` et dossiers
cachés), les imports `web-scumm/…` en `quest-n-click/…` ; dans `tsconfig.json`, le chemin `web-scumm/*` et les cibles
`node_modules/web-scumm/…` ; dans `package.json`, les commandes des scripts (`web-scumm dev` devient
`quest-n-click dev`, `web-scumm-bridge serve` devient `quest-n-click-bridge serve`). Toute chaîne entre guillemets qui
commence par `web-scumm/` est renommée, import ou non ; `web-scumm-save` et les autres noms de format ne le sont pas.
Un lien symbolique qui sort du projet, un script `web-scumm` à côté d'un script `quest-n-click`, ou une dépendance à un
ancien paquet dont le nouveau n'est pas installé est signalé et vous est laissé. `migrate --check` nomme ce qui reste.
Les commandes que vous tapez changent de même : `npx web-scumm …` devient `npx quest-n-click …`, et
`npx web-scumm-bridge`, `npx web-scumm-connector`, `npx web-scumm-studio-server`, `npx web-scumm-studio-worker`
deviennent `npx quest-n-click-bridge`, `npx quest-n-click-connector`, `npx quest-n-click-studio-server`,
`npx quest-n-click-studio-worker`. À la main, depuis le dossier du projet, les imports dans les deux styles de
guillemets dans les fichiers `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` et `.cjs`, noms avec espaces compris
(avec le `grep` et le `sed` GNU comme BSD), puis `tsconfig.json` et `package.json` comme le dit le §38 :

```bash
grep -rl --null -E --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.cts' --include='*.js' \
  --include='*.jsx' --include='*.mjs' --include='*.cjs' --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=public --exclude-dir='.*' "['\"]web-scumm/" * \
  | xargs -0 sed -i.bak -e "s#'web-scumm/#'quest-n-click/#g" -e 's#"web-scumm/#"quest-n-click/#g'
find . -name '*.bak' -not -path './node_modules/*' -delete
```

Un hébergeur du Bridge, des connecteurs ou du Studio Server installe les archives `quest-n-click-…` et appelle les
nouvelles commandes dans ses fichiers d'unité et ses scripts. Un jeu d'un Studio hébergé qui importe encore
`web-scumm/…` ne se charge plus (sa santé n'est pas verte et ses écritures sont refusées) tant que son owner n'a pas
lancé la mise à niveau du moteur (`POST /api/engine/migrate`, STUDIO-SERVER). La mise à niveau renomme d'abord ses
imports, en une révision à part jugée seulement sur le fait que le jeu se charge (et, s'il se chargeait avant, sur
aucune nouvelle erreur du validateur), jamais par le solveur : un jeu qu'on ne peut pas encore finir voit ses imports
renommés et se charge de nouveau ; puis la migration du schéma, s'il en faut une, est jugée comme avant et peut encore
être refusée (422, le renommage gardé). Le renommage n'est pas annulable (son annulation ramènerait des imports qui ne
se résolvent plus) : faites une sauvegarde d'abord pour revenir en arrière.
Les formats gardent leurs noms : sauvegardes, sessions, runs, stockages, en-têtes et `WEB_SCUMM_*` ne changent pas
(§38).

**Une chose à vérifier** : un texte 4.2 qui contient tel quel `{hero}` ou un groupe entre accolades en forme
d'aiguillage (`{mot?…=…}`) est désormais rempli à l'affichage. `npm run validate` signale un groupe en forme d'aiguillage (un
drapeau qu'aucune commande ne pose, un aiguillage mal formé, ou un aiguillage dans un texte affiché tel quel) ; un
`{hero}` dans une réplique est valide, il faut donc le chercher (`grep -rn '{hero}' games/<id>`). Pour garder les
accolades à l'écran, les écrire autrement (`[hero]`, ou `{mot ? …}` avec une espace avant le `?`). Un texte sans un tel
groupe s'affiche exactement comme avant.

**La police d'interface** (#204). Un jeu qui ne fixe pas `skin.fonts.ui` affiche maintenant ses dialogues, ses verbes
et ses menus en Galmuri11, une police pixel proportionnelle, au lieu de DotGothic16 ; son `size-adjust` garde le texte
à la même hauteur, et les lignes sortent un peu plus étroites. Sauvegardes, sessions et runs ne changent pas : la
police relève de la présentation, hors des empreintes. Pour garder l'ancien rendu, écrire `skin: { fonts: { ui:
'DotGothic16' } }` dans `game.ts` (un changement de skin : l'empreinte de présentation du jeu bouge, son run de
référence, s'il en garde un, est donc à enregistrer à nouveau). Un jeu qui fixe déjà `skin.fonts.ui` garde sa police ;
un caractère qui lui manque passe maintenant par DotGothic16 (le sous-ensemble latin, puis la police complète pour le
japonais) avant `'Courier New'`. Regarder un lieu avec un dialogue et un choix après la mise à jour, sur un téléphone :
une réplique tout juste contenue peut passer à la ligne autrement.

**Les outils Python** (#213) : les outils d'assets et l'application de traitement d'un Studio hébergé utilisent
Pillow 13.0.0 ; relancer `python3 -m pip install -r requirements.txt`. Leur résultat ne change pas (les images du jeu
d'exemple ressortent identiques à l'octet) ; un hébergeur qui installe l'application de traitement depuis
`ops/studio/worker-requirements.lock` reçoit le nouveau wheel par son sha256.

<a name="from-4-3-0-to-4-3-1"></a>
<!-- applies: 4.3.1.. -->

## 40. De la 4.3.0 à la 4.3.1

Rien à changer : un jeu se construit, se joue et se sauvegarde comme en 4.3.0 (mêmes empreintes, sauvegardes de
référence et runs de référence). Le moteur s'installe depuis `releases/download/v4.3.1/…`. Ce qu'un jeu peut remarquer :

- **Voix d'une traduction** : quand une traduction ajoute un aiguillage que sa ligne source n'a pas
  (`Prêt{form?witch=e|*=} ?` pour `Ready?`), `npm run voices -- import` accepte désormais les clips par valeur de cette
  langue, `status` ne les dit plus orphelins, et `npm run validate` avertit quand l'un manque. Un jeu qui contournait le
  refus en rangeant ces clips sous l'id simple peut maintenant les ranger par valeur.
- **`npm run solve`** trouve un chemin gagnant ; `npm run solve -- --prove` vérifie chaque état atteignable, chaque
  réponse d'un choix d'intro comprise. Un jeu dont tous les héros ou parcours doivent atteindre la fin lance `--prove`.
  La phrase du témoin dit maintenant « on one path » ; un script qui lisait l'ancienne formulation lit `status` dans
  `--json`.
