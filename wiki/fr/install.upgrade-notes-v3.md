# Notes de mise à jour : v3

Les notes de la ligne 3.x, conservées telles quelles : un jeu qui embarque le moteur (3.1), les ids de lignes (3.2),
les lignes de listes (3.3), la scène (3.4), puis le passage de la 3.x à la 4.0. Les numéros de section sont ceux de
l'ancien `docs/fr/UPGRADING.md` : un renvoi comme « §38 » retrouve donc sa section (les notes 4.x sont sur
[4.1](install.upgrade-notes-4-1.md), [4.2](install.upgrade-notes-4-2.md), [4.3](install.upgrade-notes-4-3.md) et
[4.4](install.upgrade-notes-4-4.md)).

Lisez-les avec les noms d'aujourd'hui : `web-scumm/content`, `npx web-scumm …` et `create-web-scumm` s'appellent
`quest-n-click/content`, `npx quest-n-click …` et `create-quest-n-click` depuis la 4.2.5, et les anciens noms ne
marchent plus depuis la 4.3.0 ([Venir de web-scumm](install.from-web-scumm.md)). La procédure complète de mise à jour
est [Mettre à jour](install.upgrade.md).

<a name="embedded-engine"></a>

## 8. Un jeu qui embarque le moteur (une copie de `src/engine`)

Votre `src/main.ts` ne recopie plus l'amorçage : il appelle `bootGame` (`src/engine/boot.ts`) et ne dit que ce qui
est propre à votre build :

```ts
import { bootGame } from '@engine/boot';
import { game, layouts, manifest, minigames, commands, locales } from '@game';

void bootGame({
  game, layouts, manifest, minigames, commands, locales, version: __ASSETS_VERSION__,
  dev: { enabled: (q) => import.meta.env.DEV && (q.has('dev') || q.has('edit')) },
  sw: { register: () => import('virtual:pwa-register') },   // ou `sw: false` sans vite-plugin-pwa
});
```

`bootGame` choisit la langue (`?lang=`, le choix sauvegardé du joueur, le navigateur), attend les polices, ouvre le
stockage IndexedDB vérifié (ses premières erreurs atteignent l'App dès qu'elle existe ; sans IndexedDB, l'adaptateur
`localStorage` vérifié prend le relais), construit l'`App`, expose `window.__game` pour les pilotes e2e, lance les
outils de dev quand `dev.enabled` le dit (`dev.patch` peut remplacer le jeu, les layouts et le stockage avant, comme
la démo du Studio), affiche le titre, et enregistre le service worker par le module que vous injectez, la mise à jour
n'étant proposée qu'après une sauvegarde vérifiée. Les briques sont exportées séparément (`pickLanguage`,
`waitFonts`, `openStore`) quand un jeu a besoin d'un autre ordre.

Ce que votre build garde : `vite.config.ts` avec `server.host` sur `127.0.0.1` sauf `WEB_SCUMM_LAN=1`, l'écriture
des layouts et chaque route `/__studio` derrière `authorizeStudioRequest` (`tools/studio/security.ts`), et VitePWA en
`registerType: 'prompt'`, `injectRegister: false`, `skipWaiting: false` (obligatoire avec la proposition de mise à
jour) ; `package.json` avec les scripts de la section 7 (`tools/doctor.ts`, `tools/serve.ts`, `scripts/e2e-pwa.mjs`) ;
`scripts/e2e/lib.mjs` (`E2E_BROWSER`, `--prod` ; un script qui lit la sortie humaine de `npm run solve` continue de
marcher) ; `env.d.ts` avec `/// <reference types="vite-plugin-pwa/client" />`. Le `game` du moteur est un clone
compilé (`compileGame`), gelé quand `schemaVersion` vaut 3 : un outil qui modifiait l'objet passé à `Engine` doit
passer par l'API du moteur.

<a name="line-ids"></a>
<!-- applies: 3.2.0.. -->

## 9. Ids de lignes (3.2) : des traductions et des voix qui survivent à une insertion

