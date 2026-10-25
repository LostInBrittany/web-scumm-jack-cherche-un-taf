# Clever Cloud : vue d’ensemble, coût et prérequis

Le Studio d’équipe (le Studio Server) met en ligne le Studio d’un jeu pour une petite équipe. Ce projet documente un
seul hébergeur, Clever Cloud, en détail. Cette page dit ce qui y tourne, pourquoi c’est découpé ainsi, ce qu’il faut
avant de commencer, ce que cela coûte à faire tourner et dans quel ordre lire les autres pages Clever.

<a name="why"></a>

## Pourquoi

Un Studio partagé doit tenir trois promesses qu’un Studio local n’avait pas à tenir : aucune modification confirmée
n’est perdue, chaque personne est distinguée, et le code du jeu ne tourne jamais avec les droits d’un membre. Chaque
partie du déploiement répond à l’une d’elles.

```text
navigateurs ─HTTPS─▶ studio (app Node, une instance) ──jobs signés──▶ studio-worker (app Node, sans secret)
CLI, MCP ─Bearer─┘     │  publicUrl : le Studio et /api                ▲ instantané et résultat présignés
                       │  playUrl :   le jeu (une autre origine)       │
                       ├──▶ PostgreSQL : journal, membres, sessions, baux
                       ├──▶ Cellar (S3) : le contenu des fichiers, les instantanés du worker ─┘
                       └──▶ fournisseur OpenID : qui sont les gens (jamais ce qu’ils peuvent faire)
```

- **Les fichiers du jeu** vivent dans PostgreSQL (quelle version de chaque fichier) et dans Cellar (leur contenu). Le
  disque de l’application est un cache : celui de Clever Cloud ne survit pas à un redémarrage (mesuré par le spike S :
  un marqueur écrit, puis `clever restart`, avait disparu), et rien n’est perdu quand il part.
- **Le code du jeu ne tourne jamais dans le Studio.** Le valider, construire ses prévisualisations et le lire passent
  par `studio-worker`, une seconde application qui ne détient ni mot de passe, ni clé, ni accès à la base (ADR 0028).
- **Le jeu se joue sur une autre origine** (`playUrl`) : son code ne peut pas agir avec la session Studio d’un membre.
- **Le fournisseur dit qui est quelqu’un**, le Studio décide de ce qu’il peut faire (ADR 0027).

<a name="prerequisites"></a>

## Ce qu’il vous faut

- Une organisation Clever Cloud où vous pouvez créer des applications et des add-ons, et `clever-tools` connecté à
  elle.
- Deux applications Node.js (`studio`, `studio-worker`), un add-on PostgreSQL, un add-on Cellar avec un bucket, et un
  fournisseur OpenID Connect. Le Keycloak managé de Clever Cloud convient ; un autre fournisseur convient pour les
  connexions du navigateur, avec des limites ([OIDC générique et GitLab](clever.generic-oidc.md)).
- **Un domaine à vous**, pour deux de ses sous-domaines (`studio.exemple.fr`, `play.exemple.fr`), jamais deux noms en
  `*.cleverapps.io` ([Domaines et TLS](clever.domains-tls.md)).
- Sur votre machine : le dépôt du moteur à la version que vous déployez, `npm ci` fait, pour créer les clés des jobs
  et lancer sauvegardes, restaurations et exports.

> [!LIMIT id=experimental]
> Le Studio Server est expérimental. Ses passes humaines (`studio-hosted`, `studio-collab`, `studio-preview`,
> `studio-assets-hosted`, `studio-mcp-remote`, `studio-oidc-generic`) étaient encore `not-run` pour la 4.4.0
> (`docs/dev/passes/4.4.0.md`). Un vrai Safari, sous macOS et iOS, n’a pas été essayé contre un Studio hébergé.

<a name="costs"></a>

## Ce que cela coûte à faire tourner

Aucun prix n’a été mesuré pour ce projet : le dépôt ne contient ni facture ni grille de prix datée. Cette page donne
donc les ressources, pas un montant. Chiffrez-les sur la page des tarifs de Clever Cloud le jour où vous déployez.

Le déploiement de référence du 19 octobre 2026 (`docs/dev/QUALIF-4.2.3-REFERENCE.md` §1) tournait sur les plus
petites tailles :

