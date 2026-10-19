# Spike S (4.2.1) : le runtime Node.js natif de Clever Cloud, mesuré

> **Date** : 17 octobre 2026.
> **Plan** : `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`, révision 4, §7 (ligne S).
> **Code** : `ops/spike-421/`, jetable, sur la branche locale `spike/421-clever-runtime` : il n'entre pas dans le dépôt
> et part avec les ressources Clever à la fin du spike.
> **Ressources** : organisation de test du mainteneur, région `par`.
> - Deux applications Node.js natives : `web-scumm-spike-studio`, et `web-scumm-spike-worker`.
> - PostgreSQL, plan `dev`.
> - Cellar, plan `S`.
> - Keycloak managé, plan `base`, version 26.8.
> - Domaines `web-scumm-{studio,play,worker}-spike.cleverapps.io`.
>
> Chaque ligne ci-dessous est une **mesure** : la commande ou la sonde, puis le résultat obtenu. Ce qui n'a pas pu être
> mesuré le dit.

## 1. Runtime

| Question | Mesure | Résultat |
|---|---|---|
| Version de Node | `engines.node: "22"`, sonde `/probe/runtime` | **v22.23.3**, linux x64, 1 vCPU, ≈ 1 Go (plus petite taille) |
| Build et démarrage | `APP_FOLDER=ops/spike-421/studio`, `npm install`, `npm start` | Déploiement en 15 à 24 s ; `npm install` sur le `package.json` du sous-dossier |
| Utilisateur système | `/probe/runtime` | Un seul : `bas` (uid 1000). **Pas de second utilisateur** disponible pour séparer superviseur et exécution |
| Disque | marqueur écrit, puis `clever restart` | **Éphémère** : le marqueur a disparu (nouvelle machine virtuelle). 12 Go libres dans le dossier de l'app, 535 Mo dans `/tmp` |
| Variables d'environnement | `/probe/runtime` (noms seulement) | Les identifiants des add-ons liés arrivent **en variables** (`POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_KEY_SECRET`…). La dérogation de l'ADR 0027 est confirmée nécessaire |
| `/proc` du parent | `existsSync('/proc/<ppid>/environ')` | **Lisible** : un enfant du même utilisateur peut lire l'environnement de son parent. Le risque du §3.8 est confirmé tel quel |

## 2. Redéploiement (P8)

Mesure : `clever restart --without-cache`, avec `/livez` interrogé toutes les 2 s pendant l'opération, et les
événements `start`/`sigterm` écrits dans Postgres.

- **La nouvelle instance démarre pendant que l'ancienne sert encore.** L'ancienne a servi les requêtes jusqu'à la
  bascule, puis la nouvelle a pris le relais, sans requête en échec. **Il y a donc bien un chevauchement.** Le bail de
  service est nécessaire.
- **Aucun événement `sigterm` n'a été enregistré** par l'ancienne instance. Soit le signal n'a pas été délivré, soit
  le processus a été arrêté avant de pouvoir écrire. **La bascule ne doit jamais dépendre de SIGTERM**, ce que le §4
  prévoit déjà.

## 3. PostgreSQL (add-on, plan `dev`)

Sonde `/probe/pg` :
- **Version** : 18.6.
- **Paramètres de session** : `lock_timeout = 2s`, `statement_timeout = 5s` et
  `idle_in_transaction_session_timeout = 5s` sont **acceptés**. `ALTER ROLE CURRENT_USER SET …` aussi.
  `tcp_keepalives_idle` vaut 7200.
- **Reprise avec un détenteur figé après le verrou de ligne.** La connexion A fait `BEGIN`, puis
  `SELECT … FOR UPDATE`, et ne fait plus rien. B réessaie avec `lock_timeout = 2s`.
  - B obtient la ligne après **5 002 ms** (2 tentatives).
  - Le `COMMIT` tardif de A **échoue** : la connexion a été fermée par Postgres.
  - La borne du §4 tient, avec une marge.
- **Limite du plan `dev`** : 5 connexions au plus. Le serveur réel aura besoin d'un plan supérieur ou d'un pool de
  2 connexions.

## 4. Cellar

Sonde `/probe/cellar`, SDK S3 v3, adressage par chemin :

