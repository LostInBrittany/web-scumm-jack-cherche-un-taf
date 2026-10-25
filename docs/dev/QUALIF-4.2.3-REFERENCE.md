# Qualification 4.2.3 : le déploiement de référence

> **Statut** : exécuté le 19 octobre 2026, en deux phases. Phase A : déploiement à `52e68932`, mesures des §1 à §4.
> Phase B : montée de version vers le main final (`c66fbf56`), §3 à §6 mesurés de nouveau. Ce qui dit « non mesuré »
> ne l'est pas, et dit pourquoi.
> **Plan** : `docs/dev/PLAN-4.2.3-COORDINATION.md`, H9 et §2.4 (PR 9) ; plan maître
> `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md` §4 (bail de service, redéploiement à chevauchement).
> **Runbook suivi** : `docs/en/STUDIO-SERVER.md`, « Deploying on Clever Cloud », « The OpenID provider », « Running it:
> the reference deployment » ; ses écarts sont corrigés dans la même PR (§7).
> **Où** : l'organisation Clever de test du mainteneur (« Erwan Testing »), région `par`, sur les ressources du spike S
> gardées pour cela (D44). **Quand** : 19 octobre 2026, de 14 h 30 à 19 h 55 UTC.
> **Limite déclarée (H9)** : mesuré sur l'organisation de test, pas sous une charge de production, et les chiffres le
> disent. Chaque chiffre est une mesure, avec sa commande, ou dit qu'il n'en est pas une. Un seul échantillon par
> chiffre, sauf mention.

## 1. Ce qui a été déployé

