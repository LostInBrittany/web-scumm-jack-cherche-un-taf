# Mode démo et studio-apply

Le Studio tourne aussi sans aucun serveur, sur un hébergement statique : le Studio du jeu de démo est en ligne à
<https://quest-n-click.cleverapps.io/demo/studio.html>, servi par le site web du projet depuis la dernière release. Vos modifications
restent dans votre navigateur ; téléchargez-les en patch et `npm run studio-apply` les écrit dans votre copie du jeu.

<a name="what-you-get"></a>

## Ce que vous obtenez

Les modifications faites dans le Studio de démo en ligne (textes, layouts, entités ajoutées, storyboard, notes) écrites
dans votre clone, par les mêmes opérations que celles du Studio local.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio de démo (un build statique) et le dépôt du moteur, où se lance `npm run studio-apply`. Vrai depuis la 4.2.5
(l'adresse ci-dessus).

<a name="prerequisites"></a>

## Prérequis

- Pour appliquer un patch : le dépôt du moteur cloné et installé ([Installer depuis le dépôt](install.from-repository.md)),
  avec le jeu sur lequel le patch a été fait.

<a name="where-to-run"></a>

## Où lancer les commandes

La démo tourne dans votre navigateur. `npm run studio-apply` et le build de la démo se lancent dans le dépôt du moteur,
sur votre machine.

<a name="demo-mode"></a>

## Comment marche la démo

Même interface, même vue du moteur et même éditeur de placement que le Studio local ; les modifications restent dans
le navigateur.

- **Build.** `npm run build:studio-demo` (c'est-à-dire `STUDIO=1 VITE_STUDIO_DEMO=1 vite build`) ; la CI pose les deux
  variables sur son `npm run build`. Avec `STUDIO=1`, le build écrit d'abord `public/studio-demo/snapshot.json`
  ([`tools/studio/snapshot.ts`](../../tools/studio/snapshot.ts), aussi `npm run studio-snapshot` ; ignoré par git) :
  `{ game, rooms: { <id>: { def, layout, texts, file } }, storyboard, notes, docs: { CONTENT_GUIDE }, assets }`, tout
  ce que le Studio lit dans l'API. Sans `STUDIO=1`, ni `studio.html` ni l'instantané n'atteignent `dist/`. Le code du
  Studio et des outils de dev va dans `dist/assets/tools/`, hors du précache du service worker.
- **Backend.** [`src/studio/api.ts`](../../src/studio/api.ts) définit l'interface `Api` ; celle du serveur de dev est
  la valeur par défaut. Celle du navigateur ([`src/studio/api-browser.ts`](../../src/studio/api-browser.ts)) sert quand
  le build le dit (`VITE_STUDIO_DEMO=1`) ou quand `GET /__studio/api/game` répond 404 (ou une page à la place du JSON).
  Elle charge l'instantané et rejoue les modifications gardées dans le `localStorage` sous
  `web-scumm.studio-demo.<jeu>` : une liste de patchs `{ kind: 'text', room, path, value }` (remplacement, `[+]`
  ajout, `null` suppression, avec les mêmes décalages de chemin que le fichier du lieu), `{ kind: 'layout', room,
  layout }`, `{ kind: 'entity', room, entity }` (Add prop / hotspot / actor), `{ kind: 'storyboard', storyboard }`,
  `{ kind: 'note', note }`, `{ kind: 'note-edit', id, text, about?, edited }`, `{ kind: 'note-delete', id }`. Un
  layout ou un storyboard plus récent remplace le précédent ; modifier ou supprimer une note ajoutée en démo réécrit son
  patch `note`.
- **Vérifications.** Validate et Solve tournent dans la page ([`src/engine/tools/validate.ts`](../../src/engine/tools/validate.ts),
  `solve.ts`) sur le vrai module du jeu avec les modifications appliquées : layouts, entités ajoutées, et chaque texte
  dont le chemin atteint une chaîne du lieu compilé (lignes de Regarder, noms, indices, sujets, répliques de `on` /
  `talk` / `onEnter`…). Export Markdown télécharge `storyboard.md`. Pas d'événements : rien sur le disque à surveiller.
- **Vue du moteur.** Dans un build démo, les outils de dev se chargent aussi avec `?edit` / `?dev` (et seulement
  alors : le jeu du joueur est le même). Ils appliquent les mêmes patchs au jeu et aux layouts au démarrage. **Save
  layout** dans l'éditeur envoie le layout au Studio qui l'entoure (`postMessage`, message `saved` avec `layout`), qui
  le garde en patch `layout` ; l'éditeur ouvert seul écrit lui-même le patch dans le `localStorage`. Sur le serveur de
  dev, l'éditeur écrit `layout/<lieu>.json` par l'API du Studio (`PUT /__studio/api/room/<id>/layout`, une opération
  gardée du journal) ; il ne se rabat sur le patch que quand cette API n'existe pas.
- **Bandeau.** « Demo: your edits stay in this browser », **Download patch** (`studio-patch-<jeu>.json` :
  `{ format: 'web-scumm-studio-patch', version, game, created, patches }`) et **Reset demo** (abandonne toutes les
  modifications).

> [!LIMIT id=demo-limits]
> Un texte que le lieu construit par du code (une constante partagée, une fonction) n'est validé que dans la version
> serveur. Les captures d'écran demandent le serveur de dev : le panneau est caché. L'onglet Assets est en lecture
> seule, le tableau des voix, la carte du scénario et le diff sémantique sont absents, les modifications structurées
> (`set_value`) demandent le serveur de dev, et l'Assistant n'a ni `screenshot`, ni `run_tests`, ni `asset_prompts`
> ([L'Assistant](studio.assistant.md#demo)).

<a name="demo-docs"></a>
<!-- applies: 4.5.0.. -->

### La documentation dans l'instantané

Depuis la 4.5.0, l'instantané porte aussi le wiki : le bundle d'un paquet quand le moteur est installé depuis l'un
d'eux, sinon les pages `ready` du dépôt (jamais un brouillon). L'Assistant de la démo les lit avec `search_docs`,
`list_docs` et `read_doc` par id ; `read_doc` par nom n'a toujours que `CONTENT_GUIDE`.

<a name="steps"></a>

## Étapes

<!-- step: edit -->
1. Modifiez dans le Studio de démo. Le bandeau compte ce que vous avez changé.

<!-- step: download -->
2. **Download patch** : vous obtenez `studio-patch-<jeu>.json`.

<!-- step: apply -->
3. Appliquez-le à votre copie :

   ```sh
   # dans le dépôt du moteur
   npm run studio-apply studio-patch-demo.json
   ```

   Il rejoue le patch à travers le cœur du Studio (`setText`, `setLayout`, `addEntity`, `setStoryboard`, `addNote`,
   `editNote`, `deleteNote`, dans l'ordre) et imprime une ligne par patch (`✔` appliqué, `=` inchangé, `✘` échoué,
   avec la raison) et un résumé : `<n> applied, <n> unchanged, <n> failed (<dossier du jeu>).` `GAME=<id>` ou
   `GAME_DIR=<dossier>` choisissent le jeu, comme pour chaque outil ; un patch fait sur un autre jeu est appliqué avec
   un avertissement (`⚠ the patch was made on "<jeu>", the current game is "<jeu>"`).

> [!GUARANTEE id=apply-replays-demo]
> `studio-apply` écrit les modifications de la démo dans une copie du jeu, qui se relit ensuite comme la démo la
> montrait.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le résumé dit `0 failed`, le code de sortie vaut 0, et `git diff` montre les modifications de la démo dans les fichiers
des lieux, les layouts, `storyboard.json` et `notes.json`. Ouvrez `npm run studio` pour les voir.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| `usage: npm run studio-apply <patch.json>` (sortie 2) | Aucun fichier donné | Donner le fichier du patch |
| `not a Studio patch (expected { format: "web-scumm-studio-patch", patches: [...] })` | Un autre fichier | Prendre le `studio-patch-<jeu>.json` téléchargé |
| Une ligne `✘ …` et un code de sortie 1 | Ce patch a échoué (un lieu renommé, un texte déplacé) ; les autres sont appliqués | Refaire cette modification à la main dans le Studio |
| `⚠ the patch was made on "…"` | `GAME` désigne un autre jeu | Poser `GAME=<id>` sur le jeu du patch |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Dans le navigateur : la clé `web-scumm.studio-demo.<jeu>` du `localStorage`. Dans votre copie : les fichiers des
lieux, `layout/*.json`, `storyboard.json`, `notes.json` du jeu, chaque patch une opération du journal.

<a name="recovery"></a>

## Revenir en arrière

Dans le navigateur, **Reset demo** abandonne toutes les modifications. Dans votre copie, les écritures sont des
fichiers ordinaires : `git checkout -- games/<id>`.

<a name="references"></a>

## Références

- [`studio-server/src/ops/apply.ts`](../../studio-server/src/ops/apply.ts), [`src/studio/demo-patch.ts`](../../src/studio/demo-patch.ts),
  [`src/studio/api-browser.ts`](../../src/studio/api-browser.ts).
- [Jouer en ligne et essayer le Studio de démo](start.play-online.md).
