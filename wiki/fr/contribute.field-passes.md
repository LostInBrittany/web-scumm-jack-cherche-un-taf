# Passes de terrain : ce que seuls des gens et de vrais appareils vérifient

<a name="overview"></a>

## Vue d'ensemble

La machine vérifie une release à chaque push : le solveur, les navigateurs en CI, l'archive, les budgets. Certaines
vérifications demandent une personne ou un vrai appareil : un lecteur d'écran, Safari hors ligne sur un iPhone, des
testeurs qui ne connaissent pas les énigmes, un Studio déployé. Ce sont les **passes de terrain**. Elles sont
rapportées dans les notes de chaque release, sans bloquer (D12) : une release dit combien ont été faites. Cette page
dit comment faire une passe, quoi rapporter, et comment une passe est vérifiée puis reportée sur un nouveau candidat.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un rapport JSON par passe, lié au candidate run essayé, vérifié par `field:check`, et la fiche de la release
`docs/dev/passes/<version>.md` générée depuis ces rapports par `field:report`. Chaque passe est aussi une issue GitHub
ouverte avec le label `field-pass`, que le mainteneur ferme une fois le test fait et son rapport vérifié.

<a name="context-and-versions"></a>

## Contexte et versions

Dans le dépôt du moteur, pour le mainteneur et les personnes qui testent une release. Le Field Kit (des rapports en
JSON) existe depuis la 4.1.18, les bundles signés depuis la 4.1.19, le report d'une passe depuis la 4.1.20 ; la liste
des passes s'allonge avec les versions (plus bas). Ce que dit cette page vaut à partir de la 4.1.20.

<a name="prerequisites"></a>

## Prérequis

