# Captures avant et après

Sous le diff sémantique, **Capture the rooms (before / after)** dessine chaque lieu que les changements nomment aux
deux révisions, côte à côte, avec le rectangle où elles diffèrent encadré : un placement déplacé, une police ou une
ligne qui déborde se voient d'un coup d'œil.

<a name="what-you-get"></a>

## Ce que vous obtenez

Pour chaque lieu que le diff nomme, deux images (avant, après) dessinées par le vrai moteur, la zone changée encadrée,
ou « no visible change » quand aucun pixel n'a bougé. Les PNG restent sur le disque.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local seulement (`npm run studio`, dépôt du moteur ou projet créé), depuis la 4.4.0.

> [!GUARANTEE id=captures-local-only]
> Un Studio hébergé (il fait tourner le jeu dans un worker, qui n'a pas de navigateur) répond aux captures du diff par
> `{ unavailable: true }` au lieu de captures.

En HTTP, cette réponse est un 501 `{ unavailable, reason }` ; le test appelle le Studio directement.

<a name="prerequisites"></a>

## Prérequis

- Playwright et son Chromium sur votre machine :

  ```sh
  # dans le dépôt du moteur ou le projet créé
  npm i -D playwright && npx playwright install chromium
  ```

- Les assets préparés du jeu (`npm run assets`).
- Deux révisions à comparer : [Diff sémantique](studio.semantic-diff.md).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Check, sous **Changes between revisions**. Les commandes ci-dessus se lancent dans le
dossier que sert le Studio.

<a name="steps"></a>

## Étapes

<!-- step: diff -->
1. Affichez les changements entre deux révisions ([Diff sémantique](studio.semantic-diff.md)).

<!-- step: capture -->
2. Cliquez **Capture the rooms (before / after)**. « Building both revisions and drawing their rooms… » s'affiche
   pendant le travail : chaque côté est un build du jeu, quelques secondes chacun.

<!-- step: read -->
3. Lisez chaque paire : le lieu, pourquoi il est dessiné, les images avant et après, le rectangle où elles diffèrent,
   ou « no visible change ». Un côté qui ne peut pas être dessiné dit pourquoi (la révision ne se construit pas, le
   lieu n'y est pas) ; l'autre côté reste affiché.

<a name="what-is-drawn"></a>

### Quels lieux, et comment

- **Les lieux dessinés** : ceux dont les changements touchent le layout, la source ou les textes dans une langue
  (`room:<id>/…`). Un changement de fichiers partagés seuls (le casting, les objets, `site.json`) dessine le premier
  lieu. Six lieux au plus. Sans rien à dessiner : « No room to capture: nothing these revisions changed is drawn. »
- **Chaque révision** est le dossier du jeu avec les opérations suivantes du journal défaites, construit comme une
  prévisualisation (dans le processus enfant du worker, jamais celui du Studio) et dessiné dans un Chromium sans tête
  en 960 × 600, un pixel d'appareil, mouvements réduits, pas d'animation CSS, polices chargées, surcouches de
  l'éditeur cachées.
- **Le même pixel** : un canal de couleur décalé de 16 ou moins compte pour le même (un bord anticrénelé bouge de 2
  d'un rendu à l'autre).

> [!LIMIT id=capture-scope]
> La langue par défaut du jeu seulement ; le lieu tel qu'on y entre (son premier checkpoint, sinon un état neuf), pas
> à un checkpoint choisi ; les images, sons et polices préparés d'aujourd'hui des deux côtés (une image changée ne se
> voit qu'une fois préparée, et alors des deux côtés) ; une retouche à la main que le journal n'a pas enregistrée est
> des deux côtés ; une révision à plus de 2 000 opérations en arrière ne peut pas être reconstruite.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Des paires d'images avec un cadre autour de ce qui a bougé. Les fichiers sont sous
`.cache/studio/<jeu>-diff-<de>-<à>/`.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| `Playwright is not installed (npm i -D playwright && npx playwright install chromium)` | Pas de Playwright | L'installer comme indiqué |
| `Chromium does not start: …` | Le Chromium de Playwright manque ou ne peut pas tourner | `npx playwright install chromium` |
| `r<n> does not build: …` d'un côté | Le jeu de cette révision ne se construit pas | Lire le message ; l'autre côté est quand même dessiné |
| 501 sur un Studio hébergé | Les captures sont locales seulement | Comparer les mêmes révisions sur un Studio local |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Des PNG sous `.cache/studio/<jeu>-diff-<de>-<à>/` ; rien dans le jeu.

<a name="references"></a>

## Références

- [`studio-server/src/ops/diff-captures.ts`](../../studio-server/src/ops/diff-captures.ts),
  [`tools/studio/diff-rooms.ts`](../../tools/studio/diff-rooms.ts), [`src/studio/diff-captures-view.ts`](../../src/studio/diff-captures-view.ts).
- La route `GET diff/<from>..<to>/captures` : [API du Studio](studio.api.md).
