# Ce qui tourne où

Le Studio d'équipe, ou Studio Server, met en ligne le Studio d'un jeu pour une petite équipe. Cette page montre ses
morceaux, où chacun tourne, ce que chacun détient, et pourquoi le découpage est celui-là.

<a name="overview"></a>

## Vue d'ensemble

Le Studio Server met le Studio d'un jeu en ligne pour une petite équipe. Chacun se connecte par un fournisseur OpenID
Connect (Keycloak ou un autre), travaille sur le même jeu en même temps, et voit chaque changement dès qu'il arrive.
C'est le chantier de la ligne 4.2.x (plan
[`docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`](../../docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md)).

Seul sur votre machine, vous n'avez besoin de rien de tout ça : `npm run studio` reste tel quel (voir
[Le Studio local](studio.overview.md)).

Ce que le Studio hébergé apporte, version par version :

- **4.2.1** : le journal (aucune modification confirmée n'est perdue), les connexions et les rôles, l'application de
  traitement, les pans et les baux, le flux en direct.
- **4.2.2** : le jeu sur sa propre origine avec une prévisualisation par révision, la santé par révision,
  l'annulation personnelle, les builds publiés, les assets préparés sur l'application de traitement, la sauvegarde et
  la restauration, et les écrans du Studio pour tout cela.
- **4.2.3** : les uploads et la découpe de planches de l'onglet Assets, Prepare et les découpes en jobs qui se suivent
  et s'annulent, la révision lue par chaque éditeur, la carte du scénario, les commentaires, le diff, le MCP distant,
  Git, la montée de version du moteur, les métriques et la sauvegarde quotidienne.

Son déploiement est documenté pour Clever Cloud, depuis le dépôt ou depuis l'archive de la release
`quest-n-click-studio-server` (le même serveur) : voir [Clever Cloud : vue d'ensemble](clever.overview.md) et
[Premier déploiement](clever.first-deployment.md).

<a name="the-picture"></a>

## Le schéma

```text
navigateurs ─HTTPS─▶ studio (app Node, une instance) ──jobs signés──▶ studio-worker (app Node, sans secrets)
CLI, MCP ─Bearer──┘   │  public_url : le Studio et /api          ▲ snapshot et résultat présignés
                      │  play_url :   le jeu (une autre origine)  │
                      ├──▶ PostgreSQL : journal, membres, sessions, baux
                      ├──▶ Cellar (S3) : le contenu des fichiers, les snapshots du worker ─┘
                      └──▶ fournisseur OpenID : qui sont les gens (jamais ce qu'ils peuvent faire)
```

En mots :

- **Les navigateurs** joignent l'application `studio` en HTTPS avec un cookie de session. **La CLI et les clients
  MCP** la joignent avec un jeton d'accès Bearer.
- **`studio`** est une seule instance Node.js. Sur son URL publique (`publicUrl`), elle sert la page du Studio et
  `/api`. Sur une seconde origine (`playUrl`), elle sert le jeu : les prévisualisations et les builds publiés.
- **PostgreSQL** garde le journal, les membres, les sessions et les baux.
- **Cellar** (un stockage S3) garde le contenu des fichiers et les snapshots que lit le worker.
- **`studio-worker`** est une seconde application Node.js. Elle reçoit des jobs signés par `studio`, lit le snapshot
  et écrit son résultat par des URL présignées, et ne détient aucun secret.
- **Le fournisseur OpenID** dit qui sont les gens. Ce qu'ils ont le droit de faire se décide dans le Studio (voir
  [Rôles et actions](team.roles.md)).

<a name="why"></a>

## Pourquoi ce découpage

- **Les fichiers du jeu vivent dans PostgreSQL et Cellar.** Postgres dit quelle version de chaque fichier est la
  bonne, Cellar garde les contenus. Le disque de l'application n'est qu'un cache : celui de Clever Cloud ne survit pas
  à un redémarrage, et rien ne se perd quand il disparaît. L'instance qui sert les écritures compare son dossier à la
  tête toutes les 30 secondes et le répare sans redémarrer.
- **Le code du jeu ne s'exécute jamais dans le Studio.** Un jeu est du TypeScript : le lire ou le valider, c'est
  l'exécuter. La validation, les lectures du module du jeu, les prévisualisations, les builds, le lint, le solveur et
  les playtests partent donc sur `studio-worker`, qui ne détient ni mot de passe, ni clé, ni accès à la base
  ([ADR 0028](../../docs/dev/adr/0028-studio-content-execution.md)).
- **Le jeu se joue sur une autre origine** (`playUrl`). Son code ne peut pas agir avec la session Studio d'un membre :
  le cookie du Studio n'y va jamais, et aucune API du Studio n'y répond.
- **Le fournisseur ne donne que l'identité.** Les rôles, les invitations et l'audit vivent dans la base du Studio
  ([ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md)).
- **Un seul écrivain par projet.** Chaque changement est une transaction dans un journal, chaque fichier appartient à
  un pan, et une seule instance à la fois sert les écritures, sous un bail de service dans PostgreSQL
  ([ADR 0025](../../docs/dev/adr/0025-studio-server.md)). Les mots sont expliqués dans [Concepts](team.concepts.md).

<a name="alternatives"></a>

## Les options écartées

- **Exécuter le code du jeu dans le processus du Studio**, ou dans un de ses enfants : un enfant tourne sous le même
  utilisateur système et peut lire l'environnement du parent, donc un `dev` aurait pu lire tous les secrets
  (ADR 0028).
- **Gérer les droits dans le fournisseur** (des groupes) : le mainteneur a choisi le Studio le 17 octobre 2026
  (ADR 0027).
- **Un espace de travail privé par personne**, fusionné ensuite : refusé par le mainteneur le 17 octobre 2026
  (ADR 0025). L'équipe travaille sur une seule copie vivante, avec des verrous explicites.
- **Un canal WebSocket** : les Server-Sent Events et une lecture HTTP par curseur suffisent tant qu'une mesure ne dit
  pas le contraire (ADR 0025, P7).

<a name="trade-offs"></a>

## Les compromis

- Un jeu par instance, et une seule instance sert les écritures à la fois : une seconde attend le bail.
- Chaque job coûte un aller-retour vers le worker ; prévisualisations et vérifications ne sont pas instantanées (voir
  [Limites connues](team.limits.md)).
- Les membres sont de confiance : un `dev` exécute quand même du code sur la machine du worker, sous l'utilisateur des
  outils d'assets (ADR 0028).

> [!LIMIT id=hosted-only]
> Tout ce que décrit cette page concerne le Studio hébergé (le Studio Server). Le Studio local, `npm run studio`, n'a
> qu'une personne, pas de worker, pas de seconde origine et pas de connexion.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0025 : un jeu partagé, modifié en direct](../../docs/dev/adr/0025-studio-server.md)
- [ADR 0026 : les sauvegardes d'une révision à l'autre](../../docs/dev/adr/0026-saves-across-revisions.md)
- [ADR 0027 : OIDC pour savoir qui, le Studio pour savoir quoi](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md)
- [ADR 0028 : un worker sans secrets](../../docs/dev/adr/0028-studio-content-execution.md)
- [ADR 0029 : le MCP distant](../../docs/dev/adr/0029-remote-mcp.md)
- Les décisions D39 à D47 dans [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
