# Publier une release

Comment une version de quest'n'click se fabrique, pour le mainteneur : un candidate run sur main, un tag signé qui le
nomme, une release qui publie les fichiers de ce run sans rien reconstruire, puis une relecture. Les commandes sont
`npm run ship -- …` ([`tools/release/ship.mjs`](../../tools/release/ship.mjs)) ; chacune écrit son PID dans
`.cache/pids/ship-<commande>.pid` (`SHIP_PIDS` choisit le dossier) : pour en arrêter une, on arrête ce PID, pas un
motif.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une release GitHub `v<version>` publiée et immuable, construite depuis le commit que la CI et le candidat ont testé,
avec ses archives, manifestes, SBOM, sommes et attestations de provenance, relue par `ship verify` ; à partir de la
4.5.0, sa documentation publiée après cette relecture.

<a name="context-and-versions"></a>

## Contexte et versions

Dans le dépôt du moteur, par le mainteneur (il faut l'accès en écriture, la clé de signature et les réglages du
dépôt). La chaîne est celle de la 4.1.20 « Last Mile » (plan §11) ; les tags sont signés depuis la 4.2.0. Cette page
vaut à partir de la 4.2.0.

<a name="prerequisites"></a>

## Prérequis

- La CLI GitHub `gh`, connectée en tant que mainteneur.
- Les réglages du dépôt activés une fois ([plus bas](#maintainer-settings)) : releases immuables et ruleset de tags.
- La clé de signature configurée ([plus bas](#signing)).
- La section du CHANGELOG de la version assemblée depuis les fragments `changes/` (le travail de la branche de release,
  [Conventions](contribute.conventions.md)), et la fiche des passes des personnes commencée
  ([Passes de terrain](contribute.field-passes.md)). `ship tag` refuse un commit sans cette section (4.5.3) : fusionnez
  la pull request de release, puis taguez son commit de fusion.
- Un remote git pour `Quest-n-Click/quest-n-click` : `ship tag` récupère depuis celui dont l'URL le nomme et y pousse,
  `upstream` quand `origin` est votre fork (4.5.3).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, sur la machine du mainteneur, sur un `main` à jour. La release elle-même tourne sur GitHub
Actions (`.github/workflows/release.yml`), lancée par le push du tag (depuis la 4.5.3 ; par le run `ci` du tag
avant). Le tag ne lance aucun `ci` à lui : le candidat est la seule passe de tests de la release, et le `ci` de main
sur le même SHA est l'autre chose que release.yml vérifie.

<a name="steps"></a>

## Étapes

<a name="the-chain"></a>

### La chaîne

<!-- step: candidate -->
1. **Un candidat sur main.** On le lance à la main sur main pour le SHA complet :

   ```sh
   # dans le dépôt du moteur
   gh workflow run candidate --ref main -f sha=<full sha>
   ```

   Il joue toutes les familles lourdes sur ce SHA, le profil de qualification complet sur ses propres archives et son
   image, les trois charges et la répétition de signature. Sa gate (`candidate-gate`) écrit et atteste
   `candidate-manifest.json`, avec chaque fichier que la release publiera (`tools/release/artifacts.mjs`). Lire la
   gate **et** sa conclusion. Seul un run lancé à la main (`workflow_dispatch`) sur main peut être nommé par un tag ;
   une pull request avec le label `full-ci` le lance aussi, pour information seulement.

<!-- step: tag -->
2. **Un tag qui le nomme.**

   ```sh
   # dans le dépôt du moteur
   npm run ship -- tag <version> <sha> --candidate=<run> --sign
   ```

   Le tag stable précédent doit être un ancêtre du SHA. `--candidate=<run id>` est obligatoire depuis la 4.1.17 : le run
   doit être vert et son manifeste nommer ce SHA et ce run ; l'annotation du tag le nomme, et release.yml publie les
   fichiers de ce run. `ship tag` attend que le run `ci` de main sur le SHA soit vert avant de pousser le tag (relancé
   une fois) : c'est ce run que release.yml vérifie, puisqu'un tag ne lance plus de `ci` à lui (4.5.3). `--now`, qui
   sautait cette attente, est refusé depuis la 4.5.3. `--sign` signe le tag avec la clé SSH ([plus bas](#signing)).
   `ship tag` refuse de taguer tant que les releases immuables sont désactivées. Il attend ensuite comme `ship watch`.

<!-- step: release -->
3. **La release, depuis ce run.** Le push du tag lance `release.yml` (depuis la 4.5.3, #291). Il vérifie que le tag
   pointe toujours vers le commit pour lequel le run a démarré, que ce commit est sur la ligne des premiers parents de
   main et que le `ci` de main a réussi sur un push de ce SHA précis (`tools/release/main-ci.mjs`), que le tag stable
   précédent est un ancêtre, et que le candidat nommé est un run vert de `candidate` lancé à la main sur main. Il
   télécharge les fichiers du run et vérifie chaque SHA-256 contre le manifeste. Il ne reteste rien : ni
   `release-check`, ni ensemble de mutation, le candidat les a joués sur ce SHA. Il copie ce que le candidat a fait et
   ne construit rien (archives, image, SBOM, le site, les surfaces, les preuves des catalogues Remix). Il crée alors la
   release en **brouillon**, téléverse chaque fichier, la publie et la relit (`ship verify`) : quelques minutes au lieu
   de plusieurs heures. Un candidat auquel il manque un de ses fichiers ne peut pas être publié : depuis la 4.1.20 la répétition
   de signature, depuis la 4.5.3 les preuves Remix (un candidat antérieur à ce changement n'en a pas). Il faut en lancer
   un nouveau. Si le `ci` de main sur le SHA tourne encore ou est rouge, le run s'arrête sur une erreur qui le dit : on
   l'attend, puis on relance le job. Un seul run de release par tag à la fois : le second attend, puis trouve la
   release du premier.

<!-- step: verify -->
4. **Relecture.**

   ```sh
   # dans le dépôt du moteur
   npm run ship -- verify <version>
   ```

   La commande télécharge la release et vérifie les sommes, chaque attestation de provenance et la liste des fichiers
   contre le manifeste ; depuis la 4.1.20, elle lance aussi `gh release verify` et `gh release verify-asset` pour chaque
   fichier. release.yml la lance comme dernière vérification.

<!-- step: npm-stage -->
5. **npm, mis en scène puis approuvé** (à partir de la 4.5.2). Une fois le job de release réussi, le job `npm-stage`
   de release.yml met en scène les cinq archives de la release sur npm par trusted publishing (OIDC, sans jeton), le
   moteur d'abord, et le résumé de son run donne les ids. Un propriétaire de l'organisation npm approuve chacune avec
   sa 2FA, dans l'ordre du résumé :

   ```sh
   # n'importe où, connecté à npm en tant que propriétaire de quest-n-click
   npm stage approve <id>
   ```

   Un tag de pré-version ne met rien en scène (ses archives portent la version stable) : le job répète l'échange OIDC.
   Un `npm-stage` en échec fait échouer le run de release (`ship watch` sort en 1) sans toucher à la release publiée
   ni à la documentation ; une fois la cause réglée (souvent un trusted publisher absent), on relance le job seul. La
   procédure, et la première release par npm : [Paquets npm](contribute.npm-packages.md#staging-job).

> [!LIMIT id=published-never-changed]
> Une release publiée ne change jamais. Un run sur une release déjà publiée s'arrête avant de rien faire. Un brouillon
> laissé par un run qui a échoué avant la publication n'a jamais été public : il est supprimé (son tag reste) et refait
> depuis le même candidat. Une RC ratée ne se corrige pas : elle devient une `rc.N+1`.

<a name="what-a-release-carries"></a>

### Ce que porte une release

Chaque release est faite des fichiers que son candidat a produits sur le commit tagué, porte ses licences dans
l'archive, et joint : le jeu
construit (`dist`), son manifeste d'assets, les archives des cinq paquets npm (`quest-n-click`, `create-quest-n-click`,
`quest-n-click-bridge`, `quest-n-click-connectors`, `quest-n-click-studio-server` ; [Paquets npm](contribute.npm-packages.md)),
un SBOM CycloneDX par paquet et un pour l'image du Bridge (cinq SBOM en 4.1.19, six depuis le paquet du Studio Server
en 4.2.1), l'image du Bridge, les preuves des catalogues Remix, un speedrun complet du chapitre de référence vérifié par
`speedrun:verify`, les runs du candidat, sa baseline, les fichiers de son site, ses surfaces et sa répétition de
signature, le manifeste du candidat, des sommes SHA-256 et une attestation de provenance de build
(`gh attestation verify <file> -R Quest-n-Click/quest-n-click` depuis la 4.5.2, voir plus bas pour les releases d'avant) ;
à partir de la 4.5.0, l'archive de la documentation. Elle
n'est jamais remplacée une fois publiée. Ce que seuls des gens et de vrais appareils vérifient est rapporté dans ses
notes ([Passes de terrain](contribute.field-passes.md)).

Une pré-version (`4.1.8-rc.1`) se tague de la même façon ; release.yml la marque comme pré-release sur GitHub.

<a name="docs-publish"></a>
<!-- applies: 4.5.0.. -->

### La documentation, après la relecture

À partir de la 4.5.0, le job `docs-publish` de release.yml dépend (`needs`) du job de release : il ne démarre donc
qu'une fois `ship verify` passé. Il appelle `.github/workflows/docs-publish.yml` avec le tag, le SHA, le candidate run et
le sha256 de l'archive de documentation, promeut cette archive (celle du candidat, vérifiée de nouveau), l'inscrit dans
`publication.json` et pousse le wiki ; une rc ne publie que `/docs/<v-rc>/`. Il n'est jamais lancé par
`release: published`, qu'une release publiée avec `GITHUB_TOKEN` ne déclenche pas. Seule la clé de déploiement du wiki,
`WIKI_DEPLOY_KEY`, lui est passée. Voir [Écrire la documentation](contribute.writing-docs.md).

<a name="maintainer-settings"></a>

### Ce que le mainteneur active, une fois (après la PR 3b de la 4.1.20)

- **Les releases immuables** : Settings → General → Releases. Une release publiée garde alors ses fichiers et son tag.
- **Un ruleset sur les tags de release** : cible `tag`, `refs/tags/v*`, actif. Il réserve la création, refuse la
  suppression et interdit le force-push.
- **La politique de déploiement de l'environnement `docs-publish`** (depuis la 4.5.3) : Settings → Environments →
  docs-publish → Deployment branches and tags, une règle de **tag** `v*` à côté de `main` et `docs/*`. release.yml
  tourne sur le push du tag, donc le job de documentation qu'il appelle tourne sur la ref du tag ; sans la règle, ce
  job est refusé (la release elle-même est publiée ; `mode=promote` depuis main rattrape la documentation).
- `npm run ship -- preflight-stable --candidate=<run>` doit alors voir les deux premiers. **Avant le premier tag de la 4.1.20**,
  `ship tag` refuse de taguer tant que les releases immuables sont désactivées : le jeton de release.yml ne peut pas
  lire ce réglage (il faut un droit de lecture admin), donc `ship tag` le vérifie avec l'accès du mainteneur.

<a name="signing"></a>

### Signer les tags

Les tags 4.1.x restent annotés (D30). À partir de la 4.2, ils sont signés avec la clé SSH du mainteneur :

```sh
# dans le dépôt du moteur
git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519.pub
npm run ship -- tag 4.2.0-rc.2 <sha> --candidate=<run> --sign
```

- La clé doit aussi être enregistrée sur GitHub comme clé de **signature** (Settings → SSH and GPG keys).
- Elle doit figurer dans `.github/allowed_signers`, ajouté dans un commit signé par cette clé (8cebea2, fait par Claude
  à la demande du mainteneur : D37). Ce fichier est aussi la racine de confiance des passes reportées (ADR 0024).
- `--key=<fichier>` donne un autre fichier de clé que `user.signingkey`.
- Chaque candidat répète ce chemin avec une clé éphémère (`signing-rehearsal`) : il signe un tag du commit, jamais
  poussé, le vérifie avec `git verify-tag`, puis détruit la clé.

> [!LIMIT id=signature-not-approval]
> Avec `id_ed25519`, la signature prouve l'usage de la clé, pas l'accord du mainteneur : un accord est consigné
> explicitement (D37).

<a name="preflight"></a>

### Le préflight stable

```sh
# dans le dépôt du moteur
npm run ship -- preflight-stable --candidate=<run> [--version=4.2.0]
```

Il ne signe rien, ne publie rien et ne change aucun réglage
([`tools/release/preflight.mjs`](../../tools/release/preflight.mjs)). Il dit, vérification par vérification, `ok`,
`missing` (une étape encore à faire) ou `blocked` (quelque chose ne va pas) :

- la clé de signature, locale et enregistrée ;
- `allowed_signers` ;
- l'immuabilité et le ruleset de tags ;
- la provenance du candidat ;
- pour chaque paquet npm : l'archive (`npm publish --dry-run`), le nom, le bootstrap, le trusted publisher (sur
  `release.yml`, en stage-only), une publication OIDC prouvée, et la version pas encore publiée ;
- le job `npm-stage` de release.yml : il met en scène par `tools/release/npm-stage.mjs`, jamais par `npm publish`,
  jamais avec un jeton ;
- le Node et le npm exacts de l'étape de mise en scène ;
- le GO / NO-GO face aux rapports des personnes (« GO for 4.2 on a reduced scope » se lit avec D38 écrite).

Il ne sort en 1 que sur un `blocked`.

<a name="ship-commands"></a>

### Toutes les commandes `ship`

| Commande | Ce qu'elle fait |
|---|---|
| `ship checks <pr>` | Attend les vérifications de la pull request ; relance une fois un job en échec ; sort en 1 s'il échoue encore |
| `ship merge <pr>` | `checks`, puis fusionne (un commit de fusion, la seule méthode que le ruleset permet) ; affiche le SHA |
| `ship main <sha>` | Attend que le run `ci` de main sur ce SHA soit vert (relancé une fois) |
| `ship tag <version> <sha> --candidate=<run> [--sign [--key=<file>]]` | Attend le `ci` de main sur le SHA, tague (plus haut), pousse, puis `watch` |
| `ship watch <version>` | Attend le run `release` du push du tag ; sort selon sa conclusion |
| `ship verify <version>` | La relecture (plus haut) |
| `ship preflight-stable --candidate=<run> [--version=<x.y.z>]` | Le préflight stable (plus haut) |
| `ship chain <pr> <version>` | fusion → tag → watch → verify ; refusée depuis la 4.1.17, dont les tags demandent un candidate run du commit de fusion (fusion, candidat, puis tag) |

Chaque commande est idempotente et dit ce qu'elle attend.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`ship watch` sort en 0 avec le succès du run de release ; `ship verify <version>` affiche chaque fichier vérifié et
sort en 0 ; la page de la release montre les fichiers et « Immutable » ;
`gh attestation verify <file> -R Quest-n-Click/quest-n-click` passe pour n'importe lequel de ses fichiers, depuis la 4.5.2.
Une release faite avant le passage dans l'organisation (D51) garde ses attestations sous l'utilisateur wanoo :
`gh attestation verify <file> --owner wanoo --signer-workflow wanoo/quest-n-click/.github/workflows/release.yml` de la
4.2.5 à la 4.5.1, `gh attestation verify <file> --owner wanoo --signer-repo wanoo/web-scumm` jusqu'à la 4.2.4 (`ship
verify` demande chaque release ainsi, et dit que l'attestation de release propre à GitHub de ces releases n'est pas
vérifiée).

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| ship tag : « no "## x.y.z" section in CHANGELOG.md at … » | Le commit n'est pas la fusion de la pull request de release | Fusionner la pull request de release, lancer un candidat sur son commit de fusion, taguer celui-là |
| ship tag : « no git remote here points to Quest-n-Click/quest-n-click » | Seul un fork est un remote ici | `git remote add upstream git@github.com:Quest-n-Click/quest-n-click.git` |
| release.yml : « names no candidate run » | Le tag a été fait sans `--candidate` | Taguer la version suivante (ou `rc.N+1`) avec `--candidate` : le ruleset refuse de supprimer un tag |
| release.yml : « run … is not a green candidate started on main » | Le run est celui d'une pull request, d'une autre branche, ou rouge | Lancer `candidate` à la main sur main pour ce SHA |
| release.yml : « has no candidate-site » (ou `-surfaces`, `-signing`, `-remix`, `-pack`, `-sbom`, `-image`) | Un candidat antérieur à l'étape | Lancer un nouveau candidat |
| release.yml : « main's ci has not succeeded on … » | Le run `ci` de main sur ce SHA tourne encore, est rouge ou annulé | L'attendre (ou le relancer) sur main, puis relancer le job de release |
| release.yml : « is not on main's first-parent line » | Le tag est sur un commit d'une branche de travail, pas sur une fusion dans main | Taguer la version suivante sur le commit de fusion de main |
| `ship tag` refuse `--now` | `--now` n'existe plus depuis la 4.5.3 | Taguer sans : `ship tag` attend le `ci` de main |
| « is published: a published release is never changed » | Une relance sur un tag publié | Rien à faire ; une nouvelle version est un nouveau tag |
| `ship tag` refuse : releases immuables désactivées | Le réglage n'est pas activé | L'activer (plus haut), puis taguer |
| Une RC ratée | — | Taguer `rc.N+1` depuis un nouveau candidat |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Un tag `v<version>` (signé), une release GitHub avec ses fichiers et attestations, `.cache/pids/ship-*.pid` en local ;
à partir de la 4.5.0, le wiki et `publication.json` (par `docs-publish`). Avant cela, la branche de release modifie
`CHANGELOG.md`, `docs/dev/LOG.md` et `docs/dev/passes/<version>.md`.

<a name="recovery"></a>

## Revenir en arrière

Une release publiée ne peut être ni changée ni retirée : un défaut se corrige dans une nouvelle version. Un brouillon
est supprimé par le run de release suivant. Un tag pas encore publié peut rester tel quel, et un nouveau candidat être
tagué sous le numéro de pré-version suivant.

<a name="references"></a>

## Références

- [`tools/release/ship.mjs`](../../tools/release/ship.mjs), [`tools/release/candidate.mjs`](../../tools/release/candidate.mjs),
  [`tools/release/artifacts.mjs`](../../tools/release/artifacts.mjs), [`tools/release/preflight.mjs`](../../tools/release/preflight.mjs),
  [`tools/release/signing.mjs`](../../tools/release/signing.mjs), [`tools/release/main-ci.mjs`](../../tools/release/main-ci.mjs).
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml), [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml).
- D30, D37, D38, D55 ; ADR 0024. [Passes de terrain](contribute.field-passes.md), [Paquets npm](contribute.npm-packages.md),
  [Stabilité et support](start.stability.md#releases).
