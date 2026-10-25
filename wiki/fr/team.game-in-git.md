# Le jeu dans Git

Un Studio d'équipe peut pousser le jeu vers un dépôt Git et l'en réimporter. Un owner pousse en un commit les
révisions confirmées depuis le dernier push, chaque auteur crédité ; un import remplace le jeu par une branche ou un
commit. Le Studio ne force jamais un push et ne fait jamais de checkout.

<a name="what-you-get"></a>

## Ce que vous obtenez

Les fichiers du jeu dans un dossier de votre dépôt, un commit par push, chaque auteur de ces révisions en
`Co-authored-by` ; et un chemin de retour de Git vers le Studio.

<a name="context-and-versions"></a>

## Contexte et versions

Un Studio hébergé (le Studio Server), depuis la 4.2.3 (D44 : une clé de déploiement, un dépôt par instance). Le code
est [`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts). Pousser et importer reviennent à un
owner ; l'état est visible dès le rôle reviewer.

<a name="prerequisites"></a>

## Prérequis

- Un dépôt, et une **clé de déploiement** qui peut écrire dans ce seul dépôt (une clé privée SSH). Un dépôt https
  public, ou local, n'en demande pas ; une URL de dépôt ne porte jamais d'identifiants (la configuration refuse
  `https://user@…`).
- `git` sur la machine de l'application studio.
- Le rôle `owner` pour pousser et importer.

<a name="where-to-run"></a>

## Où lancer les commandes

La configuration et le secret se règlent sur l'application studio (voir [Configuration](clever.configuration.md)).
Pousser et importer se font dans le Studio, onglet **Play**, panneau **Git**, ou par l'API avec le jeton d'un owner.

<a name="steps"></a>

## Étapes

<!-- step: configure -->
1. **Nommez le dépôt** dans la configuration (clé facultative `git`) :

   ```json
   { "git": { "remote": "git@github.com:org/game.git", "branch": "main", "path": "games/my-game", "committer": { "name": "…", "email": "…" }, "knownHosts": "github.com ssh-ed25519 AAAA…" } }
   ```

   | Champ | Par défaut | Contenu |
   |---|---|---|
   | `remote` | obligatoire | le dépôt : `git@…`, un `https://…` public, ou un chemin local |
   | `branch` | `main` | la branche où l'on pousse et d'où l'on importe |
   | `path` | la racine du dépôt | le dossier du jeu dans le dépôt |
   | `committer` | aucun | qui fait le commit, `{name, email}` ; les auteurs sont en `Co-authored-by` |
   | `knownHosts` | aucun | les lignes `known_hosts` de l'hôte du dépôt, vérifiées strictement ; sans elles l'hôte est cru à la première connexion, et de nouveau après chaque disque neuf |

<!-- step: deploy-key -->
2. **Donnez la clé de déploiement** comme secret `STUDIO_GIT_KEY` (une variable sur Clever Cloud ; ailleurs
   `STUDIO_GIT_KEY_FILE`, un fichier en mode 0600). Voir
   [Variables d'environnement](reference.environment-variables.md#studio-git-key).

<!-- step: look -->
3. **Regardez l'état.** Le panneau **Git** de l'onglet Play montre où va le jeu (le dépôt, sans identifiants ; la
   branche ; le dossier) et la dernière révision poussée, avec son commit. `GET /api/git` donne
   `{remote, branch, path, pushed, commit}`.

<!-- step: push -->
4. **Pousser (owner).** Cliquez sur **Push to Git** (`POST /api/git/push`). Un commit réunit les révisions confirmées
   depuis le dernier push : les fichiers du jeu à la tête, dans `path` ; chaque auteur de ces révisions est en
   `Co-authored-by` (son email quand le fournisseur l'a vérifié, sinon son nom à `users.noreply.<l'hôte du Studio>`).
   Le reste du dépôt reste tel qu'il est. La réponse est `{pushed, commit, revisions: [de, à]}`. Rien de neuf, rien de
   poussé (« Nothing new to push »).

<!-- step: import -->
5. **Importer (owner, demandé deux fois).** Cliquez sur **Import from Git**, puis de nouveau pour confirmer (« Replace
   the game with Git's? Click again ») ; ou `POST /api/git/import` avec `{}` pour la branche, ou
   `{"ref": "<une autre branche ou un hash de commit>"}`. Le jeu tel qu'il est dans `path` à ce commit est écrit en une
   révision, sous le bail exclusif (personne n'écrit pendant ce temps). Il remplace ce que le Studio n'avait pas
   poussé, qui reste dans l'historique du Studio. La réponse est `{commit, changed}`.

   - La pointe de la branche importée : le push suivant part d'elle.
   - Un autre commit : la tête est le jeu de ce commit, et le push suivant va sur la pointe que le Studio connaît.

<a name="rules"></a>

## Les règles

- **Jamais forcé.** Une branche qui a bougé depuis le dernier push du Studio (quelqu'un y a poussé) est refusée par une
  409 : importez-la d'abord. Une branche qui existe mais que le Studio n'a jamais importée est refusée de même :
  importez-la d'abord, ou poussez vers une nouvelle branche.
- **Pas de checkout.** Un push construit son commit à partir d'objets, dans un index à lui ; un import lit les objets
  du commit. Les liens, les attributs et les règles d'ignore du dépôt ne peuvent pas atteindre les fichiers du serveur.
- **Les fichiers propres au dépôt.** Les chemins dont un segment commence par un point (`.github/`, `.gitignore`) sont
  ceux du dépôt : gardés par un push, ignorés par un import.
- **`private/` ne sort jamais.** Le `private/` du jeu (fins scellées, planches brutes) et `node_modules/` ne sont
  jamais poussés, et un import laisse `private/` tel qu'il est.
- **Un import refuse en bloc** : un lien ou un sous-module (422), un dossier `path` qui est un fichier, un lien ou un
  sous-module (422), un commit sans jeu à `path` (422), plus de 5 000 fichiers ou 64 Mio (413).
- **Git tourne à part** : un environnement à lui (aucun secret de la plateforme), la clé dans un fichier le temps
  d'une commande, le clone dans `workDir/git`, refait quand le disque est neuf.

> [!GUARANTEE id=git-never-forced]
> Un push vers une branche qui a bougé depuis le dernier push du Studio est refusé, et la branche reste telle qu'elle
> était.

> [!LIMIT id=git-limits]
> Un dépôt et une branche par instance. Les push se font à la main (pas de push automatique après chaque révision).
> Les commentaires, les membres et l'audit ne sont pas dans le dépôt : ils vivent dans la base du Studio. Il faut un
> email vérifié par le fournisseur pour que la vraie adresse d'un auteur figure dans `Co-authored-by`.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Après un push, la branche a un commit de plus avec le dossier du jeu à la tête et les auteurs en co-auteurs ; le
panneau Git montre la révision poussée et son commit. Après un import, l'en-tête montre une révision de plus
(`import from git <commit>`).

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| `<branch> moved since the Studio's last push (… → …): import it first, never forced` (409) | Quelqu'un a poussé sur la branche | Importez-la, puis poussez |
| `<branch> exists and the Studio never imported it: import it first, or push to a new branch` (409) | La branche existait avant le Studio | Importez-la une fois |
| `<branch> moved while pushing: import it first, never forced` (409) | Un push est arrivé pendant le vôtre | Importez, puis poussez |
| `the push failed: …` (502), `git <commande>: …` (502) | Le dépôt a refusé (clé, droits, réseau) | Lisez le message du dépôt ; vérifiez la clé de déploiement |
| `ref must be a branch of the repository or a commit` (400) | Une référence mal formée | Un nom de branche ou un hash de 7 à 40 caractères hexadécimaux |
| `no commit <ref> in the repository` (404) | Référence inconnue | Vérifiez le nom ou le hash |
| `this Studio has no Git repository (config git)` (404) | Pas de `git` dans la configuration | Ajoutez-le |
| `git.remote carries no credentials (the deploy key is STUDIO_GIT_KEY)` au démarrage | Un jeton ou un utilisateur dans l'URL | Utilisez la clé de déploiement |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Un push écrit un commit dans le dépôt (aucun fichier du jeu ne change dans le Studio). Un import écrit les fichiers du
jeu en une opération. Le Studio garde en base le dernier commit et la dernière révision poussés.

<a name="recovery"></a>

## Revenir en arrière

Un import est écrit sans annulation : Undo ne le reprend pas. Ce qu'il a remplacé reste dans l'historique du Studio ;
pour revenir en arrière, importez un commit plus ancien, ou restaurez une sauvegarde faite avant
([Sauvegardes](clever.backups.md)). Le Studio ne réécrit jamais un push : annulez-le dans Git s'il le faut.

<a name="references"></a>

## Références

- [`tests/studio-git.test.ts`](../../tests/studio-git.test.ts).
- [Exporter le jeu et quitter l'installation](clever.export-leave.md).
- [Rôles et actions](team.roles.md#matrix-owner).