- Le dépôt du moteur installé ([Préparer son poste de développement](contribute.setup.md)).
- La CLI GitHub `gh`, connectée : `field:init` télécharge le manifeste du candidat depuis le run.
- Un **candidate run** vert de la release ([Publier une release](contribute.releasing.md#the-chain)) : une passe se
  fait toujours sur un candidat précis.
- Pour la passe d'une personne : l'appareil ou le déploiement que la passe nomme.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, sur votre machine. Les rapports s'écrivent sous `.cache/field/<version>/` (non commité) ; la
fiche va dans `docs/dev/passes/<version>.md` (commitée).

<a name="steps"></a>

## Étapes

<!-- step: init -->
1. **Écrire les rapports à `not-run`**, liés au candidat que le tag nommera :

   ```sh
   # dans le dépôt du moteur
   npm run field:init -- --release=4.4.0 --candidate=<run id>
   ```

   La commande écrit un rapport par passe demandée à cette release, dans `.cache/field/4.4.0`, lié au commit du
   candidat, à l'id de son run et au SHA-256 de chaque fichier jugé, et télécharge à côté le `candidate-manifest.json`
   du run (et son attestation) avec `gh run download`. Elle y garde aussi les surfaces et les fichiers du site du
   candidat. Un rapport existant est gardé sauf avec `--force` ; `--manifest=<fichier>` fournit le manifeste au lieu de
   le télécharger, `--dir=<dossier>` choisit un autre dossier.

<!-- step: try-pass -->
2. **Faire la passe** comme son issue le décrit (quoi essayer, avec quoi, quelles preuves rendre), puis remplir son
   rapport : l'opérateur, le début et la fin, sur quoi, le scénario, le statut, et les fichiers de preuve sous
   `evidence/`.

<!-- step: check -->
3. **Vérifier le dossier** :

   ```sh
   # dans le dépôt du moteur
   npm run field:check -- --dir=.cache/field/4.4.0
   ```

   Schéma, candidat, SHA-256 de chaque preuve, recherche de fuites. `--require=<passId,…>` nomme des passes qui doivent
   être `passed` (une gate ; aucune passe humaine ne bloque un tag, D12).

<!-- step: report -->
4. **Écrire la fiche** :

   ```sh
   # dans le dépôt du moteur
   npm run field:report -- --dir=.cache/field/4.4.0 --out=docs/dev/passes/4.4.0.md
   ```

   Le tableau va entre `<!-- field:begin -->` et `<!-- field:end -->` (ou à la place de la section
   « ## People's passes » de la fiche, ou dans une nouvelle fiche). Commiter la fiche. Elle est générée depuis les
   rapports, jamais retouchée à la main pour devenir un succès.

<!-- step: close-issue -->
5. **Fermer l'issue.** Le mainteneur ferme l'issue `field-pass` de la passe une fois le test fait et son rapport
   vérifié. Une issue ouverte est une passe non faite.

<a name="the-passes"></a>

### Les passes, par id

Une passe a un id stable (`tools/field/schema.ts`). Une passe ajoutée plus tard n'est pas demandée à une release plus
ancienne (`passesFor`) : 13 de la 4.1.18 à la 4.2.0, 21 pour la 4.4.0, 22 à partir de la 4.5.0.

| Id | Ce que c'est | Demandée depuis |
|---|---|---|
| `bridge-postgres-https` | Un Bridge multi-instance derrière HTTPS sur Postgres, un worker tué en pleine vérification | 4.1.18 |
| `runs-real-players` | Des runs Histoire, Remix et Daily soumis par de vraies personnes | 4.1.18 |
| `run-resume-power-cycle` | Un run repris après l'arrêt et le redémarrage de la machine | 4.1.18 |
| `code-wheel-human` | La roue à code imprimée et utilisée à table ; l'alternative texte par une personne avec lecteur d'écran | 4.1.18 |
| `mystery-deployed` | Un monde Mystery joué depuis le menu Remix contre un Bridge déployé | 4.1.18 |
| `safari-ios-offline-update` | Safari hors ligne sur un iPhone, et sa mise à jour | 4.1.18 |
| `firefox-real-offline` | Firefox hors ligne sur une vraie machine | 4.1.18 |
| `phone-both-renderers` | Un vrai téléphone avec les deux peintres | 4.1.18 |
| `livesplit-obs` | Une vraie session LiveSplit et OBS | 4.1.18 |
| `connectors-real-security` | De vrais connecteurs et la passe de sécurité d'une personne | 4.1.18 |
| `blind-playtesters` | Des testeurs qui ne connaissent pas les énigmes | 4.1.18 |
| `voices-listening` | Les voix écoutées | 4.1.18 |
| `archive-human-install` | L'archive publiée installée par une personne | 4.1.18 |
| `studio-hosted` | Le Studio Server déployé sur Clever Cloud (Node, PostgreSQL, Cellar, Keycloak, un domaine TLS), depuis son archive, en suivant son guide ; un vrai Safari sur macOS et iOS | 4.2.1 |
| `studio-collab` | Trois personnes sur un même Studio hébergé, une coupure réseau et un redéploiement pendant qu'elles éditent | 4.2.1 |
| `studio-preview` | Sur un Studio hébergé, des personnes jouent la révision partagée sans serveur de dev, une sauvegarde qui passe d'une révision à l'autre, la pastille de santé, leur propre annulation, un build publié | 4.2.2 |
| `studio-assets-hosted` | La préparation d'un Studio hébergé sur le worker (Python, ffmpeg), le jeu d'assets préparé joué dans l'onglet Play | 4.2.2 |
| `studio-mcp-remote` | Un agent IA sur un Studio hébergé par son MCP distant (`/mcp`) : un vrai client MCP, le jeton d'un membre, une écriture au journal au nom du membre, un pan tenu par un autre refusé | 4.2.3 |
| `studio-oidc-generic` | Le Studio Server derrière un second fournisseur OpenID Connect (GitLab, D44) : connexion, rôles, un membre révoqué refusé, vérifié par une personne | 4.2.3 |
| `heroes-two-languages` | L'exemple des héros (`games/heroes`) sur un vrai téléphone, en anglais et en français : la carte, le nom, les répliques et la voix de chaque héros, une sauvegarde reprise | 4.4.0 |
| `studio-hero-matrix` | La matrice héros × langues du Studio lue par un auteur sur son propre jeu : ce qu'elle montre, ce qui manque, ce qu'elle devrait dire | 4.4.0 |
| `docs-beginner-reader` | Une personne débutante cherche dans la documentation publiée la réponse à dix vraies questions ([BEGINNER-READER.md](../../docs/dev/acceptance/BEGINNER-READER.md)) : trouvée, absente ou mal comprise, dans sa langue | 4.5.0 |

<a name="playtesters"></a>

### Testeurs (`blind-playtesters`)

1. Envoyer l'URL du jeu. Dire seulement : « joue comme tu veux ; quand tu t'arrêtes, fini ou pas, ouvre le menu pause
   et touche *Partager la session* ». N'expliquer aucune énigme, même sur demande : noter la question.
2. *Partager la session* fait un fichier avec les entrées depuis le début de la partie (ids et indices seulement, pas
   de texte du journal, pas de nom), la famille d'appareil (`ios`, `android` ou `desktop`, rien de plus fin) et les
   tapes manquées (une tape sur rien à côté d'une cible, par lieu et cible). Le testeur l'envoie comme il veut.
3. Déposer les fichiers dans `games/<id>/playtests/` (commité ; `npm run audit` le couvre), puis, dans le dépôt du
   moteur :
   - `npm run playtests -- --out=.cache/playtests` : temps de jeu par lieu, où les joueurs bloquent, indices montrés,
     où ils se sont arrêtés, tapes manquées, une carte de chaleur sur le graphe d'énigmes ;
   - `npm run verify:field` : `verify:commercial`, puis cinq sessions qui se rejouent encore, trois jouées jusqu'au
     bout, deux familles d'appareils. Ces nombres sont les quotas d'une release testée par des joueurs ; un jeu peut en
     demander plus avec `npm run playtests -- --strict --require=N --require-completed=N --require-devices=N`.
4. Ce que montre le rapport devient du travail : un blocage est une énigme à mieux indiquer, une tape manquée une zone
   à élargir, un abandon un endroit à regarder. Les sessions restent : quand le contenu change, elles peuvent ne plus
   se rejouer, et `--strict` dit lesquelles (les réenregistrer ou les supprimer).

Les playtests côté auteur : [Playtests](create.playtests.md).

<a name="sheet"></a>

### La fiche écrite à la main (avant la 4.1.18)

Avant le Field Kit, la fiche d'une release était une copie de
[`docs/dev/passes/TEMPLATE.md`](../../docs/dev/passes/TEMPLATE.md) remplie à la main avant le tag, « not done » laissé
là où rien n'avait été fait, et `scripts/release-notes.mjs` mettait le tableau dans les notes de release avec « n of 7
done ». Le modèle garde ces sept vérifications, et les notes de release les nomment encore quand une release n'a pas
de fiche du tout :

| # | Passe | Comment | À rapporter |
|---|---|---|---|
| 1 | Lecteur d'écran | [SCREEN-READER.md](../../docs/dev/SCREEN-READER.md) : VoiceOver sur iOS ou TalkBack sur Android, une partie de l'écran titre à la première énigme résolue | la ligne de la fiche : appareil, OS, ce qui n'a pas pu être atteint ou n'a pas été lu |
| 2 | Safari hors ligne | [SAFARI-OFFLINE.md](../../docs/dev/SAFARI-OFFLINE.md) : première visite en ligne, mode avion, un lieu jamais visité, un rechargement | la ligne : versions d'iOS et de Safari, l'étape qui a échoué |
| 3 | Un vrai téléphone | la scène la plus lourde (le marché de référence, le jardin de la démo) sur un téléphone milieu de gamme, avec le compteur (`?fps`) | le FPS le plus bas vu (≥ 30 voulu), le téléphone |
| 4 | Testeurs | cinq personnes qui ne connaissent pas les énigmes, chacune sur son téléphone, sans aide | leurs fichiers de session (plus haut), puis `npm run verify:field` |
| 5 | Voix enregistrées | `npm run voices -- check --release` après l'enregistrement : répliques validées sur répliques avec un id | le compte, les répliques restantes |
| 6 | Écoute | chaque partition sur le haut-parleur d'un téléphone et au casque : les stems suivent le jeu, chaque pont une fois, rien de coupé, rien qui continue après le chargement d'une sauvegarde, une voix pendant un pont | la ligne, et chaque défaut avec son lieu et ce qui a été entendu |
| 7 | Tag signé | `git tag -s vX.Y.Z` avec la clé du mainteneur, `git tag -v` le montre | la ligne |

Depuis la 4.1.18, le tableau « People's passes » de la fiche est écrit par `field:report` ; les notes de release ne
comptent comme fait que `passed` (« n of N done »), et comme non fait `not-run`, `blocked`, `failed` (ou l'ancien
« not done »).

<a name="field-kit"></a>

### Le Field Kit : ce que dit un rapport, et ce qui est refusé

Depuis la 4.1.18, une passe est un rapport JSON, plus une ligne éditée à la main : un fichier par passe, lié au
**candidate run** qu'il a essayé (son commit, l'id de son run et le SHA-256 de chaque fichier jugé), dans un dossier
qui garde aussi le `candidate-manifest.json` de ce run.

- **Quatre mots, jamais confondus** : `not-run`, `blocked`, `failed`, `passed`. Seul `passed` compte comme fait dans
  les notes de release, et seul `passed` peut lever le statut `experimental` d'une surface (D18). Une passe est
  rapportée sans bloquer (D12) ; `field:check --require=<id,…>` sert à une gate qui en exige une.
- **Ce que dit une passe essayée** : un opérateur (pseudonyme ou rôle, jamais une identité), son début et sa fin, sur
  quoi (OS, navigateur, appareil ou versions) et le scénario. `passed` liste ses preuves (le SHA-256 de chaque fichier
  est vérifié) et aucun échec ; `failed` dit ce qui a échoué ; `blocked` dit pourquoi dans `notes`.
- **Une preuve est un fichier sous `evidence/`** (16 Mio au plus, 64 Mio pour un rapport ; `field:check` le dit avant
  qu'un bundle soit tenté), lu là où il est : pas un lien, pas hors du dossier une fois résolu, pas une archive (son
  contenu ne peut pas être fouillé), jamais un rapport ni le manifeste.
- **Autre commit, autre passe** : un rapport d'un autre candidate run, ou dont les empreintes ne sont pas celles du
  candidat, ne passe pas la vérification. Un correctif qui change le package rend caducs les rapports qu'il touche
  jusqu'à ce qu'ils soient refaits.

> [!LIMIT id=leak-scan-patterns]
> La recherche de fuites est une barrière d'hygiène faite de motifs, pas une preuve. Le schéma refuse un champ qu'il ne
> nomme pas, et un rapport qui contient une clé, un jeton, une adresse email ou un bearer est refusé ; mais la
> recherche ne voit pas un secret pour lequel elle n'a pas de motif, et dans une image ou un binaire elle ne cherche que
> des clés et des jetons. Relisez ce que vous joignez.

> [!LIMIT id=integrity-not-authenticity]
> `field:check` vérifie l'intégrité, pas l'authenticité : un rapport est vérifié contre le `candidate-manifest.json`
> posé à côté, tel quel. `field:init` le télécharge depuis le run lui-même, mais un dossier dont le manifeste a été
> modifié se vérifie contre cette modification. La gate de la release lit le manifeste du run, jamais celui du dossier.

<a name="bundles"></a>

### Les bundles : ce que porte un ticket de reproduction

```sh
# dans le dépôt du moteur
npm run field:bundle -- --report=<report.json> --out=<bundle.tar.gz>
npm run field:verify-bundle -- <bundle.tar.gz>          # intégrité, puis authenticité sur GitHub
gh attestation trusted-root > trusted-root.jsonl        # une fois, en ligne
npm run field:verify-bundle -- <bundle.tar.gz> --offline --trusted-root=trusted-root.jsonl
```

- Un bundle ne porte que les preuves que son rapport liste : les logs sont expurgés (adresses, bearers, valeurs de mot
  de passe, IP), une clé ou un jeton refuse le bundle, et son `bundle-manifest.json` donne le SHA-256 de chaque
  fichier. Les rapports et les petites preuves expurgées peuvent être commités sous `docs/dev/field/<version>/`
  (`npm run audit` les lit) ; les bundles restent des artefacts de run.
- **Un bundle se suffit à lui-même** (4.1.19, schéma 2) : il porte le rapport, ses preuves, le manifeste du candidat et
  l'attestation de provenance de ce manifeste, que la gate du candidat signe une fois chaque job réussi (`field:init`
  la télécharge à côté du manifeste).
- `field:verify-bundle` lit l'archive lui-même, sous des limites : 16 Mio par fichier, 64 Mio en tout, 256 fichiers,
  64 Mio compressés, une minute (appels à GitHub compris). Un lien, un périphérique, un chemin absolu, un `..` ou un
  nom en double le refuse. Il vérifie ensuite chaque fichier contre le manifeste du bundle et le rapport contre son
  candidat (intégrité), puis dit qui a fait le manifeste (authenticité) : hors ligne, l'attestation contre une racine de
  confiance enregistrée une fois, qui prouve qu'un run de `candidate.yml` sur main l'a signée et nomme ce run ; en
  ligne, la même attestation vérifiée contre la racine de confiance publique, et le run lu à l'instant (un candidat
  vert, lancé à la main sur main). Le bundle d'un candidat plus ancien (sans attestation) se vérifie en ligne contre le
  manifeste que garde le run ; hors ligne, il est dit non vérifié.

<a name="carrying-a-pass"></a>

### Reporter une passe sur un nouveau candidat

Une passe est liée à sa **surface** : les fichiers du candidat qu'elle lit (`docs/dev/surfaces.json`, le
`qualification-surfaces.json` attesté ; le site construit compte fichier par fichier), la configuration qu'elle lit dans
le dépôt, et les passes dont elle dépend (ADR 0024). Quand rien de tout cela n'a changé entre le candidat essayé et un
nouveau, version comprise, la passe peut valoir aussi pour le nouveau :

