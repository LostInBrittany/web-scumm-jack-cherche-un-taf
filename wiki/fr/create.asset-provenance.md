# Provenance des assets

Une release dit d’où vient chaque image, son, voix et vidéo qu’elle livre, sous quelle licence, et prouve que les
fichiers sont bien ceux que quelqu’un a relus. Cette page montre comment écrire `provenance.json`, le verrouiller après
une relecture, et passer une release ou une release commerciale.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un `provenance.json` qui couvre chaque asset livré exactement une fois, un `provenance.lock.json` qui garde le SHA-256
et la taille de chaque fichier avec les déclarations sous lesquelles il a été relu, et une vérification de release qui
échoue dès qu’un fichier ou une déclaration change sans nouvelle relecture.

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur (`games/<id>/provenance.json`) et le projet créé (`game/provenance.json`). Vrai à partir de 4.2.5
(le nom de commande `quest-n-click`). Le verrou date de 3.3.0, la vérification commerciale de 3.3.1, les fichiers de
licence de l’archive livrée de 3.7.1.

<a name="prerequisites"></a>

## Prérequis

- Les assets préparés : `npm run assets` a tourné, donc `assets.gen.json` et `public/assets/` existent. Les
  vérifications lisent les fichiers de `public/assets` (`ASSETS_DIR` pointe ailleurs, pour une fixture de test).
- Pour chaque asset, vous connaissez sa source, sa licence et son auteur.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, à la racine du dépôt du moteur (`npm run …`) ou du projet créé (`npx quest-n-click …`,
`npm run release`).

<a name="steps"></a>

## Étapes

