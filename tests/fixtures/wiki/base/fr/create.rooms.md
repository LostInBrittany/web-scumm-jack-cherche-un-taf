# Salles

<a name="walkable-zones"></a>

## Zones de marche

Le héros marche dans les zones. Une zone s'arrête à [une porte](create.exits.md#doors) ; chaque commande est dans [le DSL](create.dsl.md).
La sauvegarde est écrite par [save.ts](../../src/engine/core/save.ts#L1).

> [!LIMIT id=no-diagonal]
> Une zone est un polygone ; une courbe se trace avec plusieurs points.

<a name="checking"></a>

## Vérifier

Retour aux [zones](#walkable-zones). Laissez une note depuis [le Studio](studio.notes.md).

![Une salle](../images/room.png "Le hall") et [![un badge](../images/room.png)](create.exits.md#doors "Sorties").
Voir [le code](./../../src/engine/core/save.ts "save") et [les sorties](./create.exits.md).