| Ressource | Ce qu’il utilisait | Suffisant ? |
|---|---|---|
| Application `studio` | Node.js, taille XS (1 vCPU, environ 1 Go), 1 instance | Pour un jeu et quelques membres |
| Application `studio-worker` | Node.js, taille XS, 1 instance | Un job à la fois par file |
| PostgreSQL | plan DEV (5 connexions) | **Non** pour une équipe : un redéploiement fait tourner deux instances, qui dépassent 5 connexions ([Applications et add-ons](clever.apps-addons.md#postgresql-sizing)) |
| Cellar | plan S, un bucket | Oui pour le jeu de démo (500 fichiers) |
| Keycloak | managé, plan BASE | Oui |

Pendant un redéploiement, les deux instances de chaque application tournent plusieurs minutes : ce chevauchement se
paie aussi ([Redéploiements](clever.redeploys.md)). Tout supprimer, c’est [Coûts et démontage](clever.costs-teardown.md).

<a name="pages"></a>

## Les pages Clever, dans l’ordre

1. [Applications et add-ons](clever.apps-addons.md)
2. [Domaines et TLS](clever.domains-tls.md)
3. [Keycloak](clever.keycloak.md), ou [OIDC générique et GitLab](clever.generic-oidc.md)
4. [Configuration](clever.configuration.md)
5. [Premier déploiement](clever.first-deployment.md)
6. [Sauvegardes](clever.backups.md), [RPO et RTO](clever.rpo-rto.md),
   l’[exercice de restauration](clever.restore-drill.md)
7. [Redéploiements](clever.redeploys.md), [Mettre à jour le serveur](clever.upgrade-server.md),
   [Limites du retour arrière](clever.going-back.md)
8. [Supervision](clever.monitoring.md), [Sécurité](clever.security.md), [Renouveler les clés](clever.key-rotation.md)
9. Quand quelque chose casse : [Récupérer l’accès administrateur](clever.admin-recovery.md),
   [Changer de domaine ou de fournisseur OIDC](clever.change-domain.md),
   [Worker, PostgreSQL ou Cellar en panne](clever.dependency-down.md), [Dépannage](clever.troubleshooting.md)
10. Partir : [Exporter le jeu](clever.export-leave.md), [Rétention](clever.retention.md),
    [Coûts et démontage](clever.costs-teardown.md)

<a name="alternatives"></a>

## Les autres possibilités écartées

- **D’autres hébergeurs.** Le mainteneur a choisi de documenter Clever Cloud seul, en détail (D50). Le serveur lit une
  configuration JSON et quelques secrets, et tourne partout où il y a Node.js, PostgreSQL et un stockage S3 : rien en
  lui n’est propre à Clever, mais aucun autre hébergeur n’est documenté ni vérifié.
- **Une application au lieu de deux.** Faire tourner le code du jeu dans le processus du Studio lui donnerait les
  secrets du Studio. Sur le runtime Node.js de Clever Cloud il n’y a qu’un utilisateur système (`bas`), et un enfant
  peut lire l’environnement de son parent par `/proc` (spike S §1) : la séparation, c’est une seconde application
  (ADR 0028).
- **Docker.** Le runtime Node.js natif a Python 3.13, pip et ffmpeg (spike S §5), assez pour les outils d’assets du
  worker ; Docker n’est jamais requis.
- **Deux noms en `*.cleverapps.io`.** Ce sont deux sites (la Public Suffix List) : le cookie du jeu dépend alors des
  cookies partitionnés, que certains navigateurs refusent ([Domaines et TLS](clever.domains-tls.md)).

<a name="trade-offs"></a>

## Les compromis

- **Une seule instance.** Un jeu par instance, une instance qui sert les écritures (un bail de service dans
  PostgreSQL). Pas de montée en charge horizontale.
- **Un redéploiement refuse les écritures un moment.** Environ une minute d’écritures lentes ou refusées par
  redéploiement, aucune perdue ([Redéploiements](clever.redeploys.md)).
- **Les sauvegardes vivent dans le même bucket que les fichiers.** Elles survivent à la perte de la base, pas à celle
  du bucket ([Sauvegardes](clever.backups.md)).
- **Des secrets en variables.** Clever Cloud injecte les identifiants des add-ons en variables d’environnement : le
  serveur lit chaque secret une fois et le retire de son environnement, ce qui s’écarte de la règle maison « des
  secrets dans des fichiers » (ADR 0027).

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0025, le Studio Server](../../docs/dev/adr/0025-studio-server.md) ;
  [ADR 0027, identité, sessions, jetons](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md) ;
  [ADR 0028, où tourne le code du jeu](../../docs/dev/adr/0028-studio-content-execution.md).
- Le spike S, le runtime mesuré : [`docs/dev/SPIKE-4.2.1-CLEVER.md`](../../docs/dev/SPIKE-4.2.1-CLEVER.md) ; le
  déploiement de référence : [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md).
- Ce qui tourne où, pour les membres : [Ce qui tourne où](team.what-runs-where.md).