<!-- step: write-entries -->
1. **Écrire une entrée par source** dans `provenance.json`. Un projet créé en a déjà une : les images de son modèle sont
   des emplacements dessinés à partir de formes, marqués `placeholder`.

   ```json
   {
     "licences": { "allow": ["CC BY 4.0", "own work"] },
     "assets": [
       { "match": "img:*", "source": "Drawn for the game from the prompts in prompts.md", "author": "Wano",
         "licence": "CC BY 4.0", "status": "final" },
       { "match": "sfx:door_*.mp3", "source": "Recorded at home", "author": "Wano", "licence": "own work",
         "status": "final" }
     ]
   }
   ```

   Les champs sont dans [la référence](#provenance) plus bas. Chaque asset doit correspondre à exactement une entrée.

<!-- step: check -->
2. **Vérifier la couverture.**

   ```bash
   # dans le dépôt du moteur
   npm run provenance          # les assets par licence, et ce qui a changé depuis le verrou (code 1 : quelque chose à relire)
   npm run validate            # un jeu avec provenance.json : chaque asset couvert une fois, chaque entrée complète
   ```

   ```bash
   # dans le projet créé
   npx quest-n-click provenance
   npx quest-n-click validate
   ```

<!-- step: review-and-lock -->
3. **Relire, puis verrouiller.** Regardez chaque fichier et son entrée. Puis :

   ```bash
   # dans le dépôt du moteur
   npm run provenance -- --lock
   ```

   ```bash
   # dans le projet créé
   npx quest-n-click provenance --lock
   ```

   La commande refuse de verrouiller tant qu’un asset n’est pas couvert, est ambigu, a une entrée incomplète ou un
   fichier manquant (`✖ … not locked: fix the provenance first`).

<!-- step: release -->
4. **Passer les portes de release.**

   ```bash
   # dans le dépôt du moteur
   npm run verify:release      # validate --release, weight --release, i18n status, voices check --release, playtests stricts
   npm run verify:commercial   # verify:release, puis validate --commercial, puis verify:dist
   ```

   ```bash
   # dans le projet créé
   npm run release                         # comprend validate --release
   npm run release -- --commercial         # avec validate --commercial en plus
   ```

> [!GUARANTEE id=provenance-lock-detects-change]
> Après `--lock`, un fichier dont les octets ont changé, un asset livré depuis, un fichier manquant ou une entrée dont
> la licence a été modifiée est signalé.

`validate --release` échoue sur chacun, un `validate` simple ne fait qu’avertir. Un motif ou un statut modifié est
signalé comme une licence modifiée.

> [!LIMIT id=claims-not-truth]
> Les vérifications disent que les déclarations sont complètes et permettent la release (ou la vente), pas qu’elles
> sont vraies. Une mauvaise licence écrite de bonne foi passe. La relecture avant `--lock` est le travail d’une
> personne.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`npm run provenance` se termine par `✔ [<jeu>] provenance clean: every file is the one reviewed`, et `verify:release`
(projet créé : `npm run release`) passe. Ce qu’une exception laisse passer s’affiche en `ℹ accepted: …`, nommément, pas
comme un avertissement à corriger.

<a name="common-errors"></a>

## Erreurs fréquentes

| Message | Cause | Correction |
|---|---|---|
| `✖ [<game>] no provenance.json: say where every asset comes from first` (`provenance`), `provenance.json › missing: a release says where every asset comes from` (`validate --release`) | Pas de fichier | Écrivez-le (étape 1) |
| `<key>: no entry says where it comes from` (`provenance`), `provenance.json › <key>: no entry says where this asset comes from` (`validate`) | Aucun `match` ne couvre l’asset | Ajoutez une entrée, ou élargissez un motif |
| `<key>: more than one entry matches` (`provenance`), `… more than one entry matches this asset; make the patterns disjoint` (`validate`) | Deux entrées couvrent l’asset, quel que soit leur ordre | Resserrez un motif |
| `<match>: an entry needs match, source, licence and status` | Une entrée incomplète | Remplissez les quatre champs |
| `provenance.lock.json › missing: …` | Jamais verrouillé | Relisez, puis étape 3 |
| `provenance.json › <key>: a placeholder would ship; replace it, or add a releaseExceptions entry that names it and says why` | Un `placeholder` dans une release | Remplacez le fichier et marquez-le `final`, ou ajoutez une entrée `releaseExceptions` |
| `provenance.json › <licence>: not in licences.allow (…), used by n asset(s): …` | Une licence hors de la politique | Autorisez-la, remplacez l’asset, ou exceptez-le nommément |
| `provenance.json › releaseExceptions › …: a commercial release ships no exception` | `verify:commercial` refuse toute exception | Remplacez l’asset |
| `provenance.json › …: <licence> does not allow commercial use (or changes)` | Une licence `NC` ou `ND` dans une release commerciale | Remplacez l’asset |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `provenance.json` (vous l’écrivez), `provenance.lock.json` (`--lock` l’écrit).
- Le build écrit, dans `dist/licenses/` : `LICENSE`, `LICENSE-ASSETS`, `CREDITS.md`, `THIRD_PARTY_NOTICES.txt` et
  `assets-manifest.json` (voir [la référence](#archive)).

<a name="recovery"></a>

## Revenir en arrière

Un verrou est un fichier : sous git, `git checkout -- provenance.lock.json` ramène le précédent. Changer un fichier
après un verrou n’est pas une erreur à annuler : relisez-le, puis verrouillez de nouveau.

<a name="provenance"></a>

## Référence : `provenance.json`

<a name="entries"></a>

### Les entrées

`assets: [{ match, source, licence, author?, url?, prompt?, status, note? }]`

| Champ | Forme | Sens |
|---|---|---|
| `match` | une clé d’asset avec `*` | `img:<id d’image du manifeste>`, `sfx:<fichier>`, `music:<fichier>`, `voice:<fichier>`, `video:<fichier>` |
| `source` | texte | D’où il vient : un outil, une boutique, un fichier du dépôt |
| `licence` | texte | `CC BY 4.0`, `own work`… |
| `author` | texte, facultatif | Exigé par `verify:commercial` |
| `url` | texte, facultatif | Où vérifier la source (une page de boutique, une licence, un dépôt) |
| `prompt` | texte, facultatif | Le prompt de génération |
| `status` | `final` ou `placeholder` | Un emplacement fait échouer une release, sauf exception |
| `note` | texte, facultatif | Libre |

Les clés correspondent aux fichiers construits : `img:<id>` → `public/assets/img/<id>.webp`, `sfx:<fichier>` →
`audio/sfx/<fichier>`, `music:<fichier>` → `audio/music/<fichier>`, `voice:<fichier>` → `audio/voices/<fichier>`,
`video:<fichier>` → `video/<fichier>`.

<a name="policy"></a>

### Politique de licences et exceptions

- `licences: { allow: ['CC BY 4.0', 'own work'] }` : une release l’exige ; toute autre licence échoue, sauf exception
  qui nomme l’asset.
- `releaseExceptions: [{ match, reason }]` : laisse passer un emplacement ou une licence nommés dans une release, avec
  sa raison. Une exception ne couvre jamais un emplacement ajouté plus tard.

<a name="checks"></a>

### Ce que vérifie chaque commande

| Commande | Vérifie |
|---|---|
| `npm run validate` | Un jeu qui a le fichier : chaque asset couvert par exactement une entrée, chaque entrée complète ; un verrou en désaccord n’est qu’un avertissement |
| `npm run validate -- --release` | Exige le fichier, la politique de licences et le verrou ; échoue sur un emplacement ou une licence non exceptés, et sur toute différence avec le verrou (fichier changé, asset livré depuis, fichier manquant, entrée modifiée) |
| `npm run provenance` | Affiche les assets par licence et ce qui a changé depuis le verrou ; code 1 quand quelque chose est à relire |
| `npm run provenance -- --lock` | Écrit `provenance.lock.json` : le SHA-256 et la taille de chaque fichier livré, avec les déclarations de son entrée (motif, licence, statut) |
| `npm run verify:commercial` | `verify:release`, puis `validate --commercial` : aucune entrée `releaseExceptions`, aucun emplacement, aucune licence non commerciale ou sans modification (`NC`, `ND`), chaque entrée avec un `author` et une source vérifiable (une `url`, ou un fichier du dépôt cité dans `source`) |

`npm run new-game` (dépôt du moteur) écrit un `provenance.json` pour les images qu’il emprunte au jeu d’exemple : que
des emplacements, en CC BY 4.0. Le fichier du jeu d’exemple n’a aucune exception : tous ses assets sont en CC BY 4.0
depuis 3.7, et il passe `verify:commercial`. `tests/fixtures/release-game` y échoue exprès.

<a name="archive"></a>

### Ce que contient l’archive livrée (3.7.1)

Les vérifications ci-dessus lisent le graphe d’assets du jeu ; l’archive, c’est ce que Vite copie dans `dist/`, et dans
le dépôt du moteur `public/` est partagé par tous les jeux. Chaque build se termine donc par `tools/dist.ts seal` (un
plugin Vite) : les assets qui ne sont pas à ce jeu sont retirés, et `dist/licenses/` est écrit : la `LICENSE` du moteur,
`LICENSE-ASSETS` (celle du jeu s’il en a une), `CREDITS.md` tiré de sa provenance, `THIRD_PARTY_NOTICES.txt` (la
licence de chaque paquet dont le bundle a pris du code, celle de Workbox pour le service worker, l’OFL des polices) et
`assets-manifest.json` (chaque fichier : chemin, auteur, source, licence, SHA-256, statut). Puis `npm run verify:dist`
(une étape de `npm run build`, donc de la release) classe chaque fichier de `dist/` : du code, un asset verrouillé dont
les octets sont ceux relus, un fichier de données que le jeu nomme (`ending.file`), une police, une icône, une notice.
Tout le reste échoue, de même qu’un fichier verrouillé ou une notice qui manque. La release joint le manifeste des
assets à côté de l’archive.

Les budgets de poids et les vérifications de traduction que lancent les mêmes portes de release sont dans
[Images](create.images.md#images), [Build et release](create.build-release.md) et [Traductions](create.translations.md).

> [!LIMIT id=audit-is-different]
> `npm run audit` (dépôt du moteur) est une autre vérification : elle tient les noms d’un projet privé hors du dépôt
> public. Elle ne dit rien des licences.

<a name="references"></a>

## Références

- [`tools/provenance.ts`](../../tools/provenance.ts), [`tools/provenance-files.ts`](../../tools/provenance-files.ts),
  [`src/engine/tools/provenance.ts`](../../src/engine/tools/provenance.ts), [`tools/dist.ts`](../../tools/dist.ts),
  [`tests/provenance.test.ts`](../../tests/provenance.test.ts).
- [Build et release](create.build-release.md) · [Images](create.images.md) · [Bruitages](create.sound-effects.md) ·
  [Voix](create.voices.md) · [Licences et crédits](contribute.licences.md).