```sh
# dans le dépôt du moteur
npm run field:init -- --release=4.1.21 --candidate=<new run>   # garde aussi les surfaces et les fichiers du site du nouveau candidat
npm run field:carry -- --from=.cache/field/4.1.20 --to=.cache/field/4.1.21 --pass=safari-ios-offline-update
```

- `field:carry` refuse toute différence pertinente et nomme le fichier. Il n'y a pas de force : on rejoue la passe.
- Sinon, il écrit une attestation `pending` et la copie exacte du rapport source sous
  `docs/dev/passes/carry/<release cible>/` (`--out=<dossier>` pour un autre).
- Le mainteneur la commite et l'approuve (`decision`, `approvedBy`), chaque commit signé avec sa clé : un seul commit
  non signé sur ce chemin laisse le report refusé pour de bon. La racine de confiance est `.github/allowed_signers` tel
  que le commit du candidat **source** (sur la ligne first-parent de main) le porte. `field:carry --check-range=<a..b>`
  refuse une plage qui change à la fois la racine de confiance et une attestation.
- Un report ne remplit qu'une passe non essayée sur le nouveau candidat : il ne couvre jamais un échec fait là.
- `field:check` et `field:report` comptent alors la passe comme `passed` pour le nouveau candidat. Le rapport de la
  personne n'est jamais réécrit : ses quatre statuts restent quatre.
