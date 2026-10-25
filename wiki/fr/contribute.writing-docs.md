# Écrire la documentation

Comment la documentation de quest'n'click s'écrit, se vérifie et se publie : une seule source, `wiki/`, en anglais et en
français, d'où sont générés le wiki GitHub, le site Pages par version, le bundle du paquet et les outils MCP de
documentation. Cette page est d'abord la procédure pour écrire ou modifier une page, puis la référence de ce qu'une page
et le manifeste peuvent contenir.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une page, ou une modification d'une page, dans les deux langues, que `npm run wiki -- check` accepte, dont les faits
sont reliés au code sur lequel elle repose, et que la prochaine release publie. Une page modifiée directement dans le
wiki GitHub n'est pas conservée : le wiki est généré, et sa publication suivante l'écrase.

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur. L'outillage du wiki est nouveau en 4.5.0 (ADR 0030, D50, `docs/dev/PLAN-4.5-WIKI.md`). Depuis la
bascule de la 4.5.0, `docs/en` et `docs/fr` sont des pages de transition que `npm run wiki -- transition` écrit depuis
la matrice de couverture : ne les modifiez jamais, écrivez dans `wiki/`. La publication ne part que d'une release, après `ship verify`,
jamais de `main` ([Publier une release](contribute.releasing.md)).

<a name="prerequisites"></a>

## Prérequis

- Un dépôt préparé : [Préparer son poste de développement](contribute.setup.md).
- Les faits que vous écrivez, lus dans le code actuel : quand le code et une ancienne page divergent, le code l'emporte.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, sur votre machine. Chaque commande `npm run wiki -- …` lit `wiki/` par défaut
(`--wiki=<dossier>` en lit un autre, comme le font les tests).

<a name="steps"></a>

## Étapes

<!-- step: find-entry -->
1. **Trouvez l'entrée de la page dans `wiki/manifest.json`.** Chaque page en a une, écrite ou non : son `id`, son
   type, son public, son contexte, ses titres, ses URL, son état. Une nouvelle page a d'abord besoin de son entrée ; une
   entrée n'est jamais renommée (l'id nomme le fichier et ne bouge jamais).

<!-- step: copy-template -->
2. **Partez du modèle de son type**, `wiki/_templates/<type>.en.md` et `<type>.fr.md` (tutorial, howto, reference,
   explanation, troubleshooting), copiés en `wiki/en/<id>.md` et `wiki/fr/<id>.md`. Gardez les ids de section du
   modèle ; supprimez ses commentaires. L'en-tête (type, public, contexte, versions, états, changement de langue) et le
   pied de page sont générés : ne les écrivez pas.

<!-- step: write-natively -->
3. **Écrivez chaque langue dans sa langue**, pas mot à mot : des phrases courtes, les mêmes sections et les mêmes
   faits. Chaque commande est précédée du dossier et du contexte où elle se lance (le dépôt du moteur, un projet créé,
   un Studio hébergé). Un chiffre a une date et une source. Une garantie dit sa limite et sa preuve. `docs/dev` est de
   la « documentation publique de développement », jamais « interne ».

<!-- step: manifest-fields -->
4. **Remplissez l'entrée** : `state` (`draft`, puis `ready`), `versions.appliesFrom`, des `sources` précises, des
   `questions` pour une page de procédure ou de dépannage, `aliases`, `keywords`, `identifiers`, `related`,
   `prerequisites`, `claims` pour chaque `[!GUARANTEE]`, `surfaces` là où un contrat s'applique (ids de
   `docs/dev/contracts.json`). Le champ `replaces` est généré depuis la matrice de couverture : on ne le tape jamais.

<!-- step: check -->
5. **Vérifiez.**

   ```sh
   # dans le dépôt du moteur
   npm run wiki -- check
   ```

   Elle finit par `✔  wiki (work level): <n> pages consistent, <w> warning(s), <l> link(s) to planned pages`, ou liste
   chaque erreur (`✖`) avec son fichier et sa ligne. Les avertissements (`⚠`) et ce qui reste à écrire (`·`) ne la font
   pas échouer.

