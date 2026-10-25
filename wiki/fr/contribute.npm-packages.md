# Paquets npm

Le moteur se livre en cinq paquets npm, empaquetés depuis les fichiers que git suit par
[`scripts/pack.mjs`](../../scripts/pack.mjs) et joints à chaque release GitHub. Cette page dit ce que contient chaque
paquet, comment les paquets sont vérifiés, et où en est leur publication sur le registre npm. Pour les installer en
tant qu'utilisateur : [Référence du paquet](install.package.md).

<a name="packages"></a>

## Les cinq paquets

| Paquet (archive) | Ce qu'il contient | Depuis |
|---|---|---|
| `@quest-n-click/engine` (`quest-n-click-<v>.tgz`) | Le moteur (`src/`), ses pages, ses outils, la commande `quest-n-click`, le modèle de jeu (`games/_template/`), et depuis la 4.5.0 son bundle de documentation `docs-bundle/` ; jamais un jeu de ce dépôt, un test, une page source de la doc ni un build | 3.9 |
| `@quest-n-click/create` (`create-quest-n-click-<v>.tgz`) | `npm init @quest-n-click <dossier>`, qui lance `quest-n-click create` | 3.9 |
| `@quest-n-click/bridge` (`quest-n-click-bridge-<v>.tgz`) | Le Reality Bridge de référence (un module, ses politiques) : un jeu qui n'en fait pas tourner ne l'installe jamais | 4.1.1 |
| `@quest-n-click/connectors` (`quest-n-click-connectors-<v>.tgz`) | Les connecteurs du monde extérieur (un module, son worker MIME) : ceux d'un opérateur, jamais d'un jeu | 4.1.9 |
| `@quest-n-click/studio-server` (`quest-n-click-studio-server-<v>.tgz`) | Le Studio en ligne et son worker (deux commandes, la page du Studio) : celui d'un opérateur, à côté du moteur | 4.2.1 |

Le paquet du moteur ne prend que des chemins suivis sous ses racines (`src/`, `tools/`, `studio-server/`, une partie de
`bridge/src/`, `cli/`, `games/_template/`, les icônes et polices, `index.html`, `studio.html`, `vite.config.ts`,
`tsconfig.json`, `requirements.txt`, `LICENSE`). Un fichier non suivi sous l'une de ces
racines arrête l'empaquetage (« git add or commit them, or add them to .gitignore ») au lieu d'être oublié en silence.
Le Bridge, les connecteurs et le Studio Server portent leur verrou versionné en `npm-shrinkwrap.json` ; un verrou qui ne
correspond plus à son manifeste arrête l'empaquetage : `npm run locks` le refait (relire le diff, le commiter), et
`npm run locks -- --check` dit, sans réseau, si chaque verrou correspond encore.

De la 4.2.5 à la 4.2.x, chaque paquet était aussi empaqueté sous son ancien nom web-scumm, un alias aux mêmes fichiers
et à la même version (D47). La 4.3.0 n'empaquette plus que les nouveaux noms ; `npx quest-n-click migrate` fait quitter
les anciens à un jeu.

À partir de la 4.5.2, les paquets sont nommés sous le scope de l'organisation npm (D53) : une organisation ne possède
que des paquets à scope, donc les cinq noms appartiennent à `quest-n-click`, dont les propriétaires peuvent chacun
approuver une publication. De la 4.2.5 à la 4.5.1, ils s'appelaient `quest-n-click`,
`create-quest-n-click`, `quest-n-click-bridge`, `quest-n-click-connectors` et `quest-n-click-studio-server` : ces noms
sont gardés comme pointeurs dépréciés vers les noms à scope. Les commandes gardent leur nom (`quest-n-click`,
`create-quest-n-click`, `quest-n-click-bridge`…), et les archives jointes à une release aussi : `scripts/pack.mjs`
renomme le `quest-n-click-engine-<v>.tgz` de npm en `quest-n-click-<v>.tgz`, si bien que les fichiers, les sommes et
les attestations d'une release gardent leur nom. Chaque manifeste porte `publishConfig.access: public`, son
`repository` et ses `engines`.

```sh
# dans le dépôt du moteur
npm run pack                                   # les cinq archives dans .cache/pack
node scripts/pack.mjs --out=.cache/pack --publish-dry-run   # et ce que `npm publish` enverrait pour chacune
```

<a name="how-it-is-checked"></a>

## Comment les paquets sont vérifiés

