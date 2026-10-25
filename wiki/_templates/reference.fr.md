<!--
Modèle : référence, docs/dev/PLAN-4.5-WIKI.md annexe B. Une section par identifiant (une commande, un champ, une
variable, une route), chacune avec son identifiant de section, l'identifiant en minuscules séparées par des tirets ;
ses sous-titres n'en ont pas.
Listez aussi les identifiants dans le champ `identifiers` du manifeste. La version où un identifiant est apparu se met
dans un commentaire HTML sur la ligne qui suit son ancre, `applies: .. since 4.5.0` comme ci-dessous (son
`featureSince` ; un intervalle avant `since` restreint les versions où il est vrai). Copiez-le dans wiki/fr/<id>.md (jumeau anglais
dans wiki/en/), supprimez ces commentaires.
-->

# Variables d'environnement

<a name="example-identifier"></a>
<!-- applies: .. since 4.5.0 -->

## `EXAMPLE_IDENTIFIER`

### Forme

Comment il s'écrit : son type, sa syntaxe.

### Valeurs et défaut

Les valeurs acceptées, et la valeur quand il est absent.

### Contraintes

Ce qui est refusé, et le message.

### Exemple minimal

```sh
# dans le projet créé
EXAMPLE_IDENTIFIER=value npm run build
```

### Comportement face à un champ inconnu

Refusé, ignoré ou conservé : dites lequel.

### Depuis

La version où la fonctionnalité est apparue (`featureSince`).

> [!LIMIT id=example-limit]
> Là où cet identifiant ne s'applique pas.

<a name="related"></a>

## Identifiants liés

- Les identifiants qui se lisent avec celui-ci.