Chaque `say`, `toast` et `guide` peut porter un `id` stable (`house.open-door.l-just-a-door` : son propriétaire, puis
le début de son texte). Une table de traduction et un clip de voix sont alors indexés par lui : insérer, déplacer ou
supprimer une ligne ne décale jamais les autres. `npm run ids -- --lines --write --map` donne leurs ids aux objets qui
n'en ont pas et renomme les clés de `locales/*.json` (une seconde passe renomme depuis les chemins courants ; rien de
déjà consigné dans `ids.migration.json` / `ids.paths.json` n'est perdu) ; `--lines=all` transforme d'abord chaque
ligne en chaîne nue en `{ say: ['hero', texte], id }` : exigé pour un jeu livré dans une autre langue que la sienne
(`game.lang`, `en` par défaut) ou doublé ; la démo l'a fait en 3.2.1. `audio.voices[<id de ligne>]` joue sans écrire
`voice` sur la ligne. `npm run validate -- --release` signale une ligne sans id (une erreur, chaînes nues comprises,
dans un jeu traduit ou doublé : lancer `--lines=all` une fois ; un avertissement sinon) ; `npm run i18n -- voices` liste les lignes avec un id et sans clip, et les clips qu'aucune ligne ne réclame.

<a name="list-lines"></a>
<!-- applies: 3.3.0.. -->

## 10. Lignes de listes (3.3) : regards, indices, réponses par défaut et réactions par sorte

Les lignes que le moteur tire d'une liste (une liste de regard, les lignes d'un indice, `rules.fallbacks.<verbe>`)
peuvent être `{ id, text }` au lieu d'une chaîne nue, un indice peut porter un `id`, et une réaction par sorte aussi
(`rules.kinds[i]`). Leurs traductions sont alors indexées par l'id (`room:house/look.pantry.<id>`,
`room:house/hints.<id d'indice>.lines.<id>`, `item:key/look.<id>`, `rules/fallbacks.look.<id>`,
`rules/kinds.<id>.say`), et `audio.voices[<id>]` les double. `npm run ids -- --lines=all --write --map` convertit les
chaînes nues des listes dans `rooms/*.ts`, `items.ts`, `rules.ts` et `game.ts`, nomme indices et sortes, et renomme les
clés de `locales/*.json` (`--lines` seul n'ajoute d'ids qu'aux objets qui n'en ont pas). Une ligne de regard unique
(`look: { door: '…' }`) est déjà indexée par son propriétaire et reste une chaîne. Une release traduite ou doublée les
exige, comme les lignes `say` (`validate -- --release`). Le Studio édite une ligne `{ id, text }` au même chemin qu'une
ligne nue (`look.pantry[1]`). La démo : 109 ids, 91 clés de traduction renommées par langue, français toujours à 400/400.

<a name="stage"></a>
<!-- applies: 3.4.0.. -->

## 11. La scène (3.4) : rien à réécrire

Le `decor` d'un lieu est son calque de fond, et le `walk` de son layout est la zone de marche `main` (`stageOf`,
src/engine/core/stage.ts) : un ancien lieu garde son image (`npm run e2e:visual`) et ses sauvegardes (une scène
n'ajoute rien à l'état). Calques, occulteurs, lumières, particules, plusieurs zones de marche et leurs liens s'ajoutent
quand un lieu en a besoin (CONTENT_GUIDE « La scène »). Un layout qui a `walk` et `walkZones` garde les zones
(`validate` avertit).

<a name="from-3-x-to-4-0"></a>
<!-- applies: 4.0.0.. -->

## 10. De la 3.x à la 4.0

La 4.0 ne change aucun format : le schéma d'écriture reste 3, l'enveloppe des sauvegardes reste en schéma 3, et toute
sauvegarde 3.x se charge. Ce qui change, c'est ce qui est promis ([Stabilité et support](start.stability.md)) :

1. **Importer depuis l'API publique.** `web-scumm/content` (`defineGame`, `defineRoom`, chaque type de contenu),
   `web-scumm/player` (`bootGame`, `AssetManifest`), `web-scumm/minigames` (`Minigame`), `web-scumm/testing`
   (`Engine`, `solve`, `parseSave`…). Les chemins `@engine/*` marchent toujours mais sont internes. Dans un jeu de ce
   dépôt : `sed -i.bak -E "s#'@engine/core/(types|define|custom)'#'web-scumm/content'#" games/<id>/*.ts games/<id>/rooms/*.ts`, puis les
   autres à la main ([API publique](engine.api.md) dit quel nom est dans quelle entrée).
2. **Un jeu dans son propre projet** ([Référence du paquet](install.package.md)) : `npx create-web-scumm`, déplacer `games/<id>/*` dans
   `game/`, `npm install`, `npx web-scumm verify`.
3. **`RevealDef`** est déprécié : utiliser `EndingDef` (retiré en 5.0).
4. `npx web-scumm migrate --check` (ou `npm run migrate -- --check` ici) dit si quelque chose est dû.
