# Voix et matrice héros × langues

L'onglet Voices porte le tableau d'enregistrement des voix, par langue, et sa seconde vue, **Heroes × languages** :
chaque réplique qui dépend du héros, le texte que lit chaque héros dans chaque langue et le clip qui se joue, avec ce
qui manque.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un tableau d'enregistrement sur lequel les comédiens peuvent travailler (CSV en sortie, CSV en retour), et une matrice
qui montre d'un coup d'œil à quel héros il manque une traduction, un clip, ou un choix que fait la langue source.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local, dépôt du moteur ou projet créé. La matrice date de la 4.4.0, en lecture seule, et marche sur tous les
backends : le serveur de dev, un Studio hébergé et le Studio de démo. Le tableau d'enregistrement demande le serveur
de dev. Comment voix et choix du héros s'écrivent dans le jeu : [Voix : par langue et par héros](create.voices.md),
[Héros : plusieurs personnages et choix du héros](create.heroes.md).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).
- Des répliques à id stable ([Voix](create.voices.md)) ; la matrice ne liste que les répliques à id qui dépendent du
  héros.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Voices. `npm run voices` se lance dans le dépôt du moteur.

<a name="steps"></a>

## Étapes

<a name="recording-table"></a>

### Le tableau d'enregistrement

<!-- step: table -->
1. Ouvrez l'onglet Voices, vue **Recording table**, et choisissez la langue (**Language**). Chaque réplique à id
   stable est une ligne : qui la dit, son texte dans cette langue, son clip, et son statut (draft, record, recorded,
   approved), avec le comédien et une note. Un changement est enregistré aussitôt, dans `games/<id>/voices.json`, et
   s'annule. « Find a line… » filtre les lignes ; **Status** filtre par statut.

<!-- step: csv -->
2. **Export CSV** donne le tableau aux comédiens. Rapatriez le leur en ligne de commande :

   ```sh
   # dans le dépôt du moteur
   npm run voices -- import <fichier>
   ```

> [!LIMIT id=table-dev-server]
> Le tableau d'enregistrement demande le serveur de dev (`npm run studio`) : ailleurs, l'onglet dit « The voice table
> needs the dev server (npm run studio). » La matrice, elle, y marche.

<a name="matrix"></a>

### Heroes × languages

<!-- step: matrix -->
3. Passez à la vue **Heroes × languages**. Une ligne par réplique à id qui dépend du héros (un aiguillage ou `{hero}`,
   dans n'importe quelle langue). Une colonne par héros, c'est-à-dire par combinaison des valeurs que prennent les
   drapeaux aiguillés, avec le portrait et le nom de la variante en tête, et par langue. Dans chaque case : le texte
   que lit ce héros et le clip qui se joue, ou le clip qui manque (l'id seul est nommé quand il se joue à sa place).

<!-- step: problems -->
4. **Show** « lines with a problem » garde les lignes qui en signalent un :
   - **untranslated** : une langue n'a pas de texte pour la réplique ;
   - **agreement** : une traduction perd un choix que fait la source (un aiguillage que la source a et que la
     traduction n'a pas) ;
   - **unlisted** : une valeur d'un drapeau qu'aucun aiguillage ne liste, sans défaut `*=` ;
   - un clip qui manque pour un héros.

   **Language** restreint à une langue ; « Find a line… » cherche. La barre compte les répliques, celles qui ont un
   problème, les héros et les langues.

> [!LIMIT id=matrix-bounds]
> La matrice montre 24 combinaisons de héros au plus ; la barre dit combien ont été laissées de côté. Le tableau montre
> 200 lignes au plus : « N more: narrow the search. »

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Avec « lines with a problem », une matrice vide : chaque héros a chaque réplique dans chaque langue, et un clip là où
il en faut un. `npm run voices -- check` dit la même chose en ligne de commande.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| « The hero matrix is not available on this backend. » | Un backend sans la route | Passer par le serveur de dev, un Studio hébergé ou une démo récente |
| Une case nomme l'id seul | Le clip du héros manque ; celui de la réplique simple se joue à sa place | Enregistrer le clip pour ce héros |
| Une ligne signale `agreement` | La traduction a perdu un aiguillage | Remettre l'aiguillage dans la traduction |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`games/<id>/voices.json` (le tableau d'enregistrement). La matrice n'écrit rien.

<a name="recovery"></a>

## Revenir en arrière

Un changement de statut, de comédien ou de note s'annule depuis l'en-tête pendant la session ; sinon git.

<a name="references"></a>

## Références

- [`src/studio/voices.ts`](../../src/studio/voices.ts), [`src/studio/hero-matrix.ts`](../../src/studio/hero-matrix.ts),
  [`src/engine/tools/hero-matrix.ts`](../../src/engine/tools/hero-matrix.ts), [`tools/voices.ts`](../../tools/voices.ts).
- Les routes `GET voices[/:lang]`, `PUT voices/:lang/:id`, `GET voices/:lang/csv` et `GET hero-matrix`
  (`{ langs, flags, columns, rows, truncated? }`) : [API du Studio](studio.api.md).
