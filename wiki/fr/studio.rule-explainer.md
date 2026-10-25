# Explication des règles

Le panneau **Why?** de l'onglet Play répond à « que se passe-t-il si le joueur fait ceci, maintenant ? » : choisissez
un verbe, un objet et une cible, et il liste chaque règle qui pourrait répondre, chaque condition évaluée sur l'état
en direct du jeu dans le cadre, et quelle réponse l'emporte.

<a name="where"></a>

## Où il se trouve

Dans l'onglet Play du Studio, sous l'état en direct du jeu ([Jouer et rejouer une session](studio.sessions.md)). Son
titre dit « Why? — the rules that could answer, first ✓ wins ». Il lit le jeu qui tourne dans le cadre, donc il suit
ce que vous jouez. Studio local seulement : sur un Studio hébergé, le jeu est sur une autre origine et le panneau est
retiré.

<a name="inputs"></a>

## Entrées

| Champ | Valeurs | Par défaut |
|---|---|---|
| **Verb** | Les verbes du jeu | Le premier verbe |
| **Item** | Un objet présent dans le sac, ou `(no item)` | `(no item)` |
| **Target** | Ce sur quoi porte l'action : une cible du lieu courant, ou un objet du sac (`bag: <id>`) | `(target)` : le panneau dit « Pick a target. » |

Avec un objet, l'action est « verbe objet → cible » (utiliser la clé sur la porte) ; sans objet, « verbe cible ».

<a name="matching"></a>

## Quelles règles sont listées

Les règles du lieu (`on` du lieu courant) d'abord, puis celles du jeu (`rules.on` du jeu), dans leur ordre d'écriture.
Une règle est listée quand son verbe contient le verbe choisi et que ses cibles correspondent : `a` est la cible (ou
l'objet s'il y en a un) et `b` la cible quand il y a un objet. Pour deux objets, la règle correspond aussi dans l'autre
sens (objet et cible échangés).

<a name="marks"></a>

## Ce que montre chaque ligne

- Le signe : **▶** la règle qui l'emporte (la première dont la condition tient), **✓** une règle dont la condition
  tient mais qui vient après la gagnante, **✗** une règle dont la condition ne tient pas.
- L'id de la règle, ou `<lieu>.on[<n>]` / `game.on[<n>]` quand elle n'en a pas, et « (exit) » pour une règle de
  sortie.
- Le verbe et les cibles auxquels elle répond, puis sa condition, chaque partie évaluée **✓ / ✗** sur l'état en
  direct, imbriquée comme l'est la condition.

<a name="fallbacks"></a>

## Quand aucune règle ne répond

Le panneau dit vers quelle réponse le moteur se replie : « No rule answers: … »

| Action | Repli nommé |
|---|---|
| regarder une cible qui a une ligne de Regarder (dans le lieu ou sur l'objet) | the look line |
| regarder une cible qui n'en a pas | the look fallback |
| parler à une cible qui a des sujets de conversation dans le lieu | the conversation topics |
| parler à l'objet d'indices du jeu | the hints |
| parler sinon | the talk fallback |
| tout le reste | a kind reaction, a refusal or the fallback line |

> [!LIMIT id=explainer-live-state-only]
> Le panneau juge l'état du cadre maintenant : il ne cherche pas un état où une règle tiendrait (c'est le travail du
> solveur, [Vérifier](studio.check.md)), et il n'exécute pas la règle. Ce qu'un script ou un écouteur répond hors d'un
> verbe n'est pas listé.

<a name="related"></a>

## Identifiants liés

- [Réactions](create.reactions.md), [Conditions](create.conditions.md).
- [`src/studio/play.ts`](../../src/studio/play.ts) (le panneau, `explainCond`).
