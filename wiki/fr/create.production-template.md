# Modèle de production

Le plan de production est un document qu'on écrit pour un jeu, à transmettre tel quel à un orchestrateur qui lance des
sous-agents en parallèle : chaque lot de travail (WP) est autonome, possède ses fichiers et se vérifie lui-même. Cette
page donne le modèle, partie par partie, puis en entier à copier. C'est le plan qui a servi au premier jeu construit
avec ce moteur ([Travailler avec une IA](create.working-with-ai.md#sub-agents)).

<a name="use"></a>

## S'en servir

- **Où il va.** Copiez le [modèle complet](#template) dans le dépôt de votre jeu sous le nom `docs/PRODUCTION.md` (le
  nom que lit le prompt de sous-agent du §7), et remplacez chaque `<…>`.
- **Le faire remplir par une IA.** Dans le dépôt du moteur, la compétence `/production-plan`
  (`.claude/skills/production-plan/`) lit le modèle, `games/<id>/storyboard.json` et l'état actuel (`npm run validate`,
  `npm run solve`, `npm test`, les lieux et assets présents), puis le remplit : objectif de livraison, contraintes du
  sujet, état, lots avec leurs fichiers, ordre, checklist finale, prompt de sous-agent, un modèle par lot.
- **Contexte.** Le modèle est écrit pour le dépôt du moteur : chemins `games/<id>/…`, `src/engine/…`, et les scripts
  `npm test` et `npm run audit`. Dans un projet créé, le jeu est dans `game/`, il n'y a pas de paquet moteur à modifier
  (pas de WP-A), et les vérifications sont `npm run verify` (validate, solve, état des traductions, lint, playtests)
  et `npm run build` ; voir [Organisation d'un projet créé](create.project-layout.md).

<a name="header"></a>

## En-tête et modèles par lot

Le plan s'ouvre sur son titre, `Plan de production — « <TITRE DU JEU> »`, et un paragraphe : ce qui est livré, quand,
pour qui, et la priorité unique à laquelle tout le reste se plie (par exemple « un jeu qu'on peut terminer sans bug, de
l'écran titre à la fin, sur les téléphones de la famille »). Il dit ensuite qu'il est écrit pour un orchestrateur, et
suggère un modèle par lot :

| Lot | Modèle | Pourquoi |
|---|---|---|
| Changements du moteur, règles partagées, QA finale | le modèle de raisonnement le plus puissant disponible | logique du moteur et arbitrage de dernière minute |
| Transcription de lieux, assets, mini-jeux | un modèle rapide | volumineux mais guidé mot à mot par le storyboard ; validate + solve rattrapent les erreurs |

<a name="orchestrator"></a>

## §0 Comment l'orchestrateur le fait tourner

1. Vague 1 : les lots indépendants en parallèle (moteur, assets, mini-jeux), puis les lots de contenu dès que le moteur
   a livré les ajouts au DSL dont ils ont besoin.
2. Chaque agent reçoit le plan, son lot, et le gabarit de prompt du §7. Il touche **uniquement** les fichiers que
   possède son lot. Un besoin hors de son lot va dans son rapport ; il ne le fait pas lui-même.
3. Chaque agent termine par `npm run validate && npm test` (et `npm run solve` pour les lots de contenu) et renvoie un
   rapport court : fait / pas fait / pour un autre lot.
4. Vague 2 : le lot QA démarre quand tout le monde a livré. Il peut corriger n'importe quel fichier, seul.
5. Ordre de vérité quand les sources ne sont pas d'accord : `games/<id>/storyboard.json` > les notes du commanditaire >
   le code actuel. Le storyboard a toujours raison sur le texte ; le code n'a raison que sur la technique.

<a name="sources-of-truth"></a>

## §1 Sources de vérité, à lire dans cet ordre

| Fichier | Rôle |
|---|---|
| `games/<id>/storyboard.json` (et son export Markdown) | tout le scénario : tableaux, cases, répliques, réactions optionnelles, indices, sujets de conversation, répliques de regard |
| la documentation : [Référence du DSL](create.dsl.md), [Comment fonctionne le moteur](engine.how-it-works.md), [Vérifier son jeu](create.checking.md) | comment écrire le contenu (DSL), le moteur, les outils |
| `games/<id>/layout/*.json` | placement validé (jamais tapé à la main) |
| `games/<id>/art/<sheet>/` | tous les sprites découpés ; jamais recoupés, jamais supprimés |

Le modèle de 4.4 citait `docs/en/CONTENT_GUIDE.md`, `ENGINE.md` et `TOOLS.md` à la deuxième ligne ; depuis 4.5, ces
pages sont celles de ce wiki.

<a name="constraints"></a>

## §2 Contraintes non négociables

- `<Ce qui ne doit jamais entrer dans le dépôt : lister quoi.>`
- Ne jamais supprimer un asset : renommer en `_v1`, `_v2`, garder une sauvegarde.
- `<Sensibilités du sujet : personnes qui doivent rester silencieuses, blagues refusées, règles de ton.>`
- `<Règles de style : longueur des phrases, rythme (normal → normal → normal → absurde), pas de simple négation comme solution de facilité.>`

<a name="state"></a>

## §3 État du projet à une date

- **Fonctionne :** `<fonctionnalités du moteur, lieux écrits, objets, personnages, mini-jeux, tests au vert, déploiement documenté.>`
- **Manque, par ordre d'importance :** `<une liste numérotée.>`

<a name="work-packages"></a>

## §4 Lots de travail

Chaque lot liste ses fichiers, ses livrables et sa vérification.

| Lot | Fichiers possédés | Livrables | Vérification |
|---|---|---|---|
| **WP-A · Moteur** | `src/engine/**` | `…` | `npm test`, une capture d'écran de lieu par changement visuel |
| **WP-B · Contenu**, découpé par groupes de lieux (B1, B2, B3) | `games/<id>/rooms/**`, `game.ts`, `items.ts`, `cast.ts` | chaque case du storyboard transcrite ; indices ; points de sauvegarde | `npm run validate && npm run solve && npm test` |
| **WP-C · Assets** | `games/<id>/art/**`, `npm run assets` | `…` | `…` |
| **WP-D · Mini-jeux** | `src/engine/minigames/**` ou `games/<id>/minigames/**` | `…` | `…` |
| **WP-E · QA, pré-production, déploiement** (vague 2, un seul agent) | n'importe quel fichier | partie complète en e2e avec captures, corrections, build, déploiement, la checklist du §6 | §6 |

<a name="ordering"></a>

## §5 Ordre et règles de fusion

`<Qui attend qui ; un commit par lot ; le format du message de commit.>`

<a name="final-checklist"></a>

## §6 Checklist finale avant d'envoyer le lien

- [ ] `npm run validate`, `npm run solve`, `npm test`, `npm run build` tous au vert
- [ ] partie complète en e2e au vert, captures d'écran relues
- [ ] jouée une fois sur un vrai téléphone, en paysage, avec le son
- [ ] rien de privé dans `dist/` (`npm run audit`)

Dans le dépôt du moteur, `npm run build` lance déjà la vérification des types et les tests (`npm run check`) avant le
build. La liste complète avant une publication : [Vérifier son jeu](create.checking.md#before-you-share).

<a name="sub-agent-prompt"></a>

## §7 Gabarit de prompt pour un sous-agent

```text
Tu travailles sur le jeu « <TITRE DU JEU> » (dépôt : <path>). Lis docs/PRODUCTION.md en entier, puis ton lot : WP-<X>.
Tu possèdes exclusivement les fichiers listés dans ton lot ; tu ne changes rien d'autre. Un besoin hors de ton lot va dans ton rapport.
Sources de vérité, dans l'ordre : games/<id>/storyboard.json, les notes du commanditaire, puis le code.
Respecte le §2 sans exception.
Termine par : npm run validate && npm test (et npm run solve pour un lot de contenu).
Renvoie un rapport de 15 lignes maximum : fait / pas fait et pourquoi / ce qu'un autre lot doit faire / commandes de vérification qui sont passées.
```

<a name="template"></a>

## Le modèle complet, à copier

```markdown
# Plan de production — « <TITRE DU JEU> »

<Un paragraphe : ce qui est livré, quand, pour qui. La priorité unique à laquelle tout le reste se plie, par exemple
« un jeu qu'on peut terminer sans bug, de l'écran titre à la fin, sur les téléphones de la famille ».>

Ce fichier est écrit pour être transmis tel quel à un orchestrateur qui lance des sous-agents en parallèle : chaque
lot de travail (WP) est autonome, possède ses fichiers, et se vérifie lui-même.

**Modèles suggérés par lot**
| Lot | Modèle | Pourquoi |
|---|---|---|
| Changements du moteur, règles partagées, QA finale | le modèle de raisonnement le plus puissant disponible | logique du moteur et arbitrage de dernière minute |
| Transcription de lieux, assets, mini-jeux | un modèle rapide | volumineux mais guidé mot à mot par le storyboard ; validate + solve rattrapent les erreurs |

## 0. Comment l'orchestrateur fait tourner ça
1. Lancer la vague 1 : les lots indépendants en parallèle (moteur, assets, mini-jeux), puis les lots de contenu dès
   que le moteur a livré les ajouts au DSL dont ils ont besoin.
2. Chaque agent reçoit ce fichier, son lot, et le gabarit de prompt du §7. Il touche **uniquement** les fichiers que
   possède son lot. Un besoin hors de son lot va dans son rapport ; il ne le fait pas lui-même.
3. Chaque agent termine par `npm run validate && npm test` (et `npm run solve` pour les lots de contenu) et renvoie
   un rapport court : fait / pas fait / pour un autre lot.
4. Vague 2 : le lot QA démarre quand tout le monde a livré. Il peut corriger n'importe quel fichier, seul.
5. Ordre de vérité en cas de désaccord des sources : `games/<id>/storyboard.json` > les notes du commanditaire > le
   code actuel. Le storyboard a toujours raison sur le texte ; le code n'a raison que sur la technique.

## 1. Sources de vérité (à lire dans cet ordre)
| Fichier | Rôle |
|---|---|
| `games/<id>/storyboard.json` (+ son export Markdown) | tout le scénario : tableaux, cases, répliques, réactions optionnelles, indices, sujets de conversation, répliques de regard |
| le wiki : Référence du DSL, Comment fonctionne le moteur, Vérifier son jeu | comment écrire le contenu (DSL), le moteur, les outils |
| `games/<id>/layout/*.json` | placement validé (jamais tapé à la main) |
| `games/<id>/art/<sheet>/` | tous les sprites découpés ; jamais recoupés, jamais supprimés |

## 2. Contraintes non négociables
- <Ce qui ne doit jamais entrer dans le dépôt : lister quoi.>
- Ne jamais supprimer un asset : renommer en `_v1`, `_v2`, garder une sauvegarde.
- <Sensibilités du sujet : personnes qui doivent rester silencieuses, blagues refusées, règles de ton.>
- <Règles de style : longueur des phrases, rythme (normal → normal → normal → absurde), pas de simple négation comme
  solution de facilité.>

## 3. État du projet au <date>
**Fonctionne :** <fonctionnalités du moteur, lieux écrits, objets, personnages, mini-jeux, tests au vert, déploiement
documenté.>
**Manque, par ordre d'importance :** <liste numérotée.>

## 4. Lots de travail
### WP-A · Moteur (`src/engine/**`)
Fichiers possédés : … Livrables : … Vérification : `npm test`, une capture d'écran de lieu par changement visuel.
### WP-B · Contenu (`games/<id>/rooms/**`, `game.ts`, `items.ts`, `cast.ts`)
Découpé par groupes de lieux (B1, B2, B3). Fichiers possédés : … Livrables : chaque case du storyboard transcrite ;
indices ; points de sauvegarde. Vérification : `npm run validate && npm run solve && npm test`.
### WP-C · Assets (`games/<id>/art/**`, `npm run assets`)
### WP-D · Mini-jeux (`src/engine/minigames/**` ou `games/<id>/minigames/**`)
### WP-E · QA, pré-production, déploiement (vague 2, un seul agent)
Partie complète en e2e avec captures d'écran, corrections, build, déploiement, checklist du §6.

## 5. Ordre et règles de fusion
<Qui attend qui ; un commit par lot ; format du message de commit.>

## 6. Checklist finale avant d'envoyer le lien
- [ ] `npm run validate`, `npm run solve`, `npm test`, `npm run build` tous au vert
- [ ] partie complète en e2e au vert avec captures d'écran relues
- [ ] jouée une fois sur un vrai téléphone, en paysage, avec le son
- [ ] rien de privé dans `dist/` (`npm run audit`)

## 7. Gabarit de prompt pour un sous-agent
(le bloc du §7 ci-dessus)
```

> [!LIMIT id=template-not-checked]
> Le modèle est un document, pas un outil : rien ne vérifie qu'un plan le suit ni qu'un sous-agent s'en est tenu à ses
> fichiers. Les vérifications sont les commandes par lesquelles chaque lot se termine.

<a name="related"></a>

## Identifiants liés

- `npm run validate`, `npm run solve`, `npm test`, `npm run build`, `npm run audit`, `npm run assets`.
- La compétence `/production-plan` (`.claude/skills/production-plan/SKILL.md`, dépôt du moteur).
- [Travailler avec une IA](create.working-with-ai.md), [Le storyboard](create.storyboard.md),
  [Contribuer avec des agents IA](contribute.ai-agents.md).
