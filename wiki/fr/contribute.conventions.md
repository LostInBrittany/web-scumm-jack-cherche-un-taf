# Conventions

Les noms, titres et fichiers que suit une contribution au dépôt du moteur, pour que les issues, les branches, les pull
requests et le CHANGELOG se lisent de la même façon, quel que soit leur auteur. Chaque section est une convention, avec
ce qui la vérifie.

<a name="titles"></a>
<!-- applies: .. since 4.3.0 -->

## Titres des issues et des pull requests

### Forme

- **Issue :** le préfixe du modèle, `[bug]` ou `[feature]` (`[field]` pour une passe de terrain d'une release), puis
  le problème ou le besoin en une phrase. Une issue ouverte en ligne de commande saute le modèle : tapez le préfixe
  vous-même.
- **Pull request :** `<Domaine>: <ce qui change> (#issue)`.
- **Une pull request d'une passe de release** commence plutôt par sa version : `4.2.3: …`, `4.3 "Nom": …`.
- **Corps :** chaque section du modèle de pull request, « Not done, said as such » comprise (« Nothing » quand il ne
  reste rien).

### Exemple minimal

```text
[bug] A save made in the cellar loads in the kitchen
Interface font: a proportional pixel font by default (#204)
```

### Contraintes

Rien ne vérifie un titre mécaniquement ; le mainteneur le fait. Les modèles d'issue sont
`.github/ISSUE_TEMPLATE/bug-report.yml` (titre `[bug] `) et `feature.yml` (titre `[feature] `) ; une demande de
nouveauté s'ouvre après avoir lu [Mécaniques classiques](create.classics.md) et [Commandes du jeu](create.commands.md).

### Depuis

4.3.0.

<a name="branches"></a>

## Noms de branches

### Forme

`<genre>/<issue>-<quelques-mots>`. Le genre est l'un de `feature`, `fix`, `docs`, `test`, `refactor`, ou `release`
avec sa version (`release/4.4.0`).

### Exemple minimal

```text
fix/210-job-late-poll
feature/430-hero-choice
```

### Contraintes

La branche sans son préfixe est le nom de son fragment du CHANGELOG (`210-job-late-poll`, section suivante). Rien
d'autre ne vérifie le nom.

<a name="changes-fragments"></a>
<!-- applies: .. since 4.1.9 -->

## Fragments du CHANGELOG et du LOG (`changes/`)

### Forme

Une branche qui modifie le code ne touche ni `CHANGELOG.md` ni `docs/dev/LOG.md`. Elle écrit, sous `changes/` :

- `changes/<slug>.md` : les puces du CHANGELOG, sous `### Breaking`, `### Fixed` ou `### Changes` (n'importe
  lesquelles, dans n'importe quel ordre). Écrivez-les comme le CHANGELOG : une amorce en gras, la version entre
  parenthèses, ce qu'un joueur, un auteur ou un hébergeur voit de différent.
- `changes/<slug>.log.md` (facultatif) : l'entrée du LOG. Première ligne `## <titre>` (ce qui suit
  `#n · date · Claude · proposal ·` dans le LOG), puis le corps, sa ligne `→ next:` en dernier. Le numéro et la date
  sont ceux de l'assemblage.

`<slug>` est la branche sans son préfixe, par exemple `419-cadence`. Le CHANGELOG et le LOG sont en anglais.

### Exemple minimal

`changes/210-job-late-poll.md` :

```markdown
### Fixed

- **A prepared job keeps its result on screen (4.3.0, #210)**: on a hosted Studio, the Assets panel no longer replaces
  "prepared from revision 3" with "Preparing the assets: done" when a late status answer arrives.
```

### Contraintes

```sh
# dans le dépôt du moteur
npm run changes -- --check [--base=origin/main]
```

- Elle fait échouer une branche qui touche `src/`, `bridge/`, `tools/`, `scripts/`, `cli/`, `connectors/` ou `games/`
  sans fragment et sans modification du CHANGELOG : `✖ this branch changes the code and carries no fragment: write
  changes/<slug>.md (### Fixed | ### Changes | ### Breaking, then the bullets)…`. Le job `check` de la CI la lance
  sur les pull requests. Un changement qui ne touche que `docs/`, `wiki/` ou `tests/` n'a pas besoin de fragment.
- Un titre autre que les trois (`### Added`, par exemple) est refusé : `a fragment's heading is one of ### Breaking |
  ### Fixed | ### Changes`. Du texte avant le premier titre l'est aussi : `a fragment starts with its heading`. Rien
  n'est rangé en silence.
- Une branche de release est l'exception : elle assemble les fragments et modifie le CHANGELOG elle-même.
- `changes/README.md` n'est pas un fragment.

### Assemblage

```sh
# dans le dépôt du moteur, sur main, avec tout l'historique
npm run changes -- --assemble [--date=YYYY-MM-DD]
```

Elle verse chaque fragment dans le `## Unreleased` du CHANGELOG (chaque puce sous sa section, Breaking, Fixed puis
Changes) et numérote les entrées du LOG après la dernière, dans l'ordre où les fragments sont arrivés sur `main` (la
date de leur premier commit : un rebase la déplace), puis les supprime. Seul le bloc `Unreleased` est réécrit. Elle
refuse un clone superficiel (`git fetch --unshallow`), qui daterait chaque fragment à sa limite. Deux branches ouvertes
ne se marchent plus dessus sur le CHANGELOG, le LOG ou leurs numéros d'entrée.