| Élément | Valeur |
|---|---|
| Version du moteur (commit, tag) | phase A : `52e68932` (branche `ops/423-reference`, PR #178) ; phase B : **`c66fbf56`** (origin/main, avec #176, #178 et #180) ; `package.json` 4.2.2 ; pas de tag |
| Application studio (taille, nombre d'instances) | `web-scumm-spike-studio`, Node.js natif, **XS** (1 vCPU, 1 077 Mo), **1 instance** ; Node **v24.21.0** (`node -v` dans `clever ssh`) |
| Application de traitement (taille) | `web-scumm-spike-worker`, Node.js natif, **XS**, 1 instance ; aucun add-on lié |
| Add-on PostgreSQL (plan, version) | `web-scumm-spike-pg`, plan **DEV** (5 connexions), lié au studio seulement ; version 18 (18.6 mesuré au spike, non relu ici) |
| Cellar (bucket) | add-on `web-scumm-spike-cellar`, plan **S**, lié au studio seulement ; bucket **`web-scumm-ref-studio`** créé pour la référence |
| Fournisseur OIDC (Keycloak managé ou autre) | Keycloak managé, plan **BASE**, version **26.7.4** ; realm `web-scumm` créé par l'API d'administration (`POST /admin/realms`, 201) depuis `ops/studio/keycloak/realm.json` aux URL de Clever : jetons d'accès de 300 s, client `studio` confidentiel PKCE S256 avec déconnexion back-channel, client public `web-scumm-cli` avec device grant et mapper d'audience `studio-api`, deux utilisateurs de test à e-mail vérifié (le mainteneur `owner`, un relecteur) |
| Domaines, TLS (`publicUrl`, `playUrl`, `worker.url`) | `https://web-scumm-studio-spike.cleverapps.io`, `https://web-scumm-play-spike.cleverapps.io`, `https://web-scumm-worker-spike.cleverapps.io` ; TLS des domaines `cleverapps.io` (deux sites distincts : spike S §7) |
| `STUDIO_METRICS_TOKEN`, `STUDIO_BACKUP_CRON` posés | **oui**, **oui** (`1`) |

Déploiements (`clever deploy -a <alias> --force`, phase B avec `-b` sur une branche locale à `c66fbf56`) :

| Application | Phase A (`52e68932`) | Phase B (`c66fbf56`) |
|---|---|---|
| Traitement | « deployed in 0 minutes and 36 seconds » (≈ 48 s de bout en bout), hook pip ≈ 7 s | « 1 minute and 10 seconds » |
| Studio | « 0 minutes and 29 seconds » (≈ 43 s de bout en bout) | « 1 minute and 29 seconds » (avec la migration `0012`) |

- **Import** de `games/demo` par `clever ssh` : révision 1, **242 s** (500 fichiers envoyés à Cellar). Le shell de
  `clever ssh` a les variables de l'application (`STUDIO_*`, `POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_*`,
  `INSTANCE_NUMBER`, `APP_HOME`). En phase A il a fallu `--config <fichier>` (défaut 1 du §7, corrigé par #180).
- **Invitation** du mainteneur comme `owner`, acceptée en phase B par une connexion OIDC scriptée de l'utilisateur de
  test (`/auth/me` → `role: owner`).

## 2. Métriques et alertes

- Collecteur utilisé pour `/metrics` (Prometheus, autre) et sa fréquence : **aucun** ; lu à la main avec `curl` aux
  moments notés. Non posé faute de collecteur sur l'organisation de test.
- `/metrics` sans jeton → **401** (`the metrics need their token`), mauvais jeton → **401**, avec le jeton → **200**
  (`text/plain; version=0.0.4`). Sur l'origine du jeu → **401** : elle refuse toute requête sans session (« open the
  game from the Studio ») avant de lire le chemin ; les métriques n'y sont jamais servies. Le 404 est la réponse de
  l'origine du Studio quand le jeton n'est pas configuré.
- Alertes posées, et vers qui (une personne) : **non posées** (pas de collecteur ; `clever notify-email` non configuré).
  Le runbook met l'alerte `/readyz` à 2 min : avec la passation du bail (#183), `/readyz` reste en 503 12 à 20 s par
  déploiement ; le premier déploiement vers une version qui la porte, ≈ 2 min 30 (§5 et §5 bis).
- Une alerte déclenchée exprès (laquelle, délai jusqu'à la personne) : **non mesuré** (aucune alerte posée).

Valeurs lues sur l'instance de phase B (`c66fbf56`), de son démarrage à 19:55 UTC ; les quantiles des histogrammes sont
des bornes de seau. Côté client, la sonde du §5 a mesuré chaque écriture de bout en bout.

| Mesure (sur la durée de la qualification) | Valeur |
|---|---|
| Latence des opérations du journal, p50 / p95 (`studio_journal_operation_seconds`) | 23 opérations `confirmed` : p50 ≤ 0,5 s, p95 ≤ 10 s, moyenne 1,01 s. Côté client (54 notes écrites pendant la bascule, réseau compris) : p50 **557 ms**, p95 **4,9 s** |
| Profondeur de file maximale observée (`studio_worker_jobs_in_flight`) | 0 à chaque lecture (pas d'échantillonnage continu) |
| Conflits de bail (`studio_lease_conflicts_total`), et pendant quel scénario | 0 (un seul membre écrivait) |
| Durée des jobs par sorte, p50 / p95 (`studio_worker_job_seconds`) | `validate` (20) et `solve` (20) : p50 ≤ 2,5 s, p95 ≤ 10 s ; `preview` (17) : p50 ≤ 10 s, p95 ≤ 30 s ; tous `ok`. Phase A, un échantillon chacun : `validate` 0,86 s, `preview` 2,64 s, `solve` 2,39 s |
| Jobs en échec ou hors délai, par sorte | 0 ; avant l'import, la révision 0 (vide) donnait `health-failed` (« the game does not load »), attendu |

## 3. Sauvegarde planifiée

| Mesure | Valeur |
|---|---|
| La tâche `clevercloud/cron.json` a tourné (date, ligne `"event":"backup"` dans les journaux) | Tâche installée sur le studio (`crontab -l` : `17 3 * * * …/ops/studio/backup-cron.sh`). Le passage de 03:17 UTC **n'a pas pu être observé** (exécution le soir même). Le script lancé à la main par `clever ssh` sur l'instance 0, sans `--config` : sortie 0, ligne `"event":"backup"`, `backups/2026-10-19T19-38-41Z-r63.json` |
| Clé écrite (`backups/<date>-r<rev>.json`), taille | r1 : 170 746 octets ; r2 : 172 008 ; r63 : **253 958** |
| Durée de `backup --to-bucket` | r1 : 2,49 s ; r2 : 5,81 s (`--config`, ancien code) ; r63 par le script : **1,87 s** (démarrage de `tsx` compris) |
| `--keep` : sauvegardes supprimées au deuxième passage | second passage aussitôt avec `STUDIO_BACKUP_KEEP=3` : `removed: ["backups/2026-10-19T17-36-40Z-r1.json"]` (la plus ancienne, seule au-delà de 3) ; 2,07 s |
| Une seule sauvegarde par jour (instance 0), ou deux pendant un redéploiement | **non mesuré** (le passage de 03:17 n'a pas été observé) ; le script vérifie `INSTANCE_NUMBER=0` (valeur lue : `0`) |

Phase A : le script échouait (`backup: a new file is required`, défaut 1 du §7) et une opération écrite par la CLI
n'était pas expédiée (RPO à 190 s jusqu'à un redémarrage, défaut 2). Les deux sont corrigés par #180 et vérifiés ici en
phase B : le script sans `--config`, et le RPO à 0 en moins de 2 s après chaque écriture.

## 4. Exercice de restauration réel

Deux exercices, chacun sur un add-on PostgreSQL neuf (plan DEV), lié à rien, supprimé ensuite ; la production laissée
tranquille. La restauration tourne depuis la machine du mainteneur avec la configuration du studio (dossier de travail
local), les identifiants Cellar et l'URI de l'add-on d'exercice seulement : l'URI de production n'a jamais quitté
l'instance, et la base de production n'a pas été lue (lecture refusée par les permissions de la session). La
comparaison passe par l'API, en membre, comme le runbook le dit désormais.

| Mesure | Phase A (`52e68932`) | Phase B (`c66fbf56`) |
|---|---|---|
| Tête de production notée avant (révision), RPO à cet instant | 1, RPO 0 | **65**, RPO 0 (`/readyz` `rpoMs: 0` 2 s après la seconde écriture) |
| Révision de la sauvegarde restaurée | 1 | **63** (`backups/2026-10-19T19-38-43Z-r63.json`), puis deux notes écrites (64, 65) |
| **Temps de restauration** (`time … restore <fichier> --replay`, de bout en bout) | 28,7 s | **59,7 s** (depuis Paris vers `par`, démarrage de `tsx` compris) |
| Lignes écrites, `dropped`, `stopped` | 508, 0, aucun | **593**, 0, aucun |
| Révision atteinte après rejeu ; égale à la tête de production ? | 1, oui | **65**, oui : les deux écritures après la sauvegarde rejouées depuis `journal/` |
| `studio_files` identiques (chemin, blob) sur les deux bases | 499 lignes, empreinte identique à celle de la sauvegarde | 500 fichiers ; les 65 opérations (révision, identifiant) de `GET /api/ops?after=0` égales à `studio_ops` de l'exercice ; `notes.json` (le fichier écrit après la sauvegarde) : son blob dans l'exercice, relu au bucket, égal à `GET /api/notes` (64 entrées) |
| **RPO observé** : opérations confirmées en production et absentes de la restauration | 0 (aucune écriture après la sauvegarde) | **0** sur 2 écritures après la sauvegarde |

## 5. Montée de version (redéploiement à chevauchement)

Suivi des quatre étapes du runbook : CHANGELOG et migrations lus (la seule nouvelle, `0012`, ajoute la table
`studio_comments` : l'ancienne version ne la lit pas, pas d'arrêt préalable) ; sauvegarde
`backups/2026-10-19T19-31-33Z-r2.json` (révision 2) ; traitement puis studio ; `/readyz`, révision, une écriture.
Pendant toute l'opération, une sonde lisait `/readyz` chaque seconde, écrivait une note toutes les 3 s (un 503 retenté
avec le même `X-Studio-Op` après `Retry-After`) et listait les instances toutes les 5 s ; les journaux des deux
applications étaient gardés.

| Mesure | Valeur |
|---|---|
| Version de départ → version d'arrivée | `52e68932` → **`c66fbf56`** (traitement 19:32:02–19:33:27, studio 19:33:34–19:35:21 UTC) |
| Chevauchement observé (les deux instances vivantes, combien de temps) | Studio : nouvelle instance `BOOTING` à 19:33:48, à l'écoute à **19:34:52** ; l'ancienne `UP` jusqu'à 19:35:23, puis `STOPPING` jusque vers **19:37:23** : ≈ 3 min 35 s à deux. Traitement : ≈ 1 min 20 s (19:32:15–19:33:28 à deux, l'ancienne `STOPPING` jusque vers 19:35:30) |
| Délai de bascule du bail de service (`lease-taken` de la nouvelle instance) | `lease-taken` à **19:37:49**, soit **2 min 57 s** après l'écoute, et ≈ 26 s après le départ de l'ancienne : celle-ci a renouvelé le bail pendant tout son `STOPPING` |
| Écritures refusées en 503 pendant la bascule, puis rejouées avec le même identifiant | **503 avec `Retry-After: 2` de 19:35:24 à 19:37:47 (2 min 23 s)**, une écriture retentée 70 fois avec le même identifiant, appliquée **une fois** à 19:37:49 (révision 53) ; `/readyz` à 503 (`writes: waiting`) sur le même intervalle. Avant, pendant le démarrage de la nouvelle instance : une écriture servie par l'ancienne a attendu **20 s** puis reçu un **409** (« another process is writing this game », la vérification du journal par l'instance qui démarre), puis un **500** au réessai (« too many connections for role … » : deux instances sur les 5 connexions du plan DEV), puis 200 au troisième essai, appliquée une fois. Aucun doublon parmi les 61 notes relues |
| Révision inchangée, une écriture après bascule | Révision continue : 52 avant la bascule, 53 pour la première écriture après ; écritures suivantes en 164 à 600 ms |
| SIGTERM reçu par l'ancienne instance (ligne `stopping`) | **Aucune ligne `stopping`**, comme au spike S et au redémarrage de la phase A (bail pris 2 min 37 s après l'écoute) |

