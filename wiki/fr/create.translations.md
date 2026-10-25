# Traductions

Le contenu reste écrit dans une langue (`lang` dans `game.ts`, `en` en son absence). Traduire, c’est une table, pas des
clés dans le contenu : un fichier JSON par langue, `{ "<chemin>": "<texte>" }`, créé et tenu à jour par l’outil `i18n`.
Cette page donne la marche à suivre, puis la référence des chemins et de la façon dont le joueur obtient une langue.

<a name="what-you-get"></a>

## Ce que vous obtenez

`locales/<lang>.json` à côté du jeu, chaque texte du jeu traduit, un jeu qui propose la langue dans ses Réglages et la
prend dans le navigateur, et `i18n status` à ✔ pour chaque langue.

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur comme un projet créé ; seuls la commande et le dossier changent. Vrai à partir de la 4.3.0 : depuis,
`status` vérifie les aiguillages de texte gardés par une traduction et `i18n.same`.

<a name="prerequisites"></a>

## Prérequis

- Un jeu qui se charge (`validate` passe).
- Des ids stables sur les répliques que vous doublerez ou réordonnerez : `ids --lines --write` (voir
  [Voix](create.voices.md#steps)). Sans id, une réplique est repérée par sa position.

<a name="where-to-run"></a>

## Où lancer les commandes

| Contexte | Dossier | Commande | Fichiers |
|---|---|---|---|
| Dépôt du moteur | sa racine | `npm run i18n -- <sous-commande>` (le jeu : `GAME=<id>`, sinon celui choisi par `npm run game`, sinon `config.game`) | `games/<id>/locales/` |
| Projet créé | sa racine | `npx quest-n-click i18n <sous-commande>` | `game/locales/` |

<a name="steps"></a>

## Étapes

<!-- step: extract-reference -->
1. **Écrire le fichier de référence**, chaque texte du jeu avec son chemin, dans la langue du jeu :

   ```bash
   npm run i18n -- extract              # games/<id>/locales/en.json : chaque texte avec son chemin (la référence)
   npm run i18n -- extract --lang fr    # locales/fr.json : garde ce qui est traduit, suit les textes déplacés, ajoute les manquants
   npm run i18n -- status               # couverture de chaque langue, chemins obsolètes, lignes longues
   ```

   Ces trois commandes tournent dans le dépôt du moteur ; dans un projet créé, ce sont
   `npx quest-n-click i18n extract`, `npx quest-n-click i18n extract --lang fr` et `npx quest-n-click i18n status`.

<!-- step: extract-language -->
2. **Créer ou mettre à jour le fichier de la langue** avec `extract --lang fr`. Les chemins manquants sont ajoutés avec
   le texte source, à traduire ; l’entrée `_` du fichier le dit. La commande affiche combien de textes sont à traduire,
   ont suivi un texte déplacé, sont revenus, ou ont été garés en `_stale`.

<!-- step: translate -->
3. **Traduire les valeurs**, jamais les clés. Gardez les aiguillages de texte de la source (`{form?m=lui|f=elle}`) :
   une traduction doit garder chaque choix que fait sa source, et peut ajouter les siens (un accord que l’anglais écrit
   pareil, `Prêt{form?f=e|*=}`). La syntaxe est dans [Héros](create.heroes.md#hero-choice).

<!-- step: status -->
4. **Vérifier** avec `status`. Pour chaque langue : traduits / total, manquants, obsolètes, longs (plus de
   140 caractères), avec d’autres aiguillages, et les textes identiques à la source. La commande sort en 1 tant qu’une
   langue a un chemin manquant ou obsolète, un aiguillage abandonné, ou un texte identique que `i18n.same` ne liste pas.

<!-- step: ship -->
5. **Publier.** Le `index.ts` du jeu ramasse chaque `locales/*.json` (celui du modèle et ceux des jeux d’exemple le
   font) ; construisez comme d’habitude. Commitez le fichier de référence avec les traductions.

<a name="translations"></a>

## Les chemins, et ce qu’un refactor leur fait

Un chemin ressemble à `room:house/look.pantry[1]`, `item:key/name`, `char:grandma/refuse`, `ui/newGame`,
`rules/fallbacks.look[2]`, `start/intro[0].say`, `credits[3]`, `map/places.house.name`, `objectives/key.title`. Une
ligne avec un id est indexée par lui : `room:house/look.pantry.<id>`, `rules/fallbacks.look.<id>` (les listes acceptent
des lignes `{ id, text }` ; voir [Notes de mise à jour v3](install.upgrade-notes-v3.md#list-lines)). Le fichier est
`{ "<chemin>": "<texte>" }`.

Les chemins suivent la structure, donc un refactor les déplace ; `extract --lang xx` s’en sort. Il compare le jeu au
fichier de référence (rafraîchi en même temps) :

- un texte déplacé (une liste réordonnée, une règle remontée) garde sa traduction, parce que son texte source est le
  même ;
- un texte disparu est garé sous `_stale:<ancien chemin>` : ignoré en jeu, listé par `status`, à supprimer à la main
  quand on est sûr ; il revient avec sa traduction si le chemin réapparaît ;
- un texte dont la source a changé est proposé à nouveau à traduire.

Règle simple : lancer `extract --lang xx` après chaque refactor, avant de traduire du neuf, et commiter le fichier de
référence avec les traductions.

> [!GUARANTEE id=i18n-moved-texts]
> `extract --lang` garde la traduction d’un texte déplacé, gare sous `_stale:` celui qui a disparu, et le ramène avec
> sa traduction quand son chemin revient.

<a name="language-choice"></a>

## Comment le joueur obtient une langue

La langue est choisie au chargement de la page, la première qui s’applique :

1. `?lang=fr` dans l’adresse ;
2. le choix du joueur dans Réglages (gardé dans le navigateur sous `<id du jeu>.lang`) : avec `settings: true`, le menu
   Réglages montre une ligne Langue (`ui.language`) quand le jeu livre une autre langue ; chaque tap passe à la langue
   suivante et recharge la page ;
3. la langue du navigateur, quand le jeu la livre (`fr-CA` prend `fr`) ;
4. sinon la langue du jeu.

Un texte absent d’un fichier reste comme écrit. Les voix suivent la langue : [Voix](create.voices.md#per-language).

> [!LIMIT id=lang-not-shipped]
> `?lang=xx` pour une langue que le jeu ne livre pas montre les textes tels qu’écrits, sans message.

<a name="i18n-same"></a>

## `i18n.same` : identique exprès

Un texte identique à la source est une ligne non traduite, et fait échouer `status`, sauf si `i18n.same` dans
`game.ts` liste son chemin : un nom, `OK`, ▲, un mot que le français a emprunté.

```ts
i18n: { same: ['char:hero/name', 'ui/ok'] },
```

`status` liste aussi les clés `ui` que le jeu laisse aux textes anglais par défaut du moteur : le joueur les voit en
anglais dans toutes les langues.

<a name="coverage"></a>

## Où la couverture se voit aussi

`npm run validate -- --report` (`npx quest-n-click validate --report`) et l’onglet Check du Studio montrent la
couverture par langue. Dans un projet créé, `verify`, `build` et `release` lancent `i18n status` et s’arrêtent sur son
échec.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`status` affiche `✔  fr: <n>/<n> translated` pour chaque langue et sort en 0 ; `?lang=fr` montre le jeu en français.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `… fr: 120/131 translated, 11 missing` | Des textes nouveaux depuis le dernier extract | `extract --lang fr`, traduire |
| `stale   room:house/look.pantry[3]` | Un texte qui n’existe plus | Le supprimer une fois sûr, ou le laisser revenir |
| `switch  <chemin> (source: …; translation: …)` | La traduction abandonne un choix des aiguillages de la source | Remettre l’aiguillage dans la traduction |
| `same    <chemin> (translate it, or list it in i18n.same)` | Un texte laissé comme la source | Le traduire, ou le lister dans `i18n.same` |
| `[<id>] no locales` | Pas encore de fichier de langue | `extract --lang <xx>` |
| La page reste en anglais | `?lang=` mal écrit, un choix gardé pour une autre langue, ou le fichier non livré | Vérifier l’adresse et Réglages ; reconstruire |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`locales/<base>.json` (la référence) et `locales/<lang>.json` ; rien d’autre. `ids --write` (un prérequis) renomme les
clés des fichiers de langue vers les chemins fondés sur les ids.

<a name="recovery"></a>

## Revenir en arrière

Les deux fichiers sont dans Git : `git checkout -- <fichier>` annule un extract. `extract` ne perd rien : un texte
disparu va sous `_stale:`, il n’est jamais supprimé.

<a name="references"></a>

## Références

- [`tools/i18n.ts`](../../tools/i18n.ts), [`src/engine/tools/i18n.ts`](../../src/engine/tools/i18n.ts) (`textPaths`, `mergeLocale`, `localeStatus`, `switchesKept`), [`src/engine/boot.ts`](../../src/engine/boot.ts) (`pickLanguage`)
- [Voix](create.voices.md), [Héros](create.heroes.md), [Les langues, côté joueur](play.languages.md)