### Depuis

4.1.9 (lot 0 « cadence »).

<a name="formatting-commits"></a>
<!-- applies: .. since 4.1.0 -->

## Formatage et commits de formatage

### Forme

Biome formate et lint le code (`biome.json` : deux espaces, 120 colonnes, guillemets simples, points-virgules, virgules
finales). `npm run format` écrit le formatage ; `npm run format:check` et `npm run lint:code` le vérifient (tous deux
dans `npm run quality`).

### Contraintes

- Un changement qui ne fait que reformater est un commit à part, listé dans `.git-blame-ignore-revs`, pour que
  `git blame` le saute. En local : `git config blame.ignoreRevsFile .git-blame-ignore-revs` (GitHub lit le fichier de
  lui-même).
- **`games/` est linté, jamais reformaté** : le formateur exclut `games/**`, parce que c'est le Studio qui écrit le
  contenu.
- `Math.random` est refusé dans `src/engine/core/` et `src/engine/minigames/` (un plugin de lint) : le hasard passe par
  le générateur à graine. Dans `src/engine/core/remix/`, c'est `Math` lui-même qui est refusé (ADR 0018).
- `any` est refusé hors de `tests/` et `scripts/` ; les promesses flottantes sont refusées partout.

### Depuis

4.1.0 « Clarity » (le commit de formatage Biome est la première ligne de `.git-blame-ignore-revs`).

<a name="docs-languages"></a>

## Langues de la documentation

### Forme

| Quoi | Langue |
|---|---|
| Pages du wiki (`wiki/en`, `wiki/fr`) | Les deux, chacune écrite dans sa langue, avec les mêmes sections et les mêmes faits ([Écrire la documentation](contribute.writing-docs.md)) |
| `docs/dev/` (plans, décisions, ADR, LOG, passes) | Anglais, documentation publique de développement (D3) |
| `CHANGELOG.md`, commentaires du code, messages de commit | Anglais |
| `README.md` / `README.fr.md` | Les deux |
| `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CREDITS.md` | Anglais dans le dépôt ; leurs versions françaises sont les pages du wiki |

### Contraintes

Une pull request qui change ce que voit un utilisateur met à jour les pages dans les deux langues (la deuxième case du
modèle). `docs/en` et `docs/fr` sont des pages de transition depuis la 4.5.0 : ne les modifiez
jamais, écrivez dans `wiki/`.

<a name="review-owners"></a>

## Ce qui demande la relecture du mainteneur

`.github/CODEOWNERS` nomme les fichiers qu'une pull request ne peut pas changer sans un regard du mainteneur : le
comportement figé (`tests/quality-baseline.json`), la surface publique (`tests/api-surface.json`), les mutants
survivants nommés (`docs/dev/mutants.json`), les seuils de couverture (`vite.config.ts`) et les workflows (`.github/`).
Tout le reste est relu par les barrières.

<a name="related"></a>

## Identifiants liés

- `npm run changes`, `npm run format`, `npm run format:check`, `npm run lint:code`.
- [Avant une pull request](contribute.before-a-pr.md), [Gouvernance](contribute.governance.md).