- Un changement du seul README reporte la passe PWA. Un changement du service worker, de l'archive du Bridge ou du
  mixage refuse la passe qui les lit, et la version seule refuse de même les passes PWA, Mystery, reprise de run,
  speedrun et archive.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`field:check` se termine sans erreur sur le dossier ; `docs/dev/passes/<version>.md` montre le tableau avec
« x passed, y failed, z blocked, n not run, of N » ; les notes de release de cette version disent « n of N done ». Sur
GitHub, les issues `field-pass` ouvertes sont les passes encore à faire :
<https://github.com/Quest-n-Click/quest-n-click/issues?q=label%3Afield-pass>.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Le rapport du candidat précédent ne passe pas | Autre commit, autre passe : ses empreintes ne sont pas celles du nouveau candidat | Refaire la passe, ou la reporter (plus haut) si sa surface n'a pas changé |
| `field:check` refuse un rapport qui contient une adresse email ou un jeton | La recherche de fuites | Le retirer du rapport et de ses preuves |
| Une preuve refusée | Un lien, un fichier hors du dossier, une archive, ou plus de 16 Mio | Mettre le fichier lui-même sous `evidence/`, décompressé |
| `field:carry` refuse et nomme un fichier | Un fichier de la surface de la passe a changé | Faire la passe sur le nouveau candidat |
| `npm run verify:field` échoue sur les quotas | Moins de cinq sessions qui se rejouent, trois finies, deux familles d'appareils | Plus de testeurs, ou réenregistrer les sessions que le changement de contenu a cassées |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `.cache/field/<version>/` : les rapports, le manifeste du candidat, son attestation, ses surfaces et les fichiers de
  son site (non commités).