- **`npm run fresh-install`** (job de CI `fresh-install`, quand le plan dit qu'un paquet, le modèle ou un chemin
  d'écriture a changé) : empaquette le moteur, crée un jeu depuis le modèle empaqueté dans un dossier vide hors du
  dépôt, installe l'archive, lance `assets`, `verify` et `build` (chaque fichier de `dist/` justifié), et joue le jeu
  jusqu'à sa fin dans Chromium. Un fichier du nouveau projet qui nomme le dépôt le fait échouer.
- **`npm run external-consumer`** (job de CI `external-consumer`, et dans le candidat sous Ubuntu, macOS et Windows sur
  les archives du candidat lui-même, `--tarballs=`) : les archives utilisées comme un tiers les utilise. Il lit chaque
  archive (nom, version, licence, binaires, exports, aucune dépendance `file:` ni `link:`, aucun chemin du dépôt ; les
  fichiers du bundle de documentation contre leur sha256) ; crée un jeu sur une release plus ancienne (`--from`, 4.1.17
  par défaut), le fait passer au candidat comme son auteur le ferait (désinstaller l'ancien paquet, installer
  `@quest-n-click/engine`, `npx quest-n-click migrate`), joue une ancienne sauvegarde et une nouvelle partie jusqu'à la fin ;
  appelle `read_doc`, `list_docs` et `search_docs` par un vrai client MCP en stdio ; lance `create-quest-n-click` depuis son archive ;
  installe le Bridge (init, doctor, serve sur SQLite, et sur Postgres quand `CONSUMER_PG_URL` est défini) et les
  connecteurs, puis un webhook email signé accepté, le même message vu comme doublon, une mauvaise signature refusée.
- **`--publish-dry-run`** dans `release-check` et dans le job `pack` du candidat : ce que `npm publish` enverrait.
- **SBOM** : le candidat fait un SBOM CycloneDX par archive (`scripts/sbom.mjs`), depuis ce que l'archive contient.

<a name="npm-publishing"></a>

## La publication sur npm : mise en scène par la CI, approuvée par un propriétaire

Chaque release joint les cinq archives. À partir de la 4.5.2, le job `npm-stage` de release.yml les **met en scène**
sur npm une fois la release publiée et relue, et un propriétaire de l'organisation **approuve** chacune avec sa 2FA
(D34, D53). La CI ne publie jamais et ne détient aucun jeton npm. La 4.5.2 a été la première release publiée là, le
24 octobre 2026 (la 4.5.1 est la dernière release sans l'étape). Le canal `next` depuis `main` suit dans une pull
request ultérieure de #283.

> [!LIMIT id=not-on-npm]
> Une release n'est sur npm qu'une fois qu'un propriétaire a approuvé ce qu'elle met en attente : entre son tag et
> cette approbation, `npm install @quest-n-click/engine` installe la précédente. Une pré-release n'est jamais sur npm ;
> utilisez ses fichiers `.tgz`.

<a name="npm-names"></a>

### Les noms, surveillés chaque nuit

Les cinq noms à scope (`@quest-n-click/engine`, `@quest-n-click/create`, `@quest-n-click/bridge`,
`@quest-n-click/connectors`, `@quest-n-click/studio-server`) et les anciens (`web-scumm`, `create-web-scumm`,
`web-scumm-bridge`, `web-scumm-connectors`, `web-scumm-studio-server`) sont vérifiés chaque nuit par le job
`npm-names` de `.github/workflows/nightly.yml`, qui ne bloque jamais : chacun est « still free » (un 404), « ours »
(publié par exactement un propriétaire de l'organisation), ou un avertissement « taken » dans le résumé du run, pour
que les mainteneurs agissent. Les propriétaires sont une liste, `OWNERS` dans `tools/release/preflight.mjs` et sa
copie dans le job : npm ne montre les membres d'une organisation qu'à ses membres, et la CI n'a pas de jeton.
Elle contient les utilisateurs npm des deux co-mainteneurs, `lostinbrittany` et `wanoo`. Les noms sans scope de la 4.2.5 à la 4.5.1 (`quest-n-click`,
`create-quest-n-click`, `quest-n-click-bridge`, `quest-n-click-connectors`, `quest-n-click-studio-server`) sont des
pointeurs : le job attend de chacun qu'il soit à un propriétaire et déprécié, prévient quand l'un n'est pas déprécié
ou appartient à un tiers, et note celui qui est encore libre (à réserver). `create-quest-n-click` fait exception, c'est
un **relais** : publié sur le compte d'un propriétaire, sa commande fait
`await import('@quest-n-click/create/index.mjs')`, si bien que `npx create-quest-n-click my-game` marche toujours et
lance la même chose que `npm init @quest-n-click my-game`. Le job attend de lui qu'il soit à un propriétaire et **non**
déprécié. Il faut pour cela que `@quest-n-click/create` garde `index.mjs` à sa racine et aucune carte `exports`
(`tests/pack-manifests.test.ts`).

<a name="publishing-steps"></a>

### Les étapes de publication

1. **Versions.** La publication en étapes demande au moins npm 11.15.0 et Node 22.14.0 ([doc npm][staged]). Le job
   `npm-stage` épingle des versions **exactes** dans son env, `NPM_PUBLISH_NODE: 22.23.3` et `NPM_PUBLISH_NPM: 11.21.0` :
   il installe ce Node, puis ce npm (`npm install -g npm@11.21.0` ; Node 22.23.3 livre npm 10.9.9), et vérifie les deux
   avant que rien n'atteigne npm. `tests/release-stable.test.ts` et `ship preflight-stable` refusent une plage.
2. **Les comptes.** L'organisation `quest-n-click` exige la 2FA de ses membres ; le compte de chaque propriétaire l'a
   activée.
3. **Bootstrap, une fois par paquet** (fait le 24 octobre 2026 pour les cinq noms à scope, tag `bootstrap`). Un paquet
   qui n'existe pas reçoit une **version de réservation**, jamais une version du produit :

   ```sh
   # dans le dossier de l'archive, depuis la session du mainteneur (ou avec un jeton stage-only)
   npm stage publish <archive of 0.0.0-bootstrap.0>
   ```

   - Mettre en scène un paquet qui n'existe pas publie un placeholder `0.0.0-stage` jusqu'à son approbation
     ([doc npm][staged]) ; `latest` le désigne jusqu'à l'approbation de la première release.
   - Une publication locale ne porte pas de provenance OIDC. C'est pourquoi elle ne porte jamais une version du
     produit.
4. **Trusted publishing, en stage-only, une fois par paquet**, juste avant la première release qui s'en sert :

   ```sh
   # n'importe où, connecté à npm en tant que propriétaire de l'organisation (2FA)
   npm trust github @quest-n-click/engine --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   npm trust github @quest-n-click/create --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   npm trust github @quest-n-click/bridge --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   npm trust github @quest-n-click/connectors --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   npm trust github @quest-n-click/studio-server --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   ```

   - La CI peut alors mettre en scène, jamais publier (pas de `--allow-publish`).
   - npm vérifie le **nom de fichier** du workflow, `release.yml`, celui qui lance le job `npm-stage`.
   - Une configuration neuve doit réussir sa première mise en scène en moins de **deux jours**, sinon elle expire : les
     lancer juste avant le tag.
5. **La mise en scène, à chaque release** ([plus bas](#staging-job)) : le job `npm-stage` met en scène les cinq
   archives, le moteur d'abord, et écrit dans le résumé du run les ids et les commandes qui les approuvent.
6. **La promotion, par un propriétaire.** Un propriétaire de l'organisation (l'un ou l'autre) approuve chaque paquet mis
   en scène avec sa 2FA, **le moteur d'abord** (`@quest-n-click/create` dépend de sa version exacte) :

   ```sh
   # n'importe où, connecté à npm en tant que propriétaire (npm 11.15.0 ou plus) ; les ids sont dans le résumé du run
   npm stage view <id>       # ce qui a été mis en scène, avant d'approuver
   npm stage approve <id>    # une fois par paquet, dans l'ordre du résumé
   ```

7. **Après la première approbation**, sur npmjs.com, chaque paquet → Settings → Publishing access : **Require
   two-factor authentication and disallow tokens**. Le trusted publishing continue de marcher ; un jeton, non.
8. **Classement dual-use de `@quest-n-click/connectors`** (décidé en 4.1.20, PR 3b) :
   - la [politique dual-use][dual] de npm vise les « capacités sensibles pour la sécurité, qui peuvent ressembler à un
     logiciel malveillant » : outils de test d'intrusion, utilitaires de recherche en sécurité, obfuscation ;
   - les connecteurs sont des serveurs qu'un jeu fait tourner (une façade SSH et Telnet pour son terminal, un webhook
     et un lecteur IMAP pour l'email, un vérificateur Open Badge). Ils ne scannent rien, n'attaquent rien et ne cachent
     rien. **Ils ne sont pas déclarés dual-use** ;
   - ils passent de toute façon par la publication en étapes et une promotion 2FA, comme chaque paquet. C'est la
     méthode de publication que la politique demande au contenu dual-use ;
   - si l'analyse de npm à la publication retient ou signale le paquet, on ajoute
     `"contentPolicy": { "class": "dual-use" }` et un fichier `DISCLOSURE`. La déclaration persiste ensuite d'une
     version à l'autre.

`npm run ship -- preflight-stable --candidate=<run>` vérifie, pour chaque paquet, l'archive, le nom (à nous quand un
propriétaire de l'organisation le publie), le bootstrap, le trusted publisher (sur `release.yml`, en stage-only), une
publication OIDC prouvée, la version pas encore publiée, et à partir de la 4.5.2 son pointeur sans scope (à un
propriétaire, déprécié) ; et que release.yml met en scène par `npm-stage` sans jamais publier
([Publier une release](contribute.releasing.md#preflight)).

<a name="staging-job"></a>

### Le job `npm-stage`

Il tourne après la réussite du job `release` (`ship verify` sa dernière vérification), à côté de `docs-publish`, qui ne
l'attend pas : une panne de npm ou un trusted publisher absent ne retient jamais la documentation d'une release déjà
publiée, et le job se relance seul. Ses permissions sont `contents: read` et `id-token: write`, rien d'autre.

1. Il extrait le commit du tag (un tag d'avant la 4.5.2 n'a pas `tools/release/npm-stage.mjs` : un avis, rien de
   fait), installe le Node et le npm épinglés et vérifie leurs versions.
2. Il télécharge les fichiers `.tgz` et le `SHA256SUMS` de la release elle-même (`gh release download`) et vérifie
   chaque archive contre les sommes : les octets mis en scène sont ceux que porte la release.
3. `node tools/release/npm-stage.mjs` refuse un jeton dans l'environnement ou dans un `.npmrc`, lit le manifeste de
   chaque archive (son nom à scope, la version du tag, un `repository` qui nomme ce dépôt, `@quest-n-click/create` sur
   le moteur exact), puis, pour chaque paquet, le moteur d'abord :
   - `npm view <nom>@<version> version` : déjà publiée, passée ;
   - `npm stage publish <archive> --provenance --access public --tag latest` : mise en scène, son id gardé ;
   - le `409 Conflict` de npm, la version n'étant pas publiée : mise en scène par un run précédent, passée (une
     version en scène ne se voit pas sans jeton : `npm stage list` refuse le jeton OIDC de courte durée, c'est donc le
     conflit qui répond) ;
   - `ENEEDAUTH` (« requires you to be logged in ») : OIDC n'a donné aucun identifiant, aucun trusted publisher
     n'accepte donc ce workflow (absent, ou expiré faute d'usage). Le job échoue avec la commande `npm trust github …`
     de ce paquet.
   Il s'arrête au premier échec, si bien que `@quest-n-click/create` n'est jamais mis en scène sans son moteur.
4. Le résumé du run donne l'état de chaque paquet et les lignes `npm stage approve <id>`, dans l'ordre.

**Un tag de pré-version ne met rien en scène.** Ses archives portent la version stable (`v4.5.2-rc.1` emballe
`4.5.2`), que le tag stable doit mettre en scène : la mettre en scène prendrait ce numéro pour de bon (une version en
scène le garde, et son dist-tag ne change plus). Le job **répète** à la place : `npm stage publish --dry-run` par OIDC,
qui prouve que le trusted publisher répond à ce workflow, et n'envoie rien. Un essai à blanc sans identifiant ne fait
qu'avertir, ce que le job lit comme un échec. Un essai à blanc ne fait pas de provenance : on la voit donc d'abord à la
mise en scène du tag stable, avant l'approbation.

> [!LIMIT id=npm-provenance-commit]
> npm fait la provenance à partir du run (`GITHUB_SHA`, `GITHUB_REF`). Depuis la 4.5.3 (#291), release.yml tourne
> sur le push du tag : elle nomme donc `release.yml` sur `refs/tags/v<version>` et le commit du tag, et le jeton OIDC
> qui la signe dit la même chose ; jusqu'à la 4.5.2, il tournait sur `workflow_run`, depuis la copie de main, et elle
> nommait `refs/heads/main` à la tête de main. Le résumé écrit le commit, et le signale (ne pas approuver) s'il n'est
> pas celui du tag. À vérifier à la première mise en attente avec `npm stage view <id>` avant d'approuver, puis une
> fois publiée avec `npm view @quest-n-click/engine@<v> dist.attestations`. Les attestations de la release elle-même
> viennent du même run.

<a name="first-release"></a>

### La première release par npm

1. Les cinq trusted publishers (étape 4), juste avant de taguer.
2. Un tag `-rc` d'abord : son job `npm-stage` répète les cinq ; vert, OIDC est accepté pour chacun.
3. Le tag stable, dans les deux jours : le job met en scène les cinq ; lire le résumé du run.
4. `npm stage view <id>` pour le moteur (provenance, contenu), puis approuver les cinq dans l'ordre du résumé.
5. `npm view @quest-n-click/engine version` répond la version ; `npm install @quest-n-click/engine` dans un dossier vide.
6. Étape 7 : exiger la 2FA et refuser les jetons sur chaque paquet. [Installer depuis npm](install.from-npm.md) perd
   alors sa limite « pas encore publié ».

[staged]: https://docs.npmjs.com/staged-publishing
[dual]: https://docs.npmjs.com/policies/dual-use/

<a name="related"></a>

## Voir aussi

- `npm run pack`, `npm run fresh-install`, `npm run external-consumer`, `npm run locks`, `npm run ship`.
- [Publier une release](contribute.releasing.md), [Référence du paquet](install.package.md),
  [Installer depuis npm](install.from-npm.md).
