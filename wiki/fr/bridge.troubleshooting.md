# Dépannage du Bridge et des connecteurs

Ce que veulent dire les codes d’erreur d’un Reality Bridge, et quoi faire. Le Bridge est le serveur qui porte les
signaux du monde réel (un e-mail, un badge, un terminal) jusqu’au jeu d’un joueur ; ses connecteurs envoient ces
signaux. Cette page traite des réponses du Bridge lui-même, pas de celles du Studio hébergé, qui a des codes de mêmes
numéros.

<a name="conflict-409"></a>

## Le Bridge répond 409

Une 409 du Bridge veut dire « c’est déjà fait », jamais « votre copie est périmée » :

- `{"error": "pairing", "message": "already confirmed"}` sur `POST /v1/pairings/<code>/confirm` : le code d’appairage
  a déjà été confirmé, par ce connecteur ou par un autre. Deux connecteurs qui confirment le même code en même temps :
  l’un gagne, l’autre reçoit cette 409. Le joueur est appairé ; rien à refaire.
- `{"error": "duplicate", …"this run was submitted already (the first submitter keeps it)"}` sur `POST /v1/runs` : le
  même run de speedrun a été envoyé deux fois, et le second est refusé au moment d’entrer dans la file. Le premier
  envoi garde sa place dans la file ; il n’est classé qu’une fois que le worker des speedruns l’a trouvé valide.
- `{"error": "trust", …"only a run the worker found valid can be moderated"}` : un modérateur a voulu valider un run
  que le worker des speedruns n’a pas trouvé valide.

Aucune ne perd de données : la première action tient. Pour le vérifier, lisez le journal du Bridge (des lignes JSON
sur sa sortie standard) : `"event":"pairing.confirmed"` avec le `playerId` pour l’appairage, `"event":"run.submitted"`
(puis `run.verified`) pour le run. Le Bridge n’a pas de route d’opérateur qui lise l’état d’un appairage. N’appelez
jamais `GET /v1/pairings/<code>` pour vérifier : c’est la récupération unique du joueur, et l’appeler remet, et
consomme, la capacité du joueur.

<a name="unavailable-503"></a>

## Le Bridge répond 503

- `{"error": "busy", "message": "the store is busy: try again in a second"}`, avec `Retry-After: 1` : un autre
  processus a gardé le verrou d’écriture du stockage plus longtemps que la requête ne pouvait attendre (SQLite). Rien
  n’a été écrit ; renvoyez-la.
- `GET /readyz` répond 503 `{"status": "unavailable"}` : le stockage ne répond pas. Regardez d’abord la base.
- Depuis la 4.1.20, un Bridge qui perd son bail de maintenance (non renouvelé, ou la connexion à la base qui tient son
  verrou est tombée) retient ses écritures, qui répondent 503, et échoue à `/readyz` jusqu’à ce qu’il reprenne un
  bail (sa ligne de journal `maintenance.lease.lost` dit pourquoi).

<a name="same-event-twice"></a>

## Le même événement est arrivé deux fois

Un connecteur peut envoyer deux fois le même signal (une nouvelle tentative après un délai dépassé, un redémarrage). Le
Bridge ne l’accepte qu’une fois : `POST /v1/signals` répond 202 la première fois, et 200 avec `duplicate` pour un
`dedupeKey` déjà accepté. La sauvegarde du joueur garde la séquence des signaux appliqués, donc un signal n’est jamais
appliqué deux fois dans le jeu.

<a name="connector-down"></a>

## Un connecteur est en panne

- Le jeu continue : un joueur hors ligne, ou sans signal, continue de jouer ; ce qui arrive plus tard s’applique à son
  arrivée.
- Un connecteur lancé avec un port `health` répond à `GET /health` par 200 quand tout va bien, 503 sinon, avec un
  `detail` ; `GET /metrics` sur le même port donne ses compteurs.
- Un connecteur e-mail laisse un message non lu quand le Bridge l’a refusé pour une raison passagère (Bridge absent ou
  occupé, quota) : il est relu au relevé suivant. Un message refusé pour de bon est marqué lu et signalé, pour que vous
  le regardiez. Au-delà d’un quota, le Bridge répond 429 : le connecteur le voit, rien n’est perdu en silence.