### 5 bis. La passation du bail (#183), mesurée

Après #183 (sur un déploiement, l'instance qui attend demande le bail et le détenteur le rend à son renouvellement
suivant, 10 s ; l'attente du verrou du journal devient un 503 ; seul le détenteur répare son dossier). Studio seul, depuis
origin/main **`dd66b38d`** ; même sonde qu'au §5 (`/readyz` chaque seconde, une note toutes les 3 s retentée sur 503 avec
le même `X-Studio-Op`, les instances toutes les 5 s), journaux gardés. Trois déploiements de suite, le 19 octobre
entre 21:12 et 21:24 UTC.

| Mesure | Déploiement 1 : `c66fbf56` → `dd66b38d` | Déploiement 2 : `clever restart` (`dd66b38d`) | Déploiement 3 : `clever restart` (`dd66b38d`) |
|---|---|---|---|
| Écoute de la nouvelle → `lease-taken` | 21:13:53 → 21:16:26 : **2 min 33 s** (l'ancienne, `c66fbf56`, ne sait pas rendre le bail : attendu) | 21:17:30,170 → 21:17:36,192 : **6,0 s** | 21:21:06,564 → 21:21:16,647 : **10,1 s** |
| `lease-lost` de l'ancienne | non (ancienne version) | **oui**, 21:17:36,159, 33 ms avant `lease-taken` | **oui**, 21:21:16,302, 345 ms avant |
| Fenêtre de 503 sur les écritures | 21:13:57 → 21:16:24 (**2 min 27 s**), `Retry-After: 2` | 21:17:38 → 21:17:54 (**16 s**) : Clever envoie encore les requêtes à l'ancienne, qui n'a plus le bail, jusqu'à la fin du déploiement (21:17:55) | 21:21:19 → 21:21:29 (**10 s**), même cause |
| `/readyz` à 503 | 21:13:56 → 21:16:26 | 21:17:36 → 21:17:56 (20 s) | 21:21:19 → 21:21:31 (12 s) |
| Pendant le démarrage de la nouvelle (avant l'écoute) | une écriture servie par l'ancienne : **409** deux fois après 10 s (« another process is writing this game », ancien code), puis **500** « too many connections » | une écriture : **503** (`Retry-After: 2`) après 10,2 s d'attente du verrou du journal, puis 200 au réessai après 27,0 s | une écriture : **503** après 19,4 s, puis 200 au réessai après 15,2 s |
| 409 ou 500 sur les écritures | 2 × 409, 1 × 500 | **aucun** | **aucun** |
| Écritures appliquées une fois | oui (aucun identifiant d'opération appliqué deux fois sur 116 écritures confirmées) | oui | oui |

En somme, entre deux versions qui portent la passation : ≈ 1 min d'écritures lentes ou refusées par déploiement (une
attente de 10 à 20 s du verrou du journal pendant le démarrage, puis 10 à 16 s de 503 après la passation), aucune perdue,
aucun 409 ni 500 sur les écritures. Le premier déploiement depuis une version sans la passation cale comme avant
(2 min 27 s). Pendant les deux redémarrages, le travail de fond des instances a encore heurté la limite du plan DEV
(`leases-read-failed`, `reconcile-failed`, `ship-failed` : « too many connections ») et la vérification du journal
(`health-failed`, `preview-failed` : « another process is writing this game »), repris ensuite.

**Défaut trouvé au déploiement 3** : à partir de 21:21:18, le traitement refuse une partie des jobs du Studio en **403**
(`health-failed` / `preview-failed` : « the processing worker refused the job (403) »), et cela continue avec une seule
instance du studio (encore à 21:24). Mesure depuis la machine virtuelle du studio, avec sa propre clé : 20 jobs signés
avec `exp = maintenant + MAX_JOB_MS` et un `dest` invalide exprès (aucun ne peut tourner) : **10 refusés « the job has
expired »**, 10 passés au-delà de ce contrôle. Le Studio fixe `exp` à exactement `Date.now() + MAX_JOB_MS`
(`remote-executor.ts`), et le traitement refuse `exp - now > MAX_JOB_MS` sans marge (`worker/job.ts`) : dès que
l'horloge de la machine du studio avance sur celle du traitement de plus que la latence de la requête (quelques dizaines
de millisecondes), le job est refusé. Les machines précédentes ne le montraient pas ; celle-ci, si. Le contrôle est le même
à `c66fbf56` et à `dd66b38d` ; corrigé en 4.2.3 par #192 : 30 s de marge (`CLOCK_SKEW_MS`), refus consigné (`worker-job-refused`), raison dans l'erreur du Studio (§7).

## 6. Prévisualisation et recompilation

| Mesure | Valeur |
|---|---|
| **p95 de la prévisualisation** (`studio_preview_build_seconds`, sur combien de révisions) | Dix notes à 40 s d'intervalle (révisions 66 à 75), lignes `"event":"preview"` : p50 **34,1 s**, p95 (rang 10/10) **43,8 s**, de 15,9 à 43,8 s. Sur les 20 prévisualisations du jour : p50 32,6 s, p95 49,9 s, max 61,2 s. Le job `preview` du traitement n'en prend qu'une part (5,9 s en moyenne sur 5) |
| Seuil de prévisualisation : la cadence de modifications au-delà de laquelle la file s'allonge (méthode, résultat) | Une prévisualisation à la fois, ≈ 35 s chacune. À une écriture toutes les 3 s, 13 opérations n'ont donné que 5 prévisualisations : les révisions intermédiaires sont sautées et `studio_worker_jobs_in_flight` est resté à 0. Le seuil où chaque révision a la sienne est donc ≈ **une modification toutes les 35 s** ; au-delà, la file ne s'allonge pas, elle saute des révisions. Pendant le chevauchement, les deux instances ont construit la révision 43 chacune |
| **Coût d'une recompilation fraîche** (`POST /api/builds/<n>/rebuild` : durée, octets identiques ?) | Build `#1` publié (révision 75) en **30,7 s** ; recompilation fraîche en **44,3 s**, `same: true`, `differ: []` : octets identiques |

> **Note 4.4.0.** Ces chiffres sont ceux de 4.2.3. `ms` (et `studio_preview_build_seconds`) commençait après
> l'instantané, et comprenait l'attente du job derrière le validateur et le solveur de la santé sur l'application de
> traitement (un job à la fois) ainsi que les fichiers stockés un par un. 4.4.0 découpe ce temps par phase (`queuedMs`,
> `snapMs`, `jobMs`, `storeMs`, `sinceWriteMs` ; côté traitement `queueMs`, `fetchMs`, `unpackMs`, `childMs`, `putMs`)
> puis donne à la prévisualisation sa propre file, stocke ses fichiers 8 à la fois et n'empaquette qu'un instantané
> par révision : on attend un temps de l'écriture à la prévisualisation prête proche du job lui-même (≈ 6 s) plus
> l'instantané et le stockage.
>
> **Mesures de 4.4.0** (22 octobre 2026, même déploiement de référence, même méthode : dix notes à 40 s d'intervalle,
> lignes `"event":"preview"`) : d'abord la version instrumentée seule (`a3294282`, révisions 436 à 445), puis la
> version optimisée (`b9336a4d`, révisions 446 à 455).
>
> | De l'écriture à la prévisualisation prête (`sinceWriteMs`) | Instrumentée | Optimisée |
> |---|---|---|
> | médiane | 17,8 s | **5,6 s** |
> | max (rang 10/10) | 26,0 s | **11,7 s** |
> | stockage des fichiers (`storeMs`) | 7,4 à 21,5 s | 0,3 à 7,4 s |
> | job du traitement (`jobMs`) | 1,4 à 6,4 s | 2,7 à 7,6 s |
> | instantané (`snapMs`) | ≈ 40 ms | ≈ 20 ms |
> | attente (`queuedMs`) | 0 | 0 |
>
> Ce jour-là, la santé n'a pas retardé la prévisualisation (`queuedMs` à 0 dans les deux séries) : le gain vient des
> fichiers stockés 8 à la fois. Le job lui-même reste la part principale ; il reconstruit le moteur à froid à chaque
> révision (pistes : un enfant précompilé, des modules du moteur construits une fois). Dix révisions par série :
> l'ordre de grandeur, pas une distribution.

## 7. Ce qui n'a pas pu être fait, et ce que l'exécution a trouvé

Défauts du serveur trouvés en phase A, **corrigés par #180** et vérifiés en phase B :

1. Sans `--config`, le premier argument était perdu (`rest.filter` avec `at = -1`) : `import <dossier>`, `invite`, et
   `backup --to-bucket` du script quotidien échouaient. Le script tourne désormais sans `--config` (§3).
2. Une opération écrite hors de l'instance n'était expédiée qu'au redémarrage suivant. Phase B : RPO à 0 en moins de
   2 s après chaque écriture ; l'import n'a pas été refait.

Constats de la phase B, pas des défauts du code mais des coûts à connaître (écrits dans le runbook) :

3. **Un déploiement refuse les écritures ≈ 2 min 30.** L'ancienne instance reste `STOPPING` ≈ 2 min sans consigner de
   `stopping` et garde le bail ; la nouvelle le prend ≈ 30 s après. Les écritures retentées avec leur identifiant passent
   une fois ensuite. Réduire ce délai demanderait que l'ancienne rende le bail quand Clever l'arrête : le signal n'est
   pas observé.
4. **Le plan DEV ne suffit pas au chevauchement** : deux instances dépassent ses 5 connexions (un 500), et la
   vérification du journal au démarrage fait attendre une écriture de l'ancienne 20 s puis la refuse en 409, sans
   `Retry-After`. Un client qui ne retente pas un 409 perd cette écriture.

Trouvé à la mesure de la passation (§5 bis), corrigé par #192 :

5. **Le traitement refuse des jobs pour un décalage d'horloge de quelques millisecondes** : `exp` vaut exactement
   `Date.now() + MAX_JOB_MS` côté Studio et le traitement refusait `exp - now > MAX_JOB_MS` sans marge ; quand l'horloge
   du Studio avance un peu sur celle du traitement, la moitié des jobs étaient refusés (403 « the job has expired »), la
   santé et les prévisualisations échouaient par intermittence. Le traitement ne consignait pas la raison d'un 403, ni le
   Studio le corps de la réponse : seule une sonde l'a montrée. Corrigé (#192) : 30 s de marge (`CLOCK_SKEW_MS`), le
   traitement consigne `worker-job-refused` avec sa raison, et le Studio la reprend dans son erreur (200 caractères au
   plus).
6. Avec la passation, le constat 3 vaut pour le premier déploiement depuis une version qui ne la porte pas ; ensuite,
   ≈ 1 min d'écritures lentes ou refusées, dont 10 à 16 s de 503 (Clever route encore vers l'ancienne). Le 409 du
   constat 4 est devenu un 503 avec `Retry-After`.

