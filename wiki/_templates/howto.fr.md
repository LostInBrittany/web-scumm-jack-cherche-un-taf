<!--
Modèle : procédure, docs/dev/PLAN-4.5-WIKI.md annexe B. Copiez-le dans wiki/fr/<id>.md, son jumeau anglais dans
wiki/en/<id>.md, et gardez les dix titres et leurs identifiants de section. L'en-tête (type, public, contexte,
versions, changement de langue) et le pied de page sont générés depuis le manifeste : ne les écrivez pas. Liez une
autre page par sa source, `create.rooms.md#walkable-zones` ; liez le code par son chemin depuis la racine du dépôt,
`src/engine/core/save.ts`. Chaque bloc de commandes dit d'abord le dossier et le contexte où il se lance.
Une section vraie pour moins de versions que sa page le dit dans un commentaire HTML sur la ligne qui suit son ancre,
comme « Reprise » ci-dessous : `applies: 4.2.2..` (depuis), `applies: 4.2.2..4.4.0` (bornes incluses) ou
`applies: ..4.4.0`, avec `since 4.2.0` après l'intervalle pour la version où la fonction est apparue ; elle reste dans
les versions de sa page, la même dans les deux langues. Un `[!GUARANTEE id]` a son affirmation dans le manifeste,
`{"id", "test": "fichier.test.ts › son nom"}`. Une relecture se note avec qui l'a faite : `npm run wiki -- review-claim <id>
--by <nom> --kind human|ai --relation author|independent` (de même `translations --ack`) ; une page publiée veut la
relecture d'une personne, la vérification d'une IA sur ce qu'elle a écrit n'en est pas une. Un `[!MEASURE id]` donne cinq lignes `- clé: valeur`, les mêmes clés
dans les deux langues : date, version, volume, conditions, source (un lien GitHub à un commit complet de 40
caractères, `blob/<sha>/…`). Un bloc de code marqué `room-example` (le JSON d'une salle, ou
`{"room", "layout", "items", "characters", "verbs", "hero"}` quand elle a besoin de sa géométrie, de ses objets, de
ses acteurs, des verbes propres au jeu ou d'un autre héros) ou `studio-config` (une configuration du Studio Server)
passe par le vrai validateur dans `wiki -- check`. Supprimez ces commentaires.
-->

# Restaurer le Studio sur une installation neuve

<a name="what-you-get"></a>

## Ce que vous obtenez

Une ou deux phrases : l'état dans lequel vous êtes à la fin.

<a name="context-and-versions"></a>

## Contexte et versions

Où cela s'applique (dépôt du moteur, projet créé, Studio local ou hébergé, Bridge) et depuis quelle version : le
`versions.appliesFrom` du manifeste.

<a name="prerequisites"></a>

## Prérequis

- Ce qui doit être installé ou fait avant, chacun avec sa page.

<a name="where-to-run"></a>

## Où lancer les commandes

Le dossier et la machine : « dans le dépôt du moteur, sur votre machine », « dans le projet créé », « sur
l'application Clever Cloud, par `clever ssh` ».

<a name="steps"></a>

## Étapes

<!-- step: first-step -->
1. La première étape essentielle, avec sa commande exacte.

   ```sh
   # dans le projet créé
   npm run validate
   ```

<!-- step: second-step -->
2. La suivante. Chaque étape essentielle garde son identifiant `step`, le même dans les deux langues.

> [!LIMIT id=example-limit]
> Ce que cette procédure ne couvre pas, dit simplement.

> [!GUARANTEE id=example-guarantee]
> Ce que le produit garantit ici, et le test qui le montre (nommé dans le manifeste).

> [!MEASURE id=example-measure]
> Un chiffre, et ce sur quoi il a été mesuré : une observation, jamais une promesse.
> - date: 2026-10-19
> - version: 4.2.3
> - volume: 508 lignes de journal
> - conditions: les plus petits plans, l'organisation de test du mainteneur
> - source: [QUALIF-4.2.3-REFERENCE.md §4](https://github.com/Quest-n-Click/quest-n-click/blob/c00b44fcffe56ffa99f9d2228297414ebe3145ac/docs/dev/QUALIF-4.2.3-REFERENCE.md)

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Ce que vous voyez quand cela a marché, et la commande ou l'écran qui le montre.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Le message exact | Pourquoi | Que faire |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Ce que la procédure écrit, pour savoir quoi sauvegarder ou relire.

<a name="recovery"></a>
<!-- applies: 4.2.2.. -->

## Reprise ou retour arrière

Comment l'annuler, quand c'est possible ; et le dire quand ça ne l'est pas.

<a name="references"></a>

## Références

- Les pages de référence, ADR et fichiers sources sur lesquels cette procédure s'appuie.
