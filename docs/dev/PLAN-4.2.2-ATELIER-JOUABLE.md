# web-scumm 4.2.2 : l'atelier jouable (plan détaillé, brouillon)

> **Statut : brouillon, à relire par le mainteneur.** Aucune ligne de code de 4.2.2 avant la fusion de ce plan par le
> mainteneur (méthode du plan maître, §13). Le nom de la release reste à choisir (D40).
>
> **Source normative en amont :** `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`, §6.3 et §8. Ce document détaille ces
> sections ; en cas d'écart, le plan maître l'emporte jusqu'à ce qu'un amendement soit fusionné.
>
> **Prérequis :** 4.2.1 publiée, client compris (la PR 7 attend la validation des maquettes). Rien ici ne suppose
> autre chose que ce que 4.2.1 aura livré.

## 0. Ce que 4.2.2 doit rendre vrai

**Résultat visible** (plan maître §8) : chacun joue la révision commune sans serveur de dev, voit l'état de santé du
jeu à chaque révision, défait ses propres actions, et l'équipe publie des builds figés. Les assets complets
(découpe de planches, `prepare`) fonctionnent en hébergé, si un runtime natif Clever qualifié les porte.

**Ce que 4.2.1 laisse ouvert, et que 4.2.2 ferme :**
- **P4 n'est pas livré** : en 4.2.1, Play et Rooms sont un aperçu vivant (Vite en mode middleware sur `play_url`),
  déclaré non figé. Un import différé ou un asset chargé plus tard peut appartenir à une révision suivante.
- **Vite tourne en production** derrière le ticket de jeu : un risque inscrit au modèle de menaces, que 4.2.2 retire.
- **Undo désactivé** sur un Studio partagé (409).
- **Découpe de planches et `prepare` indisponibles en hébergé** : numpy, Pillow et SciPy sont absents du runtime Node
  natif (spike S, §5), alors que `python3`, `pip` et `ffmpeg` y sont.
- **Pas de sauvegarde ni de restauration** du serveur ; la perte possible en cas de destruction de la base n'est ni
  bornée ni affichée.
- **Le bail exclusif `*`** existe, mais aucune opération ne l'exige encore.

## 1. Garanties, chacune avec sa limite et son test

Format de la maison (`verifiable-guarantees`) : un comportement précis, sa limite déclarée, le test qui le prouve.

| # | Garantie | Limite déclarée | Preuve |
|---|---|---|---|
| G1 | Une prévisualisation `/preview/<rev>/` ne sert que des fichiers produits depuis le snapshot de la révision `rev` ; ses octets ne changent jamais | Le moteur est celui de la version du serveur ; une prévisualisation d'une révision ancienne rejouée après une montée de moteur est marquée « moteur différent » | Test : deux révisions, deux prévisualisations, hash du contenu servi = hash du snapshot ; une écriture ultérieure ne change aucune des deux |
| G2 | Une sauvegarde reprise dans une autre révision que celle où elle a été écrite déclenche l'invite Reprendre / Redémarrer / Rester | La reprise peut échouer si la révision a retiré ce que l'état référence ; l'invite le dit, elle ne répare pas | Test e2e : sauvegarde en r1, chargement en r2, invite affichée, chaque choix suivi |
| G3 | Tout diagnostic (validate, lint, solve, playtests) porte sa révision ; affiché pour une autre révision, il est marqué *périmé* | Un diagnostic peut manquer (job en file, échéance de solve atteinte) : « inconnu », jamais « vert » | Test : écriture pendant un diagnostic → le résultat arrive marqué périmé |
| G4 | La « révision ayant introduit l'échec » est trouvée par bissection sur les snapshots | Sans coupable : deux modifications raisonnables peuvent s'opposer ; on nomme une révision, jamais un auteur | Test : une suite de révisions dont la k-ième casse validate ; la bissection rend k en ⌈log₂ n⌉ jobs |
| G5 | Undo et redo ne défont que les opérations de leur auteur ; 409 si quelqu'un a touché le fichier depuis, 423 si le pan n'est plus tenu | Undo ne traverse pas une opération d'un autre sur le même fichier | Tests de concurrence à deux auteurs |
| G6 | Le manifeste d'un build correspond octet pour octet au snapshot de sa révision (époque, révision, hash de chaque fichier, moteur, commit, lockfile, diagnostics de ce snapshot) | La recompilation fraîche vérifie la reproductibilité, pas l'innocuité du contenu (§3.8) | Test : recompiler, comparer les manifestes ; un fichier altéré dans le snapshot change le manifeste |
| G7 | Une restauration retrouve la révision sauvegardée, puis, par rejeu du journal expédié, la dernière opération expédiée | Le retard d'expédition (RPO) est mesuré et affiché, jamais présenté comme nul | Exercice de restauration en qualification ; test de rejeu |
| G8 | Le serveur de production n'embarque plus Vite en mode dev | — | Test d'installation depuis l'archive : `vite` absent des dépendances d'exécution |

