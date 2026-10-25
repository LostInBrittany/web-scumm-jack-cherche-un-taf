# Bienvenue

quest'n'click est un petit projet, avec un seul mainteneur, @wanoo. Une contribution est la bienvenue quand elle est
petite, testée et expliquée : un correctif accompagné de son test de non-régression, un cas qui manquait au
validateur, une page plus claire. Cette page dit pourquoi le projet fonctionne comme il fonctionne ; les pages qu'elle
cite disent comment.

<a name="why"></a>

## Pourquoi le projet fonctionne ainsi

**Un jeu est une donnée, jamais du code.** Le moteur, dans `src/engine/`, lit un dossier de jeu `games/<id>/` et ne
sait rien d'autre de lui. C'est ce qui permet au validateur, au solveur, au rejeu, au Studio et à un assistant IA de
lire et de vérifier le même contenu. Une modification du moteur tient cette promesse : le gameplay reste déclaratif
dans `games/<id>/`, et la géométrie reste dans `layout/*.json` (voir [Architecture](contribute.architecture.md)).

**La plupart des mécaniques existent déjà.** Avant de demander une nouvelle commande ou un nouveau champ, lisez les
mécaniques classiques du genre ([Mécaniques classiques](create.classics.md), l'ancien `docs/fr/CLASSICS.md`) : les
duels d'insultes, les objets qui fondent, les rondes, le marchandage et les énigmes à plusieurs personnages sont des
combinaisons de règles, de drapeaux, de scripts et d'événements que le moteur possède déjà. Une demande de nouveauté
part du modèle d'issue « feature », après cette page.

**Chaque affirmation a sa vérification.** Le projet préfère une barrière qui échoue à une promesse qui dérive. Les
seuils de couverture ne font que monter ([Le cliquet de couverture](contribute.coverage-ratchet.md)), le comportement
du moteur est figé dans une référence ([La référence de qualité](contribute.quality-baseline.md)), et chaque mutant
survivant est nommé avec sa raison ([Tests de mutation](contribute.mutation-testing.md)). Ce que seuls des gens et de
vrais appareils peuvent vérifier est une passe de terrain, rapportée à chaque release
([Passes de terrain](contribute.field-passes.md)).

**Ce qui est public est une promesse ; le reste peut bouger.** Le DSL public, l'enveloppe de sauvegarde et les contrats
de plugin suivent le versionnage sémantique depuis la v3, sauf sur la ligne d'incubation 4.1.8–4.1.15, où une rupture
était documentée avec sa migration ([Stabilité et support](start.stability.md)). Les modules internes ne sont pas des
promesses de compatibilité, sauf si une page dit le contraire
([Frontières d'import](contribute.boundaries.md#public-and-internal)).

<a name="how-to-help"></a>

## Comment se passe une contribution

1. Préparez la machine une fois : [Préparer son poste de développement](contribute.setup.md).
2. Lisez le code avec [Architecture](contribute.architecture.md), puis suivez la [Visite du code](contribute.code-tour.md)
   (une demi-heure).
3. Changez une chose, avec la boucle de [La boucle de développement](contribute.dev-loop.md). Restez petit ; un
   correctif arrive avec le test qui l'aurait attrapé.
4. Nommez la branche, la pull request et le fragment du CHANGELOG comme le dit [Conventions](contribute.conventions.md).
5. Lancez les vérifications d'[Avant une pull request](contribute.before-a-pr.md), ouvrez la pull request depuis le
   modèle, et lisez ce que dit la CI ([La CI expliquée](contribute.ci.md)).

Travailler avec un assistant IA est attendu, et a ses propres règles :
[Contribuer avec des agents IA](contribute.ai-agents.md).

> [!LIMIT id=private-assets]
> N'ajoutez jamais d'assets sources privés, ni de matériel dont les droits commerciaux sont flous. Tous les assets du jeu
> d'exemple sont sous CC BY 4.0 ([Licences et crédits](contribute.licences.md)).

<a name="conduct"></a>

## Conduite et sécurité

Chacun ici suit le [Code de conduite](contribute.code-of-conduct.md). Une vulnérabilité se signale en privé, jamais
dans une issue publique : [Politique de sécurité](contribute.security-policy.md). Comment les décisions sont prises,
et par qui, c'est dans [Gouvernance](contribute.governance.md) et [Décisions et ADR](contribute.decisions.md).

<a name="decisions"></a>

## Décisions et ADR

- La documentation publique de développement vit dans `docs/dev/`, en anglais ; le mainteneur tranche les désaccords
  et l'échange y est committé ([D3](../../docs/dev/DECISIONS.md)).
- [ADR 0030](../../docs/dev/adr/0030-documentation-from-wiki-sources.md) : la documentation est générée depuis
  `wiki/` ; cette page en est une des sources.
