# Connecteur Telnet

Le connecteur Telnet ouvre un petit terminal virtuel sur un port TCP : un joueur s’y connecte, tape le code
d’appairage que montre son jeu, puis les commandes que le jeu déclare (`lamp on`), et chaque commande déclarée propose
son signal. Rien de ce qui est tapé n’est jamais exécuté : il n’y a pas de shell derrière. Il est expérimental, comme
tous les connecteurs ([Vue d’ensemble des connecteurs](bridge.connectors.md)).

<a name="what-you-get"></a>

## Ce que vous obtenez

Un processus `quest-n-click-connector telnet` qui écoute sur un port, affiche la bannière et l’invite du jeu, répond aux
commandes de `reality.connectors.telnet`, et propose leurs signaux pour le joueur qui a lié la session.

<a name="context-and-versions"></a>

## Contexte et versions

- Un connecteur à côté d’un Bridge en marche, depuis la 4.1.9 ; cette page s’applique à partir de la 4.2.5 (le nom
  `quest-n-click-connector`).
- **Vérifié sur :** les étapes ont été lancées le 23 octobre 2026 contre un Bridge local du jeu `signals` (macOS, Node
  22.14, moteur 4.4.0, `nc` comme client) : la bannière, `Linked. Resume word, for 30 minutes: R…`, puis `lamp on` a
  répondu « Click. Somewhere in the garden, a lamp glows. » et a été accepté par le Bridge.

> [!LIMIT id=bridge-telnet-clear-text]
> Telnet circule en clair : le code d’appairage et chaque ligne traversent le réseau tels que tapés. Gardez-le sur un
> réseau local, derrière un VPN ou TLS (stunnel), ou préférez [SSH](bridge.connector-ssh.md).

<a name="prerequisites"></a>

## Prérequis