## 2. Les PR, dans l'ordre

| PR | Branche | Dépend de |
|---|---|---|
| A | `docs/422-plan` (ce document) | 4.2.1 |
| 1 | `spike/422-preview` | A |
| 2 | `feature/422-preview` (et ADR 0026) | 1 |
| 3 | `feature/422-health` | A (le snapshot par révision de 2 si disponible, sinon le snapshot du worker de 4.2.1) |
| 4 | `feature/422-undo` | A |
| 5 | `feature/422-builds` | 2 |
| 6 | `feature/422-assets` | A (et une qualification du runtime, §2.6) |
| 7 | `feature/422-backup` | A |
| 8 | `ci/422-gates` | 2 à 7 |
| R | `release/4.2.2` | 8, passes ouvertes |

3, 4, 6 et 7 sont indépendantes et peuvent avancer en parallèle de 1 et 2.

### 2.1 Spike : quelle prévisualisation (PR 1)

Deux voies, mesurées sur le jeu d'exemple (`games/demo`) et sur un jeu avec du code local :
- **(a) un bundle moteur par version, plus un paquet de contenu par révision.** `patchGame`
  (`src/studio/demo-patch.ts`, utilisé par `src/main.ts`) prouve déjà que le joueur sait démarrer un jeu modifié par
  des données. Le paquet de contenu serait produit par le worker depuis le snapshot (données seulement, comme le
  `load` de 4.2.1), le bundle moteur une fois par version du serveur.
- **(b) un build complet par révision**, coalescé (une rafale d'écritures ne déclenche qu'un build, celui de la
  dernière révision).

**Mesures :** temps de l'écriture à la prévisualisation jouable (p50, p95), octets stockés par révision, ce que
chaque voie ne sait pas faire (du code de jeu qui n'est pas des données : commandes, mini-jeux locaux).
**Sortie :** un rapport chiffré (SPIKE-4.2.2-PREVIEW.md, dans docs/dev), la voie retenue, le seuil écrit (cible 5 s,
à confirmer par la mesure). **Décision du mainteneur** si aucune voie ne tient le seuil.

### 2.2 Prévisualisation par révision (PR 2) et ADR 0026

- **Production** par l'exécuteur de 4.2.1 (un job de plus, `preview`), depuis le snapshot immuable de la révision.
  Le Studio accepte le résultat comme pour `validate` : il relit, borne, publie sous une clé qu'il choisit
  (`preview/<époque>/<rev>/…` dans Cellar), jamais une clé nommée par le worker.
- **Service** sur `play_url` à `/preview/<rev>/`, immuable (`Cache-Control: immutable`), derrière la session de jeu
  de 4.2.1. Une révision sans prévisualisation encore : la page dit « en préparation », et sert la dernière prête,
  étiquetée avec sa révision.
- **Rooms** devient un éditeur de prévisualisation, construit avec les outils d'édition comme le build de démo ; le
  protocole `postMessage` de 4.2.1 (origine exacte, schéma fermé, `saved` sollicité par nonce) ne change pas.
- **Vite quitte le serveur de production** : l'aperçu vivant de 4.2.1 disparaît.
- **ADR 0026, sauvegardes face aux révisions :** l'enveloppe reste celle d'aujourd'hui (`SaveEnvelopeV4`,
  `src/engine/core/save.ts`) ; l'empreinte du contenu et la révision s'écrivent à côté de chaque emplacement
  (`SlotMeta`) ; au chargement dans une autre révision, l'invite Reprendre / Redémarrer / Rester. Un ADR n'est jamais
  vide : il est écrit dans cette PR, avec la décision et ses tests.

### 2.3 Santé par révision (PR 3)

