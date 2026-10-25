# Journal des modifications

Ce qui a changé dans chaque version de quest-n-click tient dans un seul fichier, [`CHANGELOG.md`](../../CHANGELOG.md),
à la racine du dépôt, en anglais. Cette page ne le recopie pas : elle dit où le lire et comment le lire.

<a name="where"></a>

## Où le lire

- Dans le dépôt : [`CHANGELOG.md`](../../CHANGELOG.md), la version la plus récente en premier, une section
  `## <version> — <date>` par version.
- Sur GitHub : les notes de chaque version, sur <https://github.com/Quest-n-Click/quest-n-click/releases>.
- Pas dans le paquet npm : un moteur installé (`node_modules/quest-n-click/`) ne contient pas `CHANGELOG.md`.

<a name="how-to-read"></a>

## Lire la section d’une version

- Le paragraphe d’ouverture : le nom de la version et ce à quoi elle sert, et si un jeu a quelque chose à changer.
- `### Breaking` : ce qu’un jeu, un hôte ou un script doit changer. Depuis la 4.2.0, une version mineure ajoute et ne
  retire jamais ; un retrait attend la version majeure suivante ([start.stability](start.stability.md)).
- `### Fixed` : les bugs corrigés, chacun avec sa version et, quand il y en a un, le numéro de son issue.
- `### Changes` : ce qui a été ajouté ou modifié sans rien casser.
- Comment faire passer un jeu d’une version à la suivante n’est pas dans le journal : voir
  [install.upgrade](install.upgrade.md) et les notes de mise à jour de chaque ligne.

<a name="unreleased"></a>

## Ce qui n’est pas encore publié

Dans le dépôt du moteur, une branche qui modifie le code écrit ses lignes du journal dans un fragment,
`changes/<slug>.md` ; elles sont rassemblées sous `Unreleased` dans `CHANGELOG.md` quand la branche arrive sur
`main` (`npm run changes -- --assemble`, [`tools/changes.ts`](../../tools/changes.ts)). Jusqu’à une version, ce que
`main` contient au-delà de la dernière version est dans `changes/` et dans ce bloc `Unreleased`. Comment on publie une
version : [contribute.releasing](contribute.releasing.md).
