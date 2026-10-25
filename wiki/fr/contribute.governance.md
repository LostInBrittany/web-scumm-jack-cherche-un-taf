# Gouvernance

Qui décide dans quest'n'click, comment une décision est consignée, et ce qu'une personne doit faire qu'aucun assistant
ni aucun test ne peut faire à sa place. Le projet a un seul mainteneur, @wanoo ; l'essentiel de son code est écrit par
des assistants IA et relu par des barrières, par une seconde lecture et par ce mainteneur.

<a name="why"></a>

## Pourquoi ça fonctionne ainsi

**Une personne décide, par écrit.** Le mainteneur tranche chaque désaccord (D3). Une décision est une ligne datée de
[`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md), écrite par l'assistant qui l'a reçue et jamais sans décision
humaine, avec les mots du mainteneur cités, souvent en français avec l'anglais à côté. L'échange qui y mène vit dans
`docs/dev/LOG.md`, committé, en anglais (D3). Une décision qui semblerait surprenante sans son contexte reçoit aussi un
ADR dans `docs/dev/adr/` ([Décisions et ADR](contribute.decisions.md)). Tout ce qui est dans `docs/dev/` est de la
documentation publique de développement : rien de privé n'y est écrit.

**La preuve l'emporte sur l'opinion.** Quand deux lectures divergent, celle qui a une mesure, un test qui échoue ou une
reproduction l'emporte par défaut ; le mainteneur peut toujours trancher autrement. Une relecture qui n'a lancé aucune
commande est une opinion, et le dit. Un assistant qui n'a pas pu lancer une vérification (pas de navigateur, pas de
Python) le dit au lieu de la sauter en silence.

**Un second contexte relit avant la fusion.** Un changement d'un certain poids est relu par un second contexte
indépendant (en pratique une autre session d'IA ou un sous-agent qui ne l'a pas écrit), qui reproduit avant de juger,
puis par le mainteneur. Le LOG consigne chaque « second reading » et ce qu'elle a trouvé.

**Les gens vérifient ce que les machines ne peuvent pas, et le disent.** Sept vérifications, puis davantage, demandent
une personne ou un vrai appareil : un lecteur d'écran, Safari hors ligne, un vrai téléphone, des testeurs, des voix
enregistrées, l'écoute, un tag signé. Elles sont **rapportées, pas bloquantes** (D12) : une release sort sur ses
barrières automatiques et ses notes listent chaque passe non faite. Chaque passe qu'une personne fait est une issue
GitHub ouverte, étiquetée `field-pass` ; le mainteneur la ferme une fois le test fait et son rapport vérifié
([Passes de terrain](contribute.field-passes.md)). Une surface n'est dite stable qu'avec sa preuve machine et sa passe
`passed` (D18, appliqué par D38 au périmètre stable réduit de la 4.2.0).

**Une signature demande un oui à chaque fois.** Les tags de release sont signés avec la clé SSH du mainteneur depuis la
4.2 (D30 l'avait repoussé jusque-là). La racine de confiance, `.github/allowed_signers`, nomme la clé logicielle
`id_ed25519` du mainteneur, qui vit sur la machine où travaille l'assistant : une signature prouve que la clé a servi,
**pas que le mainteneur a approuvé** (D37). L'approbation est donc une procédure : chaque tag signé demande le oui
explicite du mainteneur, consigné là où il a été donné, et un assistant n'écrit jamais seul une attestation de report
approuvée. « tu peux signer la 4.5 » est le oui pour la v4.5.0 seulement (D50). Voir
[Publier une release](contribute.releasing.md).

<a name="who-reviews-what"></a>

## Qui relit quoi

| Quoi | Relu par |
|---|---|
| Chaque pull request | Les barrières de la CI (`pr-gate`), voir [La CI expliquée](contribute.ci.md) |
| `tests/quality-baseline.json`, `tests/api-surface.json`, `docs/dev/mutants.json`, `vite.config.ts`, `.github/` | Le mainteneur, par `.github/CODEOWNERS` (le comportement figé, la surface publique, les survivants de mutation nommés, les seuils de couverture, les workflows) |
| Un plan, une release, une branche non triviale | Un second contexte, puis le mainteneur |
| Une passe de terrain | La personne qui l'a faite, puis le mainteneur, qui ferme son issue |
| Une paire de traductions ou la portée d'une garantie dans le wiki | Consignées dans `wiki/translations.json` / `wiki/reviews.json` avec qui l'a lue, une personne ou une IA ([Écrire la documentation](contribute.writing-docs.md#reviews)) |

<a name="charter"></a>

## La charte de la v3

[`docs/dev/CHARTER.md`](../../docs/dev/CHARTER.md) a fixé les règles quand la v3 était développée par deux assistants
IA, Claude et Codex, sous l'arbitrage du mainteneur. Ses règles, en bref :

1. **Rôles** : deux assistants, mêmes règles ; l'humain tranche, chaque désaccord finit en ligne de `DECISIONS.md`.
2. **Une seule balle** : la dernière entrée du LOG finit par `→ next: Claude|Codex|human` ; celui qui n'a pas la balle
   ne touche pas à l'arbre.
3. **Branches** : `main` est la branche de release depuis la v3.0.0 (D7) ; depuis la 3.7.1, une branche est nommée par
   son genre (`feature/`, `fix/`, `docs/`, `test/`, `refactor/`, `release/`).
4. **Une proposition** dit son but, ce qui change, ce qu'elle casse et la migration, ses mesures, les commandes lancées
   avec leur sortie, et ce qu'elle ne fait pas.
5. **Une relecture** reproduit avant de juger, puis classe ses constats `blocker` / `should` / `nit`, chacun avec sa
   preuve.
6. **La preuve l'emporte sur l'opinion.**
7. **Les commandes de vérité** (`validate`, `solve`, `test`, `build`, l'e2e sur un build de production…) sont
   consignées dans l'entrée.
8. **Identité dans git** : un trailer qui nomme l'agent ; les messages de commit disent ce qui change pour le joueur ou
   l'auteur.
9. **Dépôt public** : aucun nom privé, aucun contenu privé ; `npm run audit` avant chaque commit.
10. **Périmètre de la v3** : une rupture arrive avec sa migration ; pas de Phaser, pas de second format de dialogue,
    pas de script en temps réel.
11. **La doc fait partie du changement.**
12. **Règle du silence** : une vérification qui n'a pas pu être lancée est dite.

> [!LIMIT id=charter-dated]
> La formulation de la charte est datée : elle décrit la période de la v3, à deux assistants et avec un échange « à une
> seule balle ». Depuis D9 (4 octobre 2026), un assistant développe une branche à la fois et la fusionne sur CI verte,
> et les commits récents portent une ligne `Co-Authored-By` plutôt que le trailer `Agent:` de la charte. Ses principes
> (D3, la preuve, la règle du silence, le contenu public) tiennent toujours ; le mainteneur ne l'a pas réécrite.

<a name="alternatives"></a>

## Alternatives écartées

- **Des barrières humaines bloquantes.** Écartées par D12 : une release attendrait l'agenda d'un testeur. À la place,
  chaque passe non faite est dite dans les notes de release, et une issue `field-pass` ouverte est une passe non faite.
- **Une clé matérielle comme racine de confiance.** Préférée, mais pas sous la main quand la 4.1.20 est sortie ; la clé
  logicielle a été acceptée avec sa limite dite (D37). Un passage à `id_ed25519_sk` est sa propre pull request, qui ne
  touche que `allowed_signers`.

<a name="decisions"></a>

## Décisions et ADR

- D3 (l'arbitrage, l'échange en anglais), D9 (la cadence), D12 (les passes rapportées), D18 et D38 (ce que demande
  « stable »), D30 et D37 (les signatures), D50 (la documentation) : [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
- [ADR 0024](../../docs/dev/adr/0024-pass-surfaces-and-carry-attestations.md) : une passe est liée à sa surface, et
  reportée seulement par une attestation signée.
