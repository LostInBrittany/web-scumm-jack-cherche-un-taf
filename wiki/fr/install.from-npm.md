# Installer depuis npm

**Le moteur est sur npm depuis la 4.5.2** (publiée le 24 octobre 2026). Ses paquets sont nommés sous l'organisation
`quest-n-click` (D53) : `@quest-n-click/engine`, `@quest-n-click/create`, `@quest-n-click/bridge`,
`@quest-n-click/connectors` et `@quest-n-click/studio-server`, chacun publié par le run de release et approuvé par un
propriétaire de l'organisation. Un projet se crée et se met à jour avec les commandes habituelles de npm, sans URL
d'archive ; l'[archive de la release](install.from-archive.md) marche toujours de la même façon. Les noms sans scope de
la 4.5.1 et avant (`quest-n-click`, `quest-n-click-bridge`, …) ne sont pas le moteur : les mainteneurs les gardent comme
pointeurs dépréciés vers les noms à scope, sauf `create-quest-n-click`, un relais vers `@quest-n-click/create`.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un projet de jeu créé et mis à jour avec les commandes habituelles de npm, sans URL d'archive, depuis des paquets dont
vous vérifiez en une commande qu'ils sont ceux du projet.

<a name="context-and-versions"></a>

## Contexte et versions

- Un **projet créé**, sur votre machine.
- Aucune version du produit n'a été publiée sur npm jusqu'à la 4.5.1 incluse. La 4.2.0 n'est partie que sur GitHub
  Releases (D38) : la publication demande la double authentification d'un mainteneur à chaque étape, et la 4.2.0 ne
  l'a pas attendue. L'organisation npm `quest-n-click` (deux propriétaires, donc deux personnes peuvent approuver) et
  les noms à scope arrivent avec la 4.5.2 (D53), la première release que release.yml a mise en attente sur npm et la
  première publiée là, le 24 octobre 2026. Chaque release stable depuis est mise en attente de la même façon et se
  trouve sur npm une fois qu'un propriétaire l'approuve : `npm view @quest-n-click/engine version` dit laquelle.
- Les noms sont surveillés : un job du workflow de nuit (`npm-names`, jamais bloquant) vérifie que chaque nom à scope,
  et chaque ancien nom `web-scumm…`, est libre ou publié par un propriétaire de l'organisation, que chaque nom sans
  scope est un pointeur déprécié d'un propriétaire (`create-quest-n-click` : un relais d'un propriétaire, non
  déprécié), et prévient sinon.

> [!LIMIT id=npm-owners-only]
> Un paquet sous l'un de ces noms publié par un autre que les propriétaires de l'organisation n'est pas celui du
> projet : ne l'installez pas. Les noms sans scope ont été dépubliés le 24 octobre 2026, pour être republiés comme
> pointeurs (et `create-quest-n-click` comme relais) par les mainteneurs : d'ici là, `npx create-quest-n-click` ne
> trouve rien, et la commande est `npm init @quest-n-click`.

<a name="prerequisites"></a>

## Prérequis

- Les [Prérequis](install.requirements.md) de tout projet de jeu : Node.js 22.12 ou plus récent, Python 3 pour les
  images.
- Rien d'autre : depuis la 4.5.2, la release est sur npm.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, depuis le dossier qui contiendra le projet ; puis dans le projet créé.

<a name="steps"></a>

## Étapes

<!-- step: check-owner -->
1. Vérifiez que le paquet est publié et qu'il est celui du projet. Ses mainteneurs doivent être des propriétaires de
   l'organisation `quest-n-click` (`lostinbrittany` et `wanoo`), son dépôt `github.com/Quest-n-Click/quest-n-click`,
   et son `latest` une version du produit :

   ```bash
   # n'importe où
   npm view @quest-n-click/engine maintainers repository.url dist-tags
   ```

   Il nomme une version du produit (`latest: '4.5.2'` le 25 octobre 2026). S'il ne nomme que `bootstrap`, la
   réservation, ou un mainteneur qui n'est pas propriétaire, arrêtez-vous là et prenez
   l'[archive de la release](install.from-archive.md).

<!-- step: create-from-npm -->
2. Créez le projet. Les deux commandes font la même chose (`@quest-n-click/create` lance `quest-n-click create` depuis
   le moteur dont il dépend) :

   ```bash
   # dans le dossier qui contiendra le projet
   npm init @quest-n-click my-game "Mon jeu"     # ou : npx quest-n-click create my-game "Mon jeu"
   ```

   Une fois que les mainteneurs l'ont republié, `npx create-quest-n-click my-game "Mon jeu"` marche aussi : le
   `create-quest-n-click` sans scope est un relais qui lance `@quest-n-click/create`, la même chose.

   Sans `--engine`, `create` écrit la dépendance `"@quest-n-click/engine": "^<version>"`, que npm résout depuis le
   registre.