Écarts du runbook corrigés dans la PR 9b (`docs/en/STUDIO-SERVER.md`, `docs/fr/STUDIO-SERVER.md`) : la création du realm
sur le Keycloak managé (mot de passe administrateur temporaire, `admin-cli` refusé, import du realm), les valeurs
locales de `realm.json`, `APP_FOLDER`, `--` avant une clé PEM dans `clever env set`, `clever link` puis `deploy
--alias`, `clever logs` qui suit sans fin, `/metrics` à 401 sur l'origine du jeu, `clever ssh --command` refusé tant que
l'ancienne instance est `STOPPING`, le coût d'un redéploiement et l'alerte `/readyz` à 5 min, l'exercice comparé par
l'API.

Non faits :
- collecteur, alertes vers une personne, alerte déclenchée exprès (§2) : pas de collecteur sur l'organisation de test ;
- le passage de 03:17 UTC du cron et l'unicité de la sauvegarde quotidienne (§3) : à observer un matin suivant ;
- la lecture de la base de production pour l'exercice (§4) : refusée par les permissions de la session, remplacée par
  la comparaison par l'API ;
- l'option « traitement sans réseau sortant » : non essayée dans cette exécution (rien n'a été cherché du côté des
  réglages réseau de Clever) ;
- OpenTelemetry : hors de 4.2.3.

