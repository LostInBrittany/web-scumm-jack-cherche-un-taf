# Connecteur SSH

Le connecteur SSH ouvre un terminal virtuel en SSH : un joueur se connecte avec, comme mot de passe, le code
d’appairage que montre son jeu (ou avec une clé publique que l’opérateur a déclarée pour lui), puis tape les commandes
que le jeu déclare, et lit les fichiers du disque virtuel du jeu avec `ls`, `cd` et `cat`. Rien de ce qui est tapé
n’est jamais exécuté : il n’y a pas de shell derrière. Il est expérimental, comme tous les connecteurs ([Vue d’ensemble des connecteurs](bridge.connectors.md)).

<a name="what-you-get"></a>

## Ce que vous obtenez

Un processus `quest-n-click-connector ssh` qui écoute sur un port avec sa propre clé d’hôte, répond aux commandes de
`reality.connectors.ssh` et montre ses `files`, et propose les signaux des commandes pour le joueur connecté.
Contrairement à [Telnet](bridge.connector-telnet.md), ce qui est tapé voyage chiffré.

<a name="context-and-versions"></a>

## Contexte et versions

- Un connecteur à côté d’un Bridge en marche, depuis la 4.1.9 ; cette page s’applique à partir de la 4.2.5 (le nom
  `quest-n-click-connector`).
- `ssh2` (pur JavaScript, MIT) porte le protocole ; ses parties natives facultatives sont refusées
  (`connectors/vendor/`).
- **Vérifié sur : non rejoué pour cette page.** La CI le joue depuis l’archive de la release
  (`npm run connector-archive-e2e` : le code d’appairage comme mot de passe, les commandes, un fichier du disque
  virtuel) et sous inondation dans `tests/connectors-ssh.test.ts` ; personne ne l’a encore fait tourner sur un réseau.

<a name="prerequisites"></a>

## Prérequis

