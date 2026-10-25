# Pull requests des bots

Comment le mainteneur, ou un assistant qui travaille pour lui, traite les pull requests qu'ouvre Dependabot : quand,
comment juger chacune, et que faire d'une rouge.

<a name="what-you-get"></a>

## Ce que vous obtenez

Aucune pull request de bot laissée ouverte sans raison : chacune fusionnée au vert, corrigée et prise, ou fermée avec sa
raison écrite, et la dépendance qu'elle fait bouger vérifiée partout où elle est recopiée (verrous des paquets,
épinglage des actions).

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur sur GitHub, `Quest-n-Click/quest-n-click`. `.github/dependabot.yml` en 4.4.0 : npm chaque semaine (mises à
jour mineures et correctives regroupées sous `minor-and-patch`), GitHub Actions chaque semaine, pip
(`requirements.txt`) chaque mois. Les versions majeures de `@types/node` sont ignorées : les types suivent la plus
ancienne Node que le projet prend en charge (22.12, `engines`), et les types de Node 26 refusent du code juste sur la
22 (#101, 4.1.19) ; on les monte à la main quand `engines` bouge.

<a name="prerequisites"></a>

## Prérequis

- Un accès en écriture au dépôt et la CLI GitHub (`gh`), connectée.
- Un clone préparé : [Préparer son poste de développement](contribute.setup.md).
- Aucune release en cours (étape suivante).

<a name="where-to-run"></a>

## Où lancer les commandes

Les commandes `gh` n'importe où ; les vérifications dans le dépôt du moteur, sur une branche faite pour les mises à jour
des bots.

<a name="steps"></a>

## Étapes

<!-- step: after-release -->
1. **Attendez que la release soit sortie.** Les pull requests des bots se traitent après chaque release, jamais au
   milieu. `release.yml` exécute la copie de `main` de son workflow pendant qu'il publie un tag, et une mise à jour
   d'une action qu'il utilise changerait la publication en cours ; la release 4.1.19 a fait attendre ainsi #95–#102
   (LOG #169).

<!-- step: list -->
2. **Listez-les**, avec leurs vérifications.

   ```sh
   # n'importe où, avec gh connecté
   gh pr list -R Quest-n-Click/quest-n-click --author app/dependabot
   gh pr checks <number> -R Quest-n-Click/quest-n-click
   ```

<!-- step: merge-green -->
3. **Fusionnez une pull request verte** dont vous avez lu le changement (les notes de version de la dépendance, le diff
   du fichier de verrouillage). Plusieurs à la fois peuvent passer par une seule branche au lieu d'un cycle de CI
   chacune : fusionnez-y leurs commits, lancez la CI une fois, puis fermez chaque pull request du bot avec un renvoi
   vers la branche (LOG #169 en a traité sept ainsi).

<!-- step: fix-red -->
4. **Une rouge se corrige ou se ferme, elle ne reste jamais.** Reproduisez d'abord l'échec en local. Quand la mise à
   jour est juste et qu'un test ou notre code doit suivre, corrigez sur la branche (Playwright 1.64 faisait afficher à
   WebKit une erreur 500 volontaire d'un test, et le test PWA a appris à excuser exactement cette réponse). Quand la
   mise à jour ne convient pas au projet, fermez-la avec la raison écrite sur la pull request : Vite 8 (son bundler
   cassait un import par défaut CommonJS, le jeu ne démarrait pas), TypeScript 7 (plus de `baseUrl`, plus de `paths`
   non relatifs), des minimums pip relevés qui cassaient un Python partagé (NumPy 2.5), `@types/node` 26.

<!-- step: follow-copies -->
5. **Suivez les copies de la version.** Certaines dépendances sont épinglées ailleurs aussi :
   - les verrous propres des paquets sous `scripts/locks/` (le Bridge, les connecteurs, le Studio Server, l'image du
     Bridge) : lancez `npm run locks` quand une dépendance de ces paquets change, relisez le diff, committez-le ;
     `npm run locks -- --check` dit si chaque verrou convient encore ;
   - rien pour Python : `requirements.txt` porte le sha256 de chaque fichier de chaque version, et Dependabot les
     réécrit avec la version (D54, #285) ; `tests/python-requirements.test.ts` vérifie que chaque ligne épingle `==`
     avec une empreinte ;
   - l'épinglage d'une action : vérifiez le nouveau SHA contre le tag officiel
     (`gh api repos/<owner>/<action>/git/ref/tags/<tag>`).

<!-- step: release-path -->
6. **Une mise à jour d'une action qu'utilise `release.yml` ou `candidate.yml`** n'est prouvée que par le candidat et la
   release suivants : étiquetez la branche `full-ci` (elle lance aussi le workflow candidat, à titre d'information) et
   dites dans la pull request ce qui reste à voir.

> [!LIMIT id=no-auto-merge]
> Rien ne fusionne une pull request de bot tout seul : aucune fusion automatique n'est configurée. Une pull request qui
> attend est une décision pas prise, pas une décision.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`gh pr list -R Quest-n-Click/quest-n-click --author app/dependabot` ne liste rien, ou seulement des pull requests ouvertes
depuis la dernière release. `main` est vert après les fusions.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Une PR de bot rouge seulement sur `pwa-firefox` ou une ligne WebKit | Une instabilité connue ([La CI expliquée](contribute.ci.md)) | Relancez le job ; reproduisez avant d'accuser la mise à jour |
| `tests/pack-locks.test.ts` échoue après une fusion | Le verrou d'un paquet sous `scripts/locks/` ne convient plus | `npm run locks`, relisez, committez |
| Des erreurs de types après une majeure de `@types/node` | Des types plus récents que la Node prise en charge | Fermez-la ; `dependabot.yml` ignore déjà ces majeures |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`package.json`, `package-lock.json`, `requirements.txt`, `.github/workflows/*.yml` (épinglage des actions),
`scripts/locks/*.json`. Un changement de code qui suit une mise à jour porte son fragment
`changes/` ([Conventions](contribute.conventions.md#changes-fragments)).

<a name="recovery"></a>

## Revenir en arrière

Une mise à jour fusionnée s'annule par une pull request qui annule son commit (`git revert`), avec la raison ;
Dependabot la repropose ensuite, sauf si elle est ignorée dans `.github/dependabot.yml`.

<a name="references"></a>

## Références

- [`.github/dependabot.yml`](../../.github/dependabot.yml), [`docs/dev/LOG.md`](../../docs/dev/LOG.md) (#169, les pull
  requests du 11 octobre 2026).
- [La CI expliquée](contribute.ci.md), [Publier une release](contribute.releasing.md), [Paquets npm](contribute.npm-packages.md).