| Comportement | Résultat |
|---|---|
| URL présignée GET, utilisée deux fois | `200`, `200` : **réutilisable** jusqu'à l'expiration |
| Même signature, autre clé | `403` |
| URL présignée expirée (2 s) | `403` |
| URL présignée PUT, utilisée deux fois | `200`, `200`, et le second contenu **écrase** le premier |
| `PutObject` avec `If-None-Match: *` sur une clé existante | **Ambigu** : aucune erreur, mais l'objet relu valait toujours la première valeur. À remesurer (§8) |

Conséquences pour le §3.8 : la portée « une clé, une durée » est confirmée. L'écrasement est confirmé, d'où le staging
propre au job. Le Studio ne doit pas compter sur `If-None-Match` tant que la mesure n'est pas claire : l'adressage par
contenu suffit (même clé, même contenu).

## 5. Dépendances système

Sonde `/probe/deps` sur le runtime Node natif :

| Dépendance | Résultat |
|---|---|
| `python3` | **3.13.16** présent |
| `pip` | **26.2.1** présent |
| numpy, PIL, scipy | **absents** : à installer par un hook de build (`pip install --user` avec un lock à hashes), à mesurer en 4.2.2 |
| `ffmpeg` | **9.0.2** présent |
| Chromium | **présent** (`/usr/host/bin/chromium`) ; son pilotage par Playwright reste à mesurer en 4.2.3 |
| `apt-get` | absent (Exherbo Linux) |

Les jobs d'assets (4.2.2) et de captures (4.2.3) paraissent faisables **sur le runtime Node natif**, sans service sur
un autre runtime. À confirmer par leurs PR.

## 6. Application de traitement

Sonde `/probe/worker?n=30`. On envoie un corps de 200 Ko de l'app studio vers l'app worker, par HTTPS public. Le
worker lance un enfant Node neuf, avec un environnement vide.

- Aller-retour : **p50 25 ms, p95 37 ms, max 48 ms**.
- Lancement de l'enfant : ≈ 18 ms.
- L'enfant voit **0** variable d'environnement.

**La garde synchrone peut partir dans l'application de traitement** côté latence réseau. Le coût restant est celui de
validate lui-même (import du jeu), à mesurer dans la PR I.

## 7. Origine de jeu et cookies

Les domaines `web-scumm-studio-spike.cleverapps.io` et `web-scumm-play-spike.cleverapps.io` sont **deux sites
différents** : `cleverapps.io` figure dans la Public Suffix List (section privée, entrée de Clever Cloud). Le spike
mesure donc l'option intersite. Page `/iframe-test` : iframe de jeu intersite, puis trois authentifications.

| Navigateur | Cookie `SameSite=None` | Cookie `Partitioned` (CHIPS) | Capacité dans le chemin |
|---|---|---|---|
| Chromium (Playwright) | ✓ | ✓ | ✓ |
| Firefox 157 (Playwright) | ✓ | ✓ | ✓ |
| WebKit / Safari 27.2 (Playwright) | **✗ bloqué** | ✓ | ✓ |
| Safari macOS réel, réglages par défaut | à mesurer (mainteneur) | | |
| Safari iOS réel, réglages par défaut | à mesurer (mainteneur) | | |

## 8. Keycloak managé

Découverte OpenID (`/realms/master/.well-known/openid-configuration`) :
- `backchannel_logout_supported` et `backchannel_logout_session_supported` : **true** ;
- `device_authorization_endpoint` : **présent** ;
- PKCE `S256` ;
- `introspection_endpoint` : présent ;
- signature des id_tokens en EdDSA, ES256, RS256 ou PS256.

Les flux eux-mêmes (connexion, back-channel, device flow, mapper d'audience) seront testés contre Keycloak dans la CI
de la PR 5, et sur cette instance dans la passe `studio-hosted`.

## 9. Ce qui reste ouvert

- SSE derrière le proxy : **pas de mise en tampon** (événements reçus au rythme d'une seconde) ; un flux sans
  événement a tenu **70 s** (le serveur envoie un ping toutes les 15 s).
- `If-None-Match` sur Cellar : à remesurer.
- Safari réel, macOS et iOS.
- Deux domaines sur une même application : **confirmé**, le routage par `Host` fonctionne.