- `docs/dev/passes/<version>.md` : la fiche (commitée).
- `docs/dev/passes/carry/<version>/` : les attestations des passes reportées (commitées, commits signés).
- `games/<id>/playtests/` : les fichiers de session des testeurs (commités).
- `docs/dev/field/<version>/` : des rapports et de petites preuves expurgées, au besoin.

<a name="recovery"></a>

## Revenir en arrière

Un rapport est un fichier : le modifier de nouveau et relancer `field:check`. `field:init --force` réécrit les rapports
à `not-run` (il écrase ce que vous avez rempli). Un report déjà approuvé dans un commit signé se défait par un nouveau
commit qui le retire ; un report avec un seul commit non signé sur son chemin reste refusé.

<a name="references"></a>

## Références

- [`tools/field/field.ts`](../../tools/field/field.ts) (les commandes), [`tools/field/schema.ts`](../../tools/field/schema.ts)
  (ids des passes, statuts, libellés), [`tools/field/bundle.ts`](../../tools/field/bundle.ts),
  [`tools/field/carry.ts`](../../tools/field/carry.ts), [`tools/field/tar.ts`](../../tools/field/tar.ts) (limites).
- [`scripts/release-notes.mjs`](../../scripts/release-notes.mjs) (le compte dans les notes),
  [`docs/dev/passes/`](../../docs/dev/passes/TEMPLATE.md), ADR 0024 (passes reportées), D12, D18.
- [Publier une release](contribute.releasing.md), [Playtests](create.playtests.md).