<!-- step: record-reviews -->
6. **Consignez qui a lu quoi** une fois les deux langues lues l'une contre l'autre, et une fois le test d'une garantie
   lu contre la garantie :

   ```sh
   # dans le dépôt du moteur
   npm run wiki -- translations --ack <id>#<section> --by <name> --kind human|ai --relation author|independent
   npm run wiki -- review-claim <claim-id> --by <name> --kind human|ai --relation author|independent
   ```

<!-- step: preview -->
7. **Regardez le wiki généré** quand la mise en page compte :

   ```sh
   # dans le dépôt du moteur
   npm run wiki -- build --target wiki --out .cache/wiki --preview
   ```

   Le dossier de sortie doit être hors de l'arbre de travail ou sous `.cache/` ; `--preview` inclut les pages `draft`.

<!-- step: pull-request -->
8. **Ouvrez la pull request** avec les deux langues ensemble. Une branche qui ne touche que `wiki/` n'a pas besoin de
   fragment `changes/` ([Conventions](contribute.conventions.md#changes-fragments)) ; le premier palier de la CI lance
   les vérifications de la documentation à chaque changement.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`npm run wiki -- check` finit par `✔` et 0 erreur. `npm run wiki -- stats` montre la page dans son état. Quand la page
répond à une vraie question, `npm run wiki -- acceptance` la trouve dans les trois premiers résultats de cette question,
et en premier pour une question marquée `top1` (un symptôme clair comme « pas de son », un message tapé en entier) ; le
rapport donne à part le top 3 et le top 1 ([les commandes](#commands)). Ni l'un ni l'autre ne dit qu'un lecteur
comprend la réponse ou sait la suivre : c'est le test du lecteur IA et les passes humaines. Ajoutez une nouvelle
formulation à `questions.json` plutôt qu'aux alias de la page, pour que le test mesure encore des formulations pour
lesquelles la page n'a pas été écrite.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `<id> (draft): fr/<id>.md is missing (both languages)` | Une seule langue écrite | Écrivez les deux ; une page écrite a toujours ses deux fichiers |
| `<id> (planned): planned, yet en/<id>.md exists` | Un fichier pour une page encore `planned` | Passez son `state` à `draft` (avec `versions` et `sources`) |
| `the source "<glob>" matches no tracked file` | Un motif mal écrit, ou un fichier pas encore committé | Corrigez le motif ; `git add` le fichier |
| `line <n>: links to <path>, which git does not track` | Un lien vers le dépôt qui ne se résout pas | Les liens vers des fichiers sont `../../chemin/dans/le/dépôt`, depuis `wiki/<lang>/` |
| `<id>.md#<anchor> is not a section of <lang>/<id>.md` | Un lien vers un id de section qui n'existe pas | Utilisez l'id de section de la page cible, le même dans les deux langues |
| `the section ids differ between en and fr` | Une page `ready` dont les jumelles n'ont pas les mêmes sections | Les mêmes ids `<a name>` dans les deux |
| `a howto page asks at least one question in en and fr` | `questions` vide | Ajoutez au moins une question naturelle par langue |
| `coverage.json …: <id>#<section> is not a section of <id>` | La matrice de couverture envoie une ancienne section vers un id que la page n'a pas | Donnez cet id de section à la page |
| `⚠ the source "<glob>" covers <n> files (> 25)` | Un motif trop large | Resserrez-le : un changement ordinaire ne doit pas faire relire des dizaines de pages |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`wiki/en/<id>.md`, `wiki/fr/<id>.md`, l'entrée de la page dans `wiki/manifest.json` ; `wiki/translations.json` et
`wiki/reviews.json` par leurs commandes ; des images sous `wiki/images/` seulement.

<a name="recovery"></a>

## Revenir en arrière

Tout est dans Git. Une révision publiée de la documentation est immuable : une correction de la documentation d'une
version publiée est une nouvelle révision `r<n>` faite depuis une branche `docs/<version>` et publiée par le workflow
`docs-publish`, jamais une modification de ce qui a été publié.

<a name="layout"></a>

## Référence : le dossier `wiki/`

| Chemin | Ce qu'il contient |
|---|---|
| `wiki/manifest.json` | La carte de la documentation : une entrée par page, écrite ou non |
| `wiki/en/<id>.md`, `wiki/fr/<id>.md` | Les pages, un fichier par langue |
| `wiki/_templates/*.{en,fr}.md` | Les cinq modèles de page |
| `wiki/images/` | Les seules images qu'une page peut montrer (`../images/<fichier>` depuis une page) |
| `wiki/coverage.json` | La matrice de couverture : chaque section de l'ancienne documentation et ses destinations |
| `wiki/legacy.json` | Pour chacune des huit pages de `read_doc { name }`, les sections ordonnées qui la reconstruisent |
| `wiki/translations.json` | Quelle révision de chaque langue a été lue contre l'autre, et par qui |
| `wiki/reviews.json` | Quelles garanties ont vu leur portée lue contre leur test, et par qui |
| `wiki/data/env.json`, `wiki/data/glossary.json` | Le registre des variables d'environnement et le glossaire bilingue |
| `wiki/acceptance/questions.json` | Les vraies questions auxquelles la documentation doit répondre, avec des contre-exemples |

<a name="manifest"></a>

## Référence : le manifeste

### Forme

`{ "format": "quest-n-click-docs-manifest", "version": 1, "pages": [...] }`. Le schéma est strict : un champ qu'il ne
nomme pas est refusé, si bien qu'une clé mal écrite est une erreur.

### Valeurs

| Champ | Obligatoire | Sens |
|---|---|---|
| `id` | oui | `<domaine>.<slug>` en minuscules avec tirets ; nomme le fichier, ne bouge jamais |
| `domain` | oui | `index`, `start`, `play`, `install`, `create`, `engine`, `studio`, `team`, `clever`, `bridge`, `contribute`, `reference`, `help` |
| `type`, `alsoTypes` | `type` | `tutorial`, `howto`, `reference`, `explanation`, `troubleshooting`, `index` |
| `audience` | oui | `player`, `author`, `admin`, `contributor` |
| `context` | oui | `engine-repo`, `created-project`, `studio-local`, `studio-demo`, `studio-hosted`, `bridge`, `player` |
| `title.{en,fr}`, `url.{en,fr}` | oui | Les titres naturels ; les URL publiques (ci-dessous) |
| `state` | oui | `planned`, `draft`, `ready` (ci-dessous) |
| `versions` | dès `draft` | `appliesFrom` (la première version pour laquelle ce que dit la page est vrai et marche), `appliesUntil`, `featureSince` |
| `sources` | non vide dès `draft` | Des motifs des fichiers suivis sur lesquels repose la page : ses sources de dérive |
| `replaces` | généré | Les anciennes sections que la page reprend, depuis la matrice de couverture |
| `questions.{en,fr}` | procédure et dépannage : au moins une chacune | Les questions naturelles d'un lecteur |
| `aliases`, `keywords` | facultatif | D'autres noms (un ancien nom, un synonyme), d'autres mots de recherche |
| `identifiers` | oui (peut être vide) | Les identifiants exacts que la page documente : une commande, un script npm, une variable, une route, un code |
| `related`, `prerequisites` | oui (peuvent être vides) | D'autres ids de page |
| `claims` | avec chaque `[!GUARANTEE]` | `{ id, test: "fichier.test.ts › describe › it" }` |
| `surfaces` | facultatif | Des ids de `docs/dev/contracts.json` ; l'en-tête montre leurs états |
| `lifecycle` | facultatif | `deprecated` ou `archived`, une page gardée pour d'anciennes versions |
| `owner`, `reviewed` | facultatif | `@wanoo` par défaut ; le jour de la dernière relecture |

**Les URL** sont mécaniques : `EN-<Domain>-<Topic>` et `FR-<Domaine>-<Sujet>`, des mots ASCII avec une capitale
chacun, joints par des tirets, le mot fixe du domaine (`Start`/`Demarrer`, `Create`/`Creer`, `Engine`/`Moteur`,
`Team`/`Equipe`, `Contribute`/`Contribuer`, `Help`/`Aide` ; les autres identiques dans les deux langues), les sigles en
capitales (`EN-Reference-NPM-Scripts`, jamais `Npm`). Les URL sont uniques sans tenir compte de la casse.

### Contraintes

| `state` | Sens | Publiée |
|---|---|---|
| `planned` | Destination décidée, pas de fichier (un fichier est une erreur) | Non |
| `draft` | Fichiers dans les deux langues, vérifications incomplètes | Non : en prévisualisation seulement, avec un bandeau « draft » |
| `ready` | Complète, vérifications passées, traduction appariée | Oui |

`ready` dit que le travail est complet, pas qu'une personne l'a relu : cela se consigne à part
([Relectures](#reviews)). Les quatre index (`index.by-task`, `index.by-symptom`, `index.identifiers`, `index.glossary`)
sont `generated: true`, n'ont pas de fichier et sont construits depuis les données. `wiki -- check` avertit quand un
motif couvre plus de 25 fichiers, ou quand un fichier source nourrit plus de 10 pages.

<a name="page-anatomy"></a>

## Référence : une page

**Ids de section.** Une ancre HTML simple, seule sur sa ligne, avant chaque titre `##` ou `###`, en minuscules avec
tirets, le même id dans les deux langues ; un lien vers une section survit à un titre traduit :

```markdown
<a name="walkable-zones"></a>

## Zones de marche
```

**Liens.** Une autre page : `create.rooms.md#walkable-zones` (relatif, dans le même dossier de langue). Un fichier du
dépôt : `../../src/engine/core/save.ts`, depuis `wiki/<lang>/` ; un `src/x.ts` nu est refusé. Une image :
`../images/<fichier>`. Le build réécrit chaque lien pour chaque sortie (wiki, Pages, bundle). Un lien vers une page
`planned` est listé, pas une erreur, au niveau de travail ; une page publiée ne peut pointer que vers des pages `ready`.

**Étapes.** Chaque étape essentielle d'une procédure porte `<!-- step: <id> -->` sur la ligne qui la précède ;
l'ensemble des ids d'étape est le même dans les deux langues.

**Versions d'une section.** Une section vraie pour moins de versions que sa page le dit sur la ligne qui suit son
ancre, dans les bornes de la page et identiquement dans les deux langues : `<!-- applies: 4.2.2.. -->` (à partir de),
`<!-- applies: 4.2.2..4.4.0 -->` (bornes incluses), `<!-- applies: ..4.4.0 -->` (jusqu'à), avec `since <v>` pour la
version où la fonction est apparue et un `deprecated` ou `archived` final pour une section gardée pour d'anciennes
versions. Un marqueur mal formé est une erreur, jamais ignoré.

<a name="structured-blocks"></a>

## Référence : les blocs structurés

Des citations avec un id, appariées par id entre les langues, et rendues par le build :

```markdown
> [!LIMIT id=local-only]
> Disponible sur le Studio local seulement, pas sur un Studio hébergé.

> [!GUARANTEE id=restore-empty-db-only]
> Une restauration ne va que dans une base vide ; toute autre est refusée.

> [!MEASURE id=restore-time]
> 30 à 60 s, observé : une observation, jamais une promesse.
> - date: 2026-10-19
> - version: 4.2.3
> - volume: 508 lignes de journal
> - conditions: les plus petits plans
> - source: https://github.com/Quest-n-Click/quest-n-click/blob/<40-hex sha>/docs/dev/QUALIF-4.2.3-REFERENCE.md
```

- **`[!LIMIT]`** : ce que la page ne couvre pas, ou là où une fonction s'arrête, dit simplement.
- **`[!GUARANTEE]`** : un comportement que le produit garantit, avec sa garantie du manifeste `{ id, test }` qui nomme
  un vrai test par ses titres de `describe` et le sien, joints par ` › `. Un test écrit `.skip`, `.todo`, `.only`,
  `.fails`, `.skipIf` ou `.runIf` ne soutient aucune garantie. Une garantie a trois états, montrés tels quels :
  **référencée** (le test existe), **exécutée** (il est passé sur le commit documenté, lu dans le rapport JSON Vitest
  du candidat ; `check --publish` l'exige), **portée relue** (quelqu'un a lu que le test couvre la garantie ; un
  changement du texte de la garantie ou du fichier de test la remet à zéro). Les ids de garantie sont uniques dans tout
  le manifeste.
- **`[!MEASURE]`** : cinq lignes `- clé: valeur` avec les clés en anglais dans les deux langues ; date, version et
  source identiques dans les deux ; la source est un lien GitHub à un commit complet de 40 caractères (`blob/<sha>/…`).

<a name="examples"></a>

## Référence : les exemples vérifiés

Un bloc de code marqué `room-example` contient du JSON : un lieu tel que le prend `defineRoom`, ou `{ "room", "layout",
"items", "characters", "verbs", "hero" }` quand il a besoin de sa géométrie, de ses objets, de ses acteurs, des verbes
propres au jeu ou d'un autre héros. Il est placé dans un jeu d'un seul lieu (schéma 3) et passé au validateur du
moteur : toute erreur fait échouer `wiki -- check`. Un bloc marqué `studio-config` contient une configuration du Studio
Server, chargée par le chargeur du serveur lui-même (`loadConfig`) : ce qu'il refuse, la vérification le refuse.
Utilisez de simples blocs `json` ou `ts` pour tout ce qui ne doit pas être validé. L'analyseur ne lit jamais l'intérieur
d'un bloc de code : une syntaxe montrée dans un bloc (comme les exemples de cette page) n'est pas prise pour une vraie
ancre ou un vrai bloc.

<a name="parity"></a>

## Référence : la parité entre français et anglais

Il n'y a pas de langue source. Pour une page `ready`, `wiki -- check` compare les deux langues par le sens, pas par les
mots : les mêmes ids de section, les mêmes destinations de liens (`id#section`, jamais les URL), les mêmes blocs
structurés par genre et par id, les mêmes ids d'étape, les mêmes versions de section, et pour une mesure la même date,
la même version et la même source. Le texte traduisible (répliques, libellés, commentaires dans les blocs de code) peut
différer ; les commandes shell restent identiques, commentaires à part.

<a name="reviews"></a>

## Référence : traductions et relectures

`wiki/translations.json` consigne, pour chaque section `<id>#<section>` d'une page `ready` (`<id>#_lead` pour le texte
avant la première section), l'empreinte de chaque langue lue contre l'autre et ses relecteurs. Quand l'un des textes,
ou une image que montre la section, change, la paire est « à relire » : un avertissement au niveau de travail, une
erreur pour `check --publish`. `wiki/reviews.json` consigne la même chose pour la portée d'une garantie (les empreintes
du texte de la garantie et de son fichier de test).

Chaque relecteur est `{ name, kind: human|ai, relation: author|independent, date }`, et les deux commandes exigent
`--by`, `--kind` et `--relation`. Le même texte relu ajoute un relecteur ; un texte changé repart de zéro. Une garantie
publiée demande une relecture par une personne (`kind: human`) ; d'ici là elle dit « vérifiée par son auteur (IA), pas
relue » (ou « vérifiée par une IA indépendante, pas relue par une personne »), jamais « relue ». Une paire de
traduction publiée demande un enregistrement, celui d'une IA compris : une paire vérifiée par une IA seulement
n'arrête pas `check --publish`, qui dit combien il y en a parmi ses manques, et l'en-tête de la page dit qui l'a lue
(« écrite et vérifiée par une IA, pas relue par une personne », « relue en partie par une personne »…). Seule une
paire « à relire » l'arrête.

> [!LIMIT id=ai-review-is-not-review]
> La vérification par une IA de ce qu'elle a écrit se consigne en `--kind ai --relation author` et n'est jamais montrée
> comme une relecture. Seul un enregistrement en `--kind human` rend une paire ou une garantie « relue ».

<a name="commands"></a>

## Référence : les commandes

Toutes se lancent dans le dépôt du moteur, sous la forme `npm run wiki -- <commande>`.

| Commande | Ce qu'elle fait |
|---|---|
| `check` | Le niveau de travail de chaque pull request : schéma, fichiers présents pour les pages `draft` et `ready`, liens, parité des pages `ready`, blocs structurés, exemples, garanties référencées, la matrice de couverture contre `docs/`, le fichier des vraies questions. N'échoue que sur des erreurs |
| `check --publish --product-ref <tag\|sha> [--doc-ref <sha>] [--released] [--state preview\|candidate\|published] [--test-report <fichier>]… [--candidate <run id>]` | Le niveau de publication : les pages publiées ne pointent que vers des pages `ready`, aucune traduction à relire, chaque garantie exécutée sur le produit, l'ensemble des sources limité au produit plus la documentation ; `--state candidate\|published` demande `--candidate` |
| `stats [--json]` | Les pages par état, domaine, type et langue, et les compteurs de couverture |
| `build --target wiki --out <dossier> [--preview]` | Le dossier qu'une publication pousse vers le wiki GitHub ; les pages `ready` seulement, les brouillons aussi avec `--preview` ; refuse un dossier dans l'arbre de travail autre que `.cache/` |
| `bundle --out <dossier> [--build-id <id>] [--allow-dirty]` | La documentation que porte un moteur installé (`scripts/pack.mjs` la lance) ; refuse des sources différentes de `HEAD` sauf avec `--allow-dirty`, qui la marque `-dirty` |
| `translations --ack <id#section> --by <nom> --kind human\|ai --relation author\|independent` | Consigne qu'une paire a été lue |
| `review-claim <id> --by … --kind … --relation …` | Consigne que la portée d'une garantie a été lue |
| `coverage [--ack <clé>]`, `coverage --init [--force]` | Fusionne un nouvel inventaire des anciennes docs dans la matrice, régénère `legacy.json` et les `replaces` du manifeste ; `--init` prend le premier inventaire (`--force` remplace une matrice existante, en perdant chaque décision) |
| `acceptance [--lang en\|fr] [--json] [--strict]` | Passe les vraies questions dans `search_docs` ; sort en 0 (rapporté) sauf avec `--strict` ; `--export-prompts <dossier>` écrit à la place les consignes du test par une IA lectrice |
| `env` | Régénère la référence des variables d'environnement depuis `wiki/data/env.json` et le code |
| `archive`, `publish`, `pages`, `transition`, `next-revision`, `attest` | La chaîne de publication, lancée par les workflows de release et `docs-publish` |

`npm run docs:truth` vérifie ce qu'affirme l'ancienne documentation contre le code (schémas, scripts `npm run`,
fichiers, la version courante dans les README) ; `npm run docs:links` interroge une fois chaque lien externe, à la main
avant une release, jamais en CI.

<a name="coverage-freeze"></a>

## Référence : la matrice de couverture et le gel

`wiki/coverage.json` liste chaque section de l'ancienne documentation (`docs/en`, `docs/fr`, `CONTRIBUTING`,
`SECURITY`, `CODE_OF_CONDUCT`, `CREDITS`, les deux README) avec ses destinations `id#section` et deux compteurs,
« destinations prévues » et « contenu migré et relu ». Aucun contenu ne doit se perdre : chaque fait, commande, exemple,
limite et avertissement d'une section remplacée arrive dans une de ses pages de destination. Jusqu'à la bascule,
`wiki -- check` refusait une matrice décalée par rapport à `docs/` (le gel). Depuis (4.5.0), la matrice est définitive :
les anciennes pages sont les pages de transition qu'elle fait (`npm run wiki -- transition`), et `wiki -- check` refuse
une page modifiée à la main ou qui a perdu une ancienne ancre.

<a name="drift"></a>

## Référence : quand le code bouge sous une page

`npm run ci:plan` lit le diff d'une branche et nomme les pages du wiki dont il a touché les `sources` (« wiki pages to
reread »), et la famille `docs` de la CI tourne sur elles. Les `sources` d'une page sont donc ses sources précises de
dérive : gardez-les étroites.

> [!LIMIT id=no-drift-ack-yet]
> La commande `wiki -- ack <id> --reason` du plan, qui consignerait « relue, rien à changer » pour une alerte de
> dérive, n'est pas implémentée en 4.5.0 : `ci:plan` nomme les pages, et le lecteur décide.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0030](../../docs/dev/adr/0030-documentation-from-wiki-sources.md) : la documentation est générée depuis une seule
  source dans le dépôt, et publiée par release ; D50 dans [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
- Le plan : [`docs/dev/PLAN-4.5-WIKI.md`](../../docs/dev/PLAN-4.5-WIKI.md).