- Un Bridge en marche ([Installer et lancer le Bridge](bridge.install-run.md)) et un jeu dont
  `reality.connectors.telnet` déclare ses commandes ([Signaux et manifeste](bridge.signals-manifest.md#reality-connectors)) :

  ```ts
  telnet: { banner: 'TERMINAL DE LA CABANE.', prompt: 'shed> ', commands: [{ says: 'lamp on', reply: 'Clic.', signal: 'terminal.lamp' }] }
  ```

<a name="where-to-run"></a>

## Où lancer les commandes

`grant` là où est le dossier du Bridge ; le connecteur sur la machine à laquelle se connectent les joueurs, dans un
dossier qui contient sa configuration et son jeton. `npm run connector -- telnet …` dans le dépôt du moteur,
`npx quest-n-click-connector telnet …` avec le paquet.

<a name="steps"></a>

## Étapes

<!-- step: grant -->
1. Donnez au connecteur son jeton, pour les signaux du terminal seulement, avec l’appairage :

   ```sh
   # dans le dépôt du moteur (le dossier du Bridge est .cache/bridge)
   npm run bridge -- grant --connector=shed-telnet --source=terminal --signals=terminal.lamp --pair > telnet.token
   ```

<!-- step: config -->
2. Écrivez sa configuration, `telnet.json` :

   ```json
   {
     "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "telnet.token" },
     "gameId": "signals",
     "limits": { "maxBytes": 4096, "maxPerMinute": 60, "timeoutMs": 5000 },
     "health": { "port": 9301 },
     "telnet": { "port": 2323 }
   }
   ```

<!-- step: run -->
3. Lancez-le :

   ```sh
   # dans le dépôt du moteur
   npm run connector -- telnet --config telnet.json
   ```

   Il journalise `{"event":"telnet.started","connector":"telnet","port":2323}`.

<!-- step: connect -->
4. Connectez-vous comme le ferait un joueur, tapez le code que montre le jeu, puis une commande déclarée :

   ```sh
   # sur une machine qui atteint le port
   nc 127.0.0.1 2323
   ```

   Le terminal affiche la bannière, demande le code d’appairage, répond `Linked. Resume word, for 30 minutes:
   RABCD-EFGH`, puis `Type help to see what this terminal knows.` et l’invite. `lamp on` affiche la réponse de la
   commande et propose `terminal.lamp`.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `GET http://127.0.0.1:9301/health` répond 200 `{"connector":"telnet","ok":true,"detail":"<n> session(s) on port
  2323",…}` ; `GET /metrics` donne `proposed`, `accepted`, `duplicates`, `refused`, `rejectedInputs`, `retries`.
- Le Bridge journalise `"event":"pairing.confirmed"`, puis `"event":"signal.accepted"` avec `terminal.lamp`.

<a name="common-errors"></a>

## Erreurs fréquentes

| Ce que dit le terminal | Cause | Correction |
|---|---|---|
| `That code does not work. Try again.`, puis `Too many wrong codes. Goodbye.` | Un code faux ou expiré, trois fois sur une connexion | Un nouveau code depuis la ligne World link du jeu |
| La connexion est refusée d’emblée | Six codes faux depuis cette adresse en dix minutes, reconnexions comprises ; ou 3 connexions déjà ouvertes depuis elle, ou 20 en tout | Attendre ; fermer les sessions inactives |
| `Unknown command. Type help.` | Pas une commande déclarée (comparée en entier, en minuscules) | `help` les liste |
| `(the world did not answer: <code>)` | Le Bridge a refusé la proposition (`denied`, `player`, `bridge-quota`, `unreachable`…) | Lire les journaux du connecteur et du Bridge |
| La connexion se ferme au bout d’une minute | Aucune ligne complète pendant une minute, ou pas lié en 20 secondes | Taper le code tout de suite |
| `Slow down.` / `Line too long (512 bytes at most).` | Plus de 100 lignes par minute / une ligne de plus de 512 octets | Taper moins, plus court |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Rien sur disque. Les mots de reprise vivent en mémoire pendant 30 minutes ; rien de ce qui est tapé n’est gardé.

<a name="recovery"></a>

## Reprise ou retour en arrière

Arrêtez le processus (SIGTERM : il ne lit plus rien, vide son travail, sort avec le code 0). Si son jeton a fuité,
révoquez-le sur le Bridge (`revoke --token=<id de révocation>`) et donnez-en un nouveau.

<a name="behaviour"></a>

## Référence : ce que fait le terminal

- `telnet: { "port": 2323, "host": "127.0.0.1", "limits": { … } }` : `host` vaut `127.0.0.1` par défaut ; `limits`
  remplace, par leur nom, les limites du terminal ci-dessous.
- Un serveur TCP qui refuse toutes les options Telnet et filtre les octets du protocole.
- Le joueur tape le code d’appairage (ou le mot de reprise affiché lors d’un appairage précédent), puis les commandes
  que le jeu déclare. `help`, `clear` et `exit` (ou `quit`) sont les commandes propres au terminal.
- Chaque ligne tapée est un fait nouveau : sa clé est `sha256('telnet:' + session + ':' + numéro de ligne)`. Une
  commande tapée deux fois propose son signal deux fois ; c’est le `once` du jeu qui décide s’il agit deux fois.

| Limite (nom dans `limits`) | Défaut |
|---|---|
| Une ligne (`maxLine`) | 512 octets ; une ligne plus longue est refusée en entier, `Line too long (512 bytes at most).` |
| Les lignes (`linesPerMinute`) | 100 par minute ; au-delà, `Slow down.` et la ligne est abandonnée |
| L’entrée (`bytesPerSecond`) | 64 Ko reçus par seconde ; au-delà, la connexion est fermée |
| Le temps pour se lier (`pairMs`) | 20 secondes |
| Le temps entre deux lignes (`idleMs`) | 1 minute |
| Une session (`sessionMs`) | 30 minutes |
| Connexions par adresse (`perAddress`) / en tout (`maxConnections`) | 3 / 20 |
| Codes faux par adresse (`triesPerAddress` en `triesWindowMs`) | 6 en 10 minutes, reconnexions comprises |

> [!GUARANTEE id=bridge-telnet-address-limits]
> Une adresse tient trois connexions au plus, et ses codes faux sont comptés à travers les reconnexions ; une
> connexion non liée est fermée.

<a name="privacy"></a>

## Ce qu’il garde

Rien de ce qui est tapé n’est gardé : une ligne est comparée aux commandes du jeu puis oubliée ; le Bridge ne reçoit
que le nom du signal. Un mot de reprise lie une session suivante au même joueur pendant 30 minutes, en mémoire.
L’adresse du client sert au système d’exploitation pour la connexion, et est comptée en mémoire pour les limites ; le
connecteur n’en garde aucune liste.

<a name="references"></a>

## Références

- Le code : [`connectors/src/telnet/connector.ts`](../../connectors/src/telnet/connector.ts),
  [`connectors/src/terminal/`](../../connectors/src/terminal/guard.ts) (limites, lignes, le shell virtuel).
- Le modèle de menace : [`docs/dev/threat-models/telnet.md`](../../docs/dev/threat-models/telnet.md).
- Testé par [`tests/connectors-terminal.test.ts`](../../tests/connectors-terminal.test.ts) : inondations, clients lents,
  mille connexions.
