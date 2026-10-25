# Dépannage du Bridge et des connecteurs

<a name="conflict-409"></a>

## Le Bridge répond 409

Le Bridge répond par l'erreur 409 quand un signal du même id est déjà enregistré : le doublon est ignoré.

<a name="unavailable-503"></a>

## Le Bridge répond 503

Le Bridge répond par l'erreur 503 quand son stockage est indisponible : le connecteur réessaie plus tard.