- Un Bridge en marche ([Installer et lancer le Bridge](bridge.install-run.md)) et un jeu dont `reality.connectors.ssh`
  déclare ses commandes et ses fichiers ([Signaux et manifeste](bridge.signals-manifest.md#reality-connectors)) :

  ```ts
  ssh: {
    prompt: 'shed$ ',
    commands: [{ says: 'lamp on', reply: 'Clic.', signal: 'terminal.lamp' }],
    files: { '/notes/lamp.txt': 'La lampe obéit à deux mots : lamp on.' },
  }
  ```

- `ssh-keygen`, pour créer la clé d’hôte du connecteur.

<a name="where-to-run"></a>

## Où lancer les commandes

`grant` là où est le dossier du Bridge ; le connecteur sur la machine à laquelle se connectent les joueurs, dans un
dossier qui contient sa configuration, son jeton et sa clé d’hôte (mode 600). `npm run connector -- ssh …` dans le
dépôt du moteur, `npx quest-n-click-connector ssh …` avec le paquet.

<a name="steps"></a>

## Étapes

<!-- step: grant -->
1. Donnez au connecteur son jeton, avec l’appairage :

   ```sh
   # dans le dépôt du moteur (le dossier du Bridge est .cache/bridge)
   npm run bridge -- grant --connector=shed-ssh --source=terminal --signals=terminal.lamp --pair > ssh.token
   ```

<!-- step: host-key -->
2. Créez la clé d’hôte du connecteur :

   ```sh
   # dans le dossier du connecteur
   ssh-keygen -t ed25519 -f ssh_host_ed25519_key -N ''
   ```

<!-- step: config -->
3. Écrivez sa configuration, `ssh.json`. `keys` est facultatif : une clé publique par joueur, pour les joueurs qui
   préfèrent ne pas taper de code :

   ```json
   {
     "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "ssh.token" },
     "gameId": "signals",
     "health": { "port": 9303 },
     "ssh": { "port": 2222, "hostKeyFile": "ssh_host_ed25519_key", "keys": [{ "key": "ssh-ed25519 AAAA…", "playerId": "p-0123456789abcdef" }] }
   }
   ```

<!-- step: run -->
4. Lancez-le :

   ```sh
   # dans le dépôt du moteur
   npm run connector -- ssh --config ssh.json
   ```

<!-- step: connect -->
5. Connectez-vous comme le ferait un joueur ; le nom d’utilisateur n’a pas d’importance, le mot de passe est le code
   que montre le jeu :

   ```sh
   # sur une machine qui atteint le port
   ssh -p 2222 player@127.0.0.1
   ```

   Après la bannière, `lamp on` affiche la réponse de la commande et propose `terminal.lamp` ; `ls /notes` et
   `cat /notes/lamp.txt` lisent le disque virtuel.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `GET http://127.0.0.1:9303/health` répond 200 ; `GET /metrics` compte les propositions et les refus.
- Le Bridge journalise `"event":"pairing.confirmed"` (pour une connexion par mot de passe avec un code), puis
  `"event":"signal.accepted"`.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `ssh: "hostKeyFile" names the host key` au démarrage | Pas de clé d’hôte dans la configuration | L’étape 2, puis `hostKeyFile` |
| `Permission denied`, puis la connexion se ferme | Un code faux ou expiré, un mot de reprise au-delà de ses 30 minutes, ou une clé non déclarée, trois fois | Un nouveau code depuis le jeu |
| La connexion est refusée d’emblée | Six mots de passe faux depuis cette adresse en dix minutes, reconnexions comprises ; 3 connexions déjà ouvertes depuis elle, ou 20 en tout | Attendre |
| Une commande donnée sur la ligne `ssh`, `sftp`, `scp` ou un transfert de port est refusé | Seul un terminal interactif s’ouvre | Se connecter sans commande |
| La connexion se ferme | Pas authentifié en 20 secondes ; authentifié sans ouvrir de terminal pendant une minute | Ouvrir le terminal tout de suite |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Rien sur disque. Les mots de reprise vivent en mémoire pendant 30 minutes ; rien de ce qui est tapé n’est gardé.

<a name="recovery"></a>

## Reprise ou retour en arrière

Arrêtez le processus (SIGTERM). La clé déclarée d’un joueur se retire de `ssh.keys`, puis on redémarre le connecteur.
Si le jeton du connecteur a fuité, révoquez-le sur le Bridge et donnez-en un nouveau ; si sa clé d’hôte a fuité,
créez-en une nouvelle (les clients SSH des joueurs avertiront que la clé d’hôte a changé).

<a name="behaviour"></a>

## Référence : ce que fait le terminal

- `ssh: { "port", "host" (127.0.0.1), "hostKeyFile", "keys"?, "limits"? }`.
- Le mot de passe est un code d’appairage ou un mot de reprise (trois essais par connexion) ; ou une clé publique que
  l’opérateur a déclarée pour un joueur (`keys`).
- Seul un terminal s’ouvre : les commandes du jeu, `help`, `clear`, `exit`, et `ls`, `cd`, `pwd`, `cat` sur le disque
  virtuel du jeu (`files`). `exec`, `sftp` (tout sous-système), l’environnement, l’agent, X11 et les transferts de
  port sont refusés. Une session avec un seul shell par connexion.
- Les chemins ne sortent jamais de l’arbre virtuel, rien de ce qui est tapé n’est interprété. La sortie est coupée à
  la largeur du terminal (de 10 à 500 colonnes, 80 par défaut).
- Les mêmes limites que Telnet (une ligne de 512 octets, 100 lignes par minute, 64 Ko reçus par seconde, 20 secondes
  pour se connecter, une minute entre deux lignes, 30 minutes par session, 3 connexions par adresse et 20 en tout,
  6 mots de passe faux par adresse en 10 minutes), chacune remplaçable dans `limits` par son nom
  ([Telnet](bridge.connector-telnet.md#behaviour)).
- Chaque ligne tapée est un fait nouveau : sa clé est `sha256('ssh:' + session + ':' + numéro de ligne)`.

> [!GUARANTEE id=bridge-ssh-terminal-only]
> Le connecteur SSH refuse `exec`, `sftp` et les transferts de port ; seul son terminal virtuel s’ouvre.

<a name="privacy"></a>

## Ce qu’il garde

Rien de ce qui est tapé n’est gardé : une ligne est comparée aux commandes du jeu puis oubliée ; le Bridge ne reçoit
que le nom du signal. Un mot de reprise lie une session suivante au même joueur pendant 30 minutes, en mémoire. Les
clés publiques qu’un opérateur déclare pour des joueurs vivent dans la configuration du connecteur jusqu’à ce que
l’opérateur les retire. L’adresse du client sert à la connexion et est comptée en mémoire pour les limites ; le
connecteur n’en garde aucune liste.

<a name="references"></a>

## Références

- Le code : [`connectors/src/ssh/connector.ts`](../../connectors/src/ssh/connector.ts),
  [`connectors/src/terminal/`](../../connectors/src/terminal/guard.ts).
- Le modèle de menace : [`docs/dev/threat-models/ssh.md`](../../docs/dev/threat-models/ssh.md).
- Testé par [`tests/connectors-ssh.test.ts`](../../tests/connectors-ssh.test.ts).