<!-- step: install-and-play -->
3. Installez, préparez les images et jouez, comme depuis l'archive :

   ```bash
   # depuis le dossier qui contient le projet, puis dedans
   cd my-game
   npm install
   python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
   npm run assets && npm run dev
   ```

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

L'étape 1 affiche les mainteneurs et le dépôt ; l'étape 2 se termine par
`my-game: "Mon jeu" created (@quest-n-click/engine ^<version>).` Un projet fait depuis une archive passe au registre avec
`npm install @quest-n-click/engine@<version>`, qui remplace l'URL de l'archive dans son `package.json` par une plage de
versions.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `npm view @quest-n-click/engine dist-tags` ne nomme que `bootstrap` (et la version d’attente `0.0.0-stage` de npm) | Pas le registre attendu, ou un miroir derrière lui | Vérifiez `npm config get registry`, ou [installez depuis l'archive de la release](install.from-archive.md) |
| `npx create-quest-n-click` répond 404 | Le relais n'est pas encore republié | `npm init @quest-n-click my-game` |
| `npm view` montre un mainteneur qui n'est pas propriétaire de l'organisation | Un nom pris par un tiers | Ne l'installez pas ; signalez-le dans les issues du projet |
| `npm warn deprecated quest-n-click@0.0.1: …` | Un nom sans scope de la 4.5.1 et avant, désormais un pointeur | Installez `@quest-n-click/engine` à la place |

<a name="files-changed"></a>

## Fichiers ou données modifiés

L'étape 1 ne change rien. Les étapes 2 et 3 écrivent le même projet que [depuis l'archive](install.from-archive.md#files-changed) ;
seule la dépendance dans `package.json` diffère (une plage au lieu d'une URL).

<a name="recovery"></a>

## Reprise ou retour arrière

Un projet créé depuis npm revient à une archive avec `npm install <URL de l'archive>`, comme le décrit
[Mettre à jour](install.upgrade.md).

<a name="how-it-will-be-published"></a>

## Comment les paquets sont publiés

La procédure a été écrite en 4.1.20 ; à partir de la 4.5.2, release.yml met les paquets en attente et un propriétaire
les approuve, et la 4.5.2 a été la première release sur npm. Le détail est dans [Paquets npm](contribute.npm-packages.md). Ce sur quoi un utilisateur peut compter :

- **Une publication en étapes, approuvée par une personne.** Le run de release met chaque paquet en scène via l'OIDC
  de GitHub (trusted publishing, configuré en stage-only : la CI peut mettre en scène, jamais publier), et le
  mainteneur promeut chacun avec sa double authentification (`npm stage approve <id>`, ou sur npmjs.com) ; l'un ou
  l'autre propriétaire de l'organisation peut approuver. Une version
  du produit ne vient jamais d'une publication locale, qui ne porterait pas de provenance OIDC ; seule une version de
  réservation `0.0.0-bootstrap.0` le peut, une fois par paquet, pour le créer.
- **Des outils exacts.** La publication en étapes demande au moins npm 11.15.0 et Node 22.14.0. Le job `npm-stage` de
  release.yml les épingle à l'identique, `NPM_PUBLISH_NODE: 22.23.3` et `NPM_PUBLISH_NPM: 11.21.0`, installe lui-même
  npm 11.21.0 (Node 22.23.3 livre npm 10.9.9) et vérifie les deux ; un test refuse une plage.
- **Les connecteurs ne sont pas déclarés dual-use.** La politique dual-use de npm vise les outils qui peuvent
  ressembler à un logiciel malveillant (test d'intrusion, recherche en sécurité, obfuscation) ; les connecteurs sont
  des serveurs qu'un jeu fait tourner (une façade SSH et Telnet, un webhook et un lecteur IMAP pour l'email, un
  vérificateur Open Badge), qui ne scannent, n'attaquent et ne cachent rien. Ils passent par la même publication en
  étapes et la même promotion à double authentification que les autres paquets. Si l'analyse de npm retient ou
  signale le paquet, il reçoit `"contentPolicy": { "class": "dual-use" }` et un fichier `DISCLOSURE`.

<a name="references"></a>

## Références

- [Installer depuis l'archive de la release](install.from-archive.md), [Référence du paquet](install.package.md)
- [Paquets npm](contribute.npm-packages.md) (la procédure du mainteneur), [Publier une release](contribute.releasing.md)
- La documentation de npm : [staged publishing](https://docs.npmjs.com/staged-publishing),
  [politique dual-use](https://docs.npmjs.com/policies/dual-use/)
- [`.github/workflows/nightly.yml`](../../.github/workflows/nightly.yml) (le job `npm-names`),
  [`.github/workflows/release.yml`](../../.github/workflows/release.yml) (le job `npm-stage`)