## 8. Conclusion

Sur deux applications XS, un PostgreSQL DEV, un Cellar S et un Keycloak managé BASE, le Studio Server se déploie
depuis le dépôt en moins d'une minute et demie par application, se sauvegarde dans son bucket en 2 s et se restaure
sur une base neuve en 30 à 60 s, avec le rejeu du journal jusqu'à la tête de production : RPO observé nul sur deux
écritures. La montée de version par redéploiement à chevauchement ne perd ni ne double aucune écriture, mais refuse les
écritures ≈ 2 min 30 à chaque déploiement, et le plan DEV y produit un 500 et un 409 : un déploiement dont on se sert
prend un plan PostgreSQL plus grand et prévient ses membres. Avec la passation du bail (#183, `dd66b38d`), un
redéploiement passe le bail en 6 à 10 s et ne refuse plus les écritures que 10 à 16 s, sans 409 ni 500, sauf le
premier déploiement depuis une version qui ne la porte pas ; la même mesure a montré des jobs refusés par le traitement
pour un décalage d'horloge sans marge (§5 bis), corrigé par #192 avant la release. Une prévisualisation prend ≈ 35 s (p95 ≈ 44 à 50 s) et
saute les révisions au-delà d'une modification toutes les 35 s ; une recompilation fraîche rend les mêmes octets en
44 s. Limite : organisation de test, un seul membre qui écrit, peu d'échantillons, pas de charge de production.