- validate, lint, solve (avec `timeLimitMs`, absent aujourd'hui de l'appel du Studio) et playtests deviennent des
  jobs du worker, mis en file par révision, coalescés (seule la dernière révision d'une rafale est jugée en entier).
- Chaque résultat est stocké avec sa révision ; l'interface affiche *périmé* dès que la tête avance.
- **Bissection** : sur demande (ou quand la tête casse ce que la révision précédente passait), jobs sur les
  snapshots intermédiaires jusqu'à la révision fautive ; le résultat nomme la révision, l'opération et ses fichiers.

### 2.4 Undo personnel (PR 4)

- Undo émet l'**opération inverse** d'une opération de son auteur (les effets « avant » sont dans le journal) ;
  redo réapplique. Aucune réécriture d'historique.
- **409** si un autre a écrit l'un des fichiers depuis ; **423** si le pan n'est plus tenu par l'auteur. Le
  brouillon de l'interface reste, comme en 4.2.1.

### 2.5 Builds immuables (PR 5)

- Snapshot à une frontière d'opération, compilation par l'exécuteur (`npm run build:game` sur le snapshot, dans le
  worker), manifeste signé par le Studio, `/play/<n>` sur `play_url`, **dernier build vert** toujours servi.
- **Recompilation fraîche** sur une instance de traitement redéployée, manifestes comparés octet pour octet ; son
  coût (redéploiement, durée) est mesuré avant que le mainteneur décide si elle devient obligatoire pour publier.
- Le build public peut être servi sans authentification **si l'owner le choisit** (décision par instance).

### 2.6 Assets en hébergé (PR 6)

- **Qualification d'abord** : sur l'application de traitement (Node natif), un hook de build installe les versions
  de `requirements.txt` (Pillow, NumPy, SciPy, déjà épinglées) avec un lock à hashes (`pip install --user
  --require-hashes`) ; `ffmpeg` est présent (spike S, §5). On mesure l'installation et un `prepare` complet.
- **Si la qualification réussit** : découpe de planches et `prepare` deviennent des jobs du worker (liste d'arguments
  fixe, limites, annulation, progression en SSE), sous le **bail exclusif `*`** de 4.2.1, leur première utilisation.
- **Sinon** : ils restent indisponibles en hébergé, l'interface le dit, et disponibles en local. **Jamais Docker.**

### 2.7 Sauvegarde, restauration, expédition du journal (PR 7)

- `studio-server backup` et `restore` : la base (registre de complétude, sur le motif de `bridge/src/backup/`) et la
  liste des blobs, modes explicites (motif D36).
- **Expédition continue** : chaque opération confirmée est copiée, de façon asynchrone, dans des segments immuables
  sur Cellar ; une restauration rejoue les segments postérieurs à la sauvegarde.
- **RPO** mesuré, publié dans la santé de l'instance (`/readyz` le donne), cible ≤ 1 min.
- **GC** des blobs orphelins et du staging du worker ; règle de cycle de vie sur le préfixe de staging (cf. la
  deuxième lecture de la PR 9 de 4.2.1).
- Un **exercice de restauration** rejoint la qualification.

### 2.8 Portes (PR 8)

- Jobs CI : prévisualisation, builds, restauration ; passes humaines `studio-preview` (et, selon la PR 6,
  `studio-assets-hosted`) en issues `field-pass`.
- Mutation : les nouveaux modules entrent dans `studio-ops` ou un nouveau set, mesurés puis gated une fois leurs
  survivants lus (comme `studio-ops` et `studio-auth` en 4.2.1).

## 3. Critères de sortie

Ceux du plan maître (§8), plus : G1 à G8 prouvées par leurs tests ; le rapport du spike de prévisualisation fusionné ;
l'ADR 0026 écrit ; les passes `studio-preview` (et `studio-assets-hosted` le cas échéant) ouvertes et signalées.

## 4. Décisions demandées au mainteneur

1. **Le nom** de 4.2.2.
2. **La voie de prévisualisation**, après le spike (a ou b), et le seuil si la cible de 5 s n'est pas tenue.
3. **La recompilation fraîche** : obligatoire pour publier, ou option de l'owner, après la mesure de son coût.
4. **Le RPO cible** (proposé : 1 min) et la fréquence des sauvegardes complètes.
5. **Un build public sans authentification** : permis par instance, ou jamais en 4.2.2.

## 5. Risques

- **La prévisualisation trop lente** pour une rafale d'écritures : coalescence, et la page sert la dernière prête,
  étiquetée.
- **Le contenu qui n'est pas des données** (commandes, mini-jeux locaux) : la voie (a) peut ne pas suffire ; le spike
  le dit avant tout code.
- **Python sur le runtime natif** : la qualification peut échouer (compilation, taille) ; alors les assets restent
  locaux, et c'est déclaré.
- **La file unique** sous la charge des jobs de santé : mesure du p95 complet, comme en 4.2.1 (§11).
