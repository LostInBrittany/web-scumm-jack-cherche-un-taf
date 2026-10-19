# web-scumm 4.2.3 : la coordination (plan détaillé, brouillon)

> **Statut : fusionné à la demande du mainteneur** (« Merge #164 for me, as is », 19 octobre). Les réponses du §4 sont
> consignées dans D44 : le nom « Coordination », GitLab pour `studio-oidc-generic`, une clé de déploiement, les captures
> du diff en local seulement, les ressources du spike gardées. Le oui pour signer `v4.2.3` est donné (« Yes, sign
> v4.2.3 », D37, D44), pour son propre candidat.
>
> **Source normative en amont :** `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`, §9 et §10. Ce document détaille ces
> sections et y ajoute ce que 4.2.2 a laissé ouvert (LOG #217). Ses écarts au plan maître sont listés au §6 ; **fusionner
> ce plan vaut amendement du §9 du plan maître** pour ces écarts. Ailleurs, le plan maître l'emporte.
>
> **Prérequis :** 4.2.2 « Playable Workshop » publiée. Rien ici ne suppose autre chose que ce que 4.2.2 a livré.

## 0. Ce que 4.2.3 doit rendre vrai

**Résultat visible** (plan maître §9) : l'équipe s'organise dans le Studio (carte du scénario, commentaires ancrés,
diff lisible) ; des agents IA travaillent à distance par MCP sur le Studio hébergé ; le jeu part sur GitHub ; le
déploiement Clever Cloud de référence est exécuté et documenté. C'est la dernière étape de la ligne 4.2.x du Studio
Server (D40).

**Ce que 4.2.2 laisse ouvert** (LOG #217, SUPPORT « 4.2.2 »), et ce que 4.2.3 en fait :

| Laissé ouvert | En 4.2.3 |
|---|---|
| Un worker installé depuis les archives ne peut pas lancer `prepare` (le verrou n'est pas dans l'archive, `PYTHONPATH` suit le dossier du moteur) | Fermé : H7, PR 0 |
| Découpe de planches et uploads locaux (D43) ; `prepare` sans progression ni annulation | Fermé : H8, PR 7 |
| Les éditeurs n'envoient pas la révision qu'ils ont lue (la base de P5) ; une écriture refusée garde son brouillon sans diff à fusionner | Fermé : H10, PR 1 (H2 et H3 en dépendent) |
| L'exercice de restauration n'a tourné qu'en CI ; le seuil de la prévisualisation n'est mesuré qu'en local ; le coût de la recompilation fraîche n'est pas mesuré | Fermé : H9, PR 9 |
| Les survivants du set `studio-workshop` ne sont pas encore lus | Fermé : PR 10 |
| La santé juge le validateur et le solveur, ni le lint ni les playtests | **Reste ouvert**, dit au §5 |
| L'Assistant n'est pas sur un Studio hébergé | **Reste ouvert**, dit au §5 |
| Une sauvegarde est une entrée de confiance (elle peut ajouter des propriétaires) | **Reste ouvert**, dit au §5 |

## 1. Garanties, chacune avec sa limite et son test

Format de la maison (`verifiable-guarantees`) : un comportement précis, sa limite déclarée, le test qui le prouve.

| # | Garantie | Limite déclarée | Preuve |
|---|---|---|---|
| H1 | Un regroupement (personnage, énigme, chapitre) vit dans `games/<id>/groupings.json`, un pan à lui (P2) ; il ne fait que **référencer** des ids stables et n'écrit jamais l'élément qu'il nomme. La carte du scénario n'est jamais stockée : elle se dérive des ids, de la provenance IR et des regroupements | La carte décrit ce que le contenu déclare ; un lien implicite (une condition calculée) peut manquer, et la carte le dit « non déclaré » | Tests : supprimer un regroupement laisse le hash de chaque fichier de contenu inchangé ; deux dérivations de la même révision donnent les mêmes octets |
| H2 | Un commentaire est ancré sur un id stable et la révision où il a été écrit ; un reviewer peut commenter sans pouvoir écrire le jeu. Les notes de `notes.json` deviennent des commentaires ; `ids --lines` devient une opération exclusive | Un commentaire dont l'id a disparu reste lisible, marqué « orphelin » ; il n'est jamais rattaché ailleurs | Tests : reviewer qui commente (201) puis écrit (403) ; id supprimé → orphelin ; chaque note devient un commentaire, aucune perdue |
| H3 | Le diff entre deux révisions (ou deux builds) est **sémantique** : il nomme les ids ajoutés, retirés, changés, avec les champs | Un fichier sans ids (code, asset binaire) est montré « fichier changé », sans champs. Les captures avant/après n'existent que si Chromium est qualifié sur le worker (§4, question 4) ; sinon elles sont dites indisponibles en hébergé | Test : une suite d'opérations connue → le diff attendu, champ par champ, et « fichier changé » pour un `.ts` |
| H4 | Le MCP distant (Streamable HTTP) applique **les mêmes contrôles que l'API** (politique B : jeton OIDC, audience, membre au moment de la requête, révocation R) ; il s'annonce comme ressource protégée (RFC 9728). ADR 0029 | Un client MCP qui ne suit pas la découverte d'autorisation reste sur le MCP local en stdio | Tests : jeton d'une autre audience → 401 ; le même refus que l'API pour un membre retiré (403 non-membre) ou révoqué (401) ; un outil MCP qui écrit passe par le garde et les pans |
| H5 | Un push Git est un **lot de révisions** confirmées, un commit par lot, avec un `Co-authored-by` par auteur (l'email vérifié par le fournisseur, sinon une adresse `noreply` de l'instance). Un import depuis Git arrive en mode exclusif, en une révision | Le push ne réécrit jamais l'historique distant : un dépôt qui a divergé est refusé, jamais forcé. Le secret (clé ou GitHub App) vient d'un fichier `0600` en local, de l'environnement sur Clever (l'exception d'ADR 0027) | Tests sur un dépôt nu local : deux lots, une divergence refusée ; un import → une révision, sous le bail exclusif |
| H6 | La montée de version du moteur pour le jeu hébergé (`web-scumm migrate`) est une **opération exclusive**, vérifiée par validate et solve, annulable par restauration. Dans la ligne 4.2.x le format est gelé (D40) : elle sert à un jeu importé d'une 4.1.x | Une migration qui casse un jeu est refusée avant d'être confirmée ; ce qu'un auteur aurait fait pendant le bail exclusif attend | Tests sur un jeu au format d'une 4.1.x (une fixture à créer, à côté de `tests/fixtures/formats/`) : un jeu qui ne migre pas → refus, tête intacte ; un jeu qui migre → une révision, santé verte ; restauration après migration → la tête et la santé d'avant |
| H7 | Un worker installé **depuis les archives** prépare les assets : le verrou est dans l'archive du moteur (là où vit `prepare.ts`), et `PYTHONPATH` vient de la variable `WORKER_PYTHON_PATH`, par défaut `.python` dans le dossier courant de l'application ; le hook devient `-r node_modules/web-scumm/ops/studio/worker-requirements.lock` | Le verrou ne vaut que pour CPython 3.13, Linux x86_64, glibc ≥ 2.28 (le runtime natif Clever) ; une autre plateforme refait le verrou | Test d'installation depuis l'archive, sous Python 3.13 (`--require-hashes --only-binary=:all:`) : le verrou présent, son empreinte égale à celle du dépôt, ses paquets installés et importés depuis le dossier du worker ; le `prepare` réel depuis les archives est la passe `studio-assets-hosted` (#167) |
| H8 | La découpe de planches et les uploads tournent en hébergé, comme `prepare` : sur le worker, sous le bail exclusif, sortie bornée, **progression en SSE et annulation** (aussi pour `prepare`) | Un upload est borné en taille et en type ; une découpe annulée ne laisse aucune opération | Tests : annulation en cours de job → aucune révision ; upload hors bornes → 413 ou 415 |
| H9 | Le déploiement de référence est **exécuté** sur Clever Cloud : runbook, métriques (latence des opérations, profondeur de file, conflits de bail, durée des jobs ; OpenTelemetry en option), alertes, sauvegardes planifiées, **exercice de restauration réel**, procédure de montée de version (redéploiement à chevauchement, plan maître §4), seuil de prévisualisation et coût de la recompilation mesurés | Mesuré sur l'organisation de test, pas sous une charge de production, et les chiffres le disent. L'option « traitement sans réseau sortant » n'est livrée que si le runtime le permet, sinon elle est dite indisponible | Rapport de qualification `docs/dev/QUALIF-4.2.3-REFERENCE.md` : temps de restauration, RPO observé, p95 de la prévisualisation ; passe `studio-hosted` |
| H10 | Une écriture porte la **révision lue** par son éditeur ; si un fichier a changé depuis, la réponse 409 donne le diff entre la révision lue et la tête, et l'éditeur propose de fusionner | La fusion est proposée, jamais faite à la place de la personne ; un fichier sans ids montre un diff textuel | Tests : deux éditeurs sur le même fichier, l'un en retard → 409 avec le diff, puis une fusion confirmée en une révision |

## 2. Les PR, dans l'ordre

| PR | Branche | Contenu | Dépend de |
|---|---|---|---|
| A | `docs/423-plan` | Ce document, réservations (ADR 0029 : MCP distant ; D44 : choix de 4.2.3) | 4.2.2 |
| 0 | `fix/423-archive-prepare` | H7 | A |
| 1 | `feature/423-base` | H10 : la révision lue, le 409 avec diff, la fusion | A |
| 2 | `feature/423-map` | H1 | A |
| 3 | `feature/423-comments` | H2 | 1 |
| 4 | `feature/423-diff` | H3 | 1 |
| 5 | `feature/423-mcp-remote` | H4, ADR 0029 ; `docs/en|fr/MCP.md` (le MCP distant) | A |
| 6 | `feature/423-git` | H5 | A |
| 7 | `feature/423-assets-hosted` | H8 | 0 |
| 8 | `feature/423-engine-upgrade` | H6 | A |
| 9 | `ops/423-reference` | H9 ; STUDIO-SERVER : le runbook, un fournisseur OIDC générique (plan maître §10) | 0 |
| 10 | `test/423-workshop-mutants` | Survivants de `studio-workshop` lus (tués ou nommés dans `docs/dev/mutants.json`), set passé en `GATED` | A |
| 11 | `ci/423-gates` | Jobs et passes `studio-mcp-remote`, `studio-oidc-generic` (un second fournisseur OIDC, vérifié par une personne) | 1 à 10 |
| R | `release/4.2.3` | Comme 4.2.2 ; le oui de signature de `v4.2.3` consigné | 11, passes ouvertes |

2, 5, 6, 8 et 10 sont indépendantes. 0 passe en premier : elle rend la passe `studio-assets-hosted` faisable depuis
les archives (elle l'est déjà avec un worker déployé depuis le dépôt).

### 2.1 La base de P5 (PR 1)

Chaque éditeur garde la révision de ce qu'il a lu et l'envoie avec son écriture (`x-studio-base`). Le garde compare,
fichier par fichier, la base et la tête : un fichier changé depuis donne un 409 avec le diff (H3 sert ici en premier,
sur les fichiers de contenu). L'éditeur montre les deux versions et propose une fusion ; la fusion est une nouvelle
écriture, sur la tête.

### 2.2 Le MCP distant (PR 5, ADR 0029)

Le serveur expose `/mcp` en Streamable HTTP et publie ses Protected Resource Metadata (RFC 9728) : le fournisseur
OIDC reste l'autorité, avec l'audience propre au MCP. Chaque outil appelle les mêmes opérations que l'API, avec le
même garde, les mêmes pans et le même journal. L'ADR dit le modèle de menaces (un agent qui écrit au nom d'un membre,
ses limites de débit, le refus quand le membre est retiré).

### 2.3 Git (PR 6)

L'export pousse un commit par lot de révisions (un lot : les révisions confirmées depuis le dernier push, ou un lot
demandé par un owner), avec leurs auteurs en `Co-authored-by`. L'import lit un dépôt à une révision donnée et l'adopte
sous le bail exclusif, comme `studio-server import`. La question 3 du §4 choisit entre clé de déploiement et GitHub
App.

### 2.4 Le déploiement de référence (PR 9)

Sur l'organisation Clever de test : les deux applications, l'add-on PostgreSQL, Cellar, Keycloak ; un domaine et TLS ;
les métriques et les alertes (vers une personne) ; une sauvegarde planifiée chaque jour ; un exercice de restauration
réel (une base neuve, `restore --replay`, la tête retrouvée, le temps mesuré) ; une montée de version par redéploiement
à chevauchement. Le rapport donne les chiffres et ce qui n'a pas pu être fait.

## 3. Critères de sortie

Le plan maître §9 ne donne que son résultat visible ; 4.2.3 sort quand :
- H1 à H10 sont prouvées par leurs tests ;
- le rapport de qualification du déploiement de référence est fusionné, avec l'exercice de restauration réel ;
- `studio-workshop` est gated ;
- STUDIO-SERVER (fournisseur OIDC générique, runbook) et MCP (MCP distant) sont écrits, en et fr ;
- les passes `studio-mcp-remote` et `studio-oidc-generic` sont ouvertes et signalées ;
- SUPPORT dit, surface par surface, ce qui reste expérimental à la fin de la ligne 4.2.x, et ce qui reste ouvert (§5).

## 4. Décisions demandées au mainteneur

1. **Le nom** de 4.2.3.
2. **Le second fournisseur OIDC** de la passe `studio-oidc-generic` (GitLab, Authentik, ou un autre).
3. **Le push Git** : clé de déploiement (un dépôt) ou GitHub App (plusieurs dépôts, plus de configuration).
4. **Les captures du diff en hébergé** : qualifier Chromium sur le worker (présent sur le runtime, spike S ; Playwright
   pas encore mesuré dessus) ou les garder locales.
5. **Le oui pour signer `v4.2.3`** (D37), donné quand la release existe.
6. **Les ressources Clever du spike**, gardées aujourd'hui (« keep spike resources », pour #149) : servent-elles au
   déploiement de référence, et que deviennent-elles après la release ?

## 5. Ce qui reste ouvert après 4.2.3, et pourquoi

- **La santé avec le lint et les playtests** : ils chargent la file unique du worker à chaque rafale ; on les ajoute
  quand la mesure de H9 dit que la file le tient.
- **L'Assistant sur un Studio hébergé** : la clé apportée par chaque utilisateur (BYOK, D41) demande son propre modèle
  de menaces (où vit la clé, qui la voit) ; c'est un chantier à lui.
- **Une sauvegarde signée** : aujourd'hui son condensé dit qu'elle est entière, pas qui l'a faite. La signer demande
  une clé hors de l'instance ; à décider avec la rotation des clés (D37).

## 6. Écarts au plan maître (§9)

- Ajoutées : PR 0 (le worker depuis les archives), PR 1 (la base de P5, qui était un reste de 4.2.1), PR 7 (les
  assets en hébergé, reportés par D43), PR 10 (les survivants de `studio-workshop`).
- Renumérotées : la carte, les commentaires, le diff, le MCP, Git et la montée de moteur passent de 1–6 à 2–8 ; le
  déploiement de référence de 7 à 9 ; les portes de 8 à 11.
- Le seuil de prévisualisation et le coût de la recompilation, demandés en 4.2.2, entrent dans le déploiement de
  référence (H9).

## 7. Risques

- **Le périmètre** : dix garanties pour une release. Si la ligne doit rester courte, la carte et les commentaires
  (PR 2, 3) ou Git (PR 6) peuvent sortir de la ligne 4.2.x, vers une 4.3, par décision du mainteneur et amendement,
  jamais en silence.
- **Le MCP distant** dépend de clients qui suivent la spécification d'autorisation : sans eux, H4 est prouvée par
  tests mais peu utilisée.
- **Chromium sur le worker** : taille, mémoire, sandbox ; sans qualification, les captures restent locales.
- **Le déploiement de référence** coûte de l'argent réel (le Keycloak managé, plan `base`, et les add-ons ; le prix
  est relevé dans le rapport, à la date de la mesure) et demande des actions humaines (domaine, TLS, alertes vers une
  personne).
