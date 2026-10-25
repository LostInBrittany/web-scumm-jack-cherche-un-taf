# Carte

L'onglet Map range ce que le jeu nomme déjà dans les chapitres, énigmes et personnages du scénario, montre où chaque
pièce est écrite, et liste ce qu'aucun regroupement ne nomme encore. Il ne fait que référencer le contenu : il ne le
change jamais.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un `games/<id>/groupings.json` qui range lieux, règles, sujets, objets, personnages, objectifs et checkpoints en
chapitres, énigmes et personnages, et une carte qui donne, pour chaque référence, le `fichier:ligne` qui l'écrit.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local et un Studio hébergé (où un relecteur la lit sans la modifier), depuis la 4.2.3 ; pas le Studio de
démo, qui dit « The scenario map needs the dev server or a hosted Studio. » Sur un Studio d'équipe, la carte et le
diff sémantique vont ensemble : [Carte et diff sémantique](team.map-diff.md).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Map.

<a name="steps"></a>

## Étapes

<!-- step: new -->
1. **New grouping** : un titre (**Title**) et une sorte (**Kind**), chapter, puzzle ou character.

<!-- step: refs -->
2. Ajoutez ses références, chacune quelque chose que le jeu nomme déjà :

   | Référence | Nomme |
   |---|---|
   | `<id de lieu>` | Un lieu |
   | `<id de règle ou de sujet>` | Une règle ou un sujet de conversation |
   | `item:<id>` | Un objet |
   | `char:<id>` | Un personnage |
   | `objective:<id>` | Un objectif |
   | `checkpoint:<id>` | Un checkpoint |

<!-- step: save -->
3. **Save**. Chaque référence s'affiche alors avec le `fichier:ligne` qui l'écrit, ou « not declared » quand le jeu ne
   la connaît pas. **Edit** modifie un regroupement, **Delete the grouping** le retire.

<!-- step: ungrouped -->
4. Lisez **Not in any grouping** : les lieux, personnages, objets, objectifs et checkpoints qu'aucun regroupement ne
   nomme encore (« Everything is in a grouping. » quand il n'en reste aucun).

> [!GUARANTEE id=groupings-only]
> Un regroupement ne fait que référencer : l'enregistrer écrit `groupings.json` seul, jamais le contenu. Ajouter puis
> supprimer un regroupement laisse chaque fichier de contenu tel qu'il était.

> [!LIMIT id=not-declared]
> La carte est dérivée à chaque lecture de la provenance de l'IR et des regroupements, jamais stockée. Les ids écrits
> par du code, et ceux des répliques ou des étapes, ne sont pas dans la provenance de l'IR : ils apparaissent « not
> declared » même quand le jeu s'en sert.

<a name="checks"></a>

### Ce que doit être un fichier de regroupements

L'enregistrement refuse un fichier qui enfreint l'une de ces règles, et dit chaque problème :

- `groupings` est une liste d'au plus 500 regroupements, et rien d'autre n'est dans le fichier ;
- l'`id` d'un regroupement est fait de minuscules, chiffres et `-` (64 caractères au plus), unique ;
- `kind` vaut `chapter`, `puzzle` ou `character` ;
- `title` est un texte de 1 à 200 caractères, sans caractère de contrôle ;
- `refs` est une liste d'au plus 500 références, chacune sans espace (200 caractères au plus), aucune nommée deux fois ;
- aucun autre champ.

Un `groupings.json` modifié à la main est lu autant que possible : les regroupements lisibles sont placés sur la carte,
les autres sont signalés.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Chaque référence affiche un `fichier:ligne` ; `git diff` montre `games/<id>/groupings.json` modifié et rien d'autre.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| `groupings[n].id must be lowercase letters, digits and -` | Une majuscule, une espace ou un autre signe dans l'id | Le renommer |
| `groupings[n].refs[k] must be a reference without spaces` | Une espace dans une référence | Utiliser l'id tel que le jeu l'écrit |
| Une référence affiche « not declared » | Le jeu ne la connaît pas, ou elle est écrite par du code | Vérifier l'id ; un id fait par du code reste « not declared » |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`games/<id>/groupings.json` seulement (sur un Studio hébergé, un pan à lui seul).

<a name="recovery"></a>

## Revenir en arrière

Undo dans l'en-tête ne couvre pas les regroupements : passez par git (`git checkout -- games/<id>/groupings.json`) ou
supprimez le regroupement.

<a name="references"></a>

## Références

- [`tools/studio/scenario-map.ts`](../../tools/studio/scenario-map.ts), [`src/studio/map-tab.ts`](../../src/studio/map-tab.ts).
- Les routes `GET/PUT groupings` et `GET map` : [API du Studio](studio.api.md). La carte du monde et de ses sorties
  est autre chose : [Carte du monde](create.world-map.md).
