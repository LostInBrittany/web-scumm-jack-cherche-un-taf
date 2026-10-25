# Confidentialité

Ce qu’un jeu quest'n'click, son Bridge Reality et ses connecteurs gardent sur un joueur, où, combien de temps, et
comment l’effacer. Vrai depuis la 4.1.16 (les runs de speedrun gardés dans le stockage SQL du Bridge) ; le reste dit
depuis quand.

<a name="overview"></a>

## Qui répond de quoi

Le logiciel garde peu de choses, et cette page dit exactement lesquelles, pour que celui qui fait tourner un jeu
puisse le dire à ses joueurs. L’**opérateur** qui fait tourner un Bridge et ses connecteurs est celui qui répond de
ces données devant les joueurs. Le site qui sert un jeu (GitHub Pages, Clever Cloud, tout hébergeur) a ses propres
journaux de serveur, qui sont ceux de l’hébergeur, pas du moteur.

Un jeu **sans** Reality (`reality` dans son contenu), sans mondes Remix du jour ou mystère et sans classements en ligne
ne garde rien en dehors de l’appareil du joueur : le moteur n’a ni mesure d’audience, ni pistage, ni compte, et il ne
récupère que ses propres fichiers depuis le site qui le sert.

<a name="device"></a>

## Sur l’appareil du joueur

- **La sauvegarde et les sessions** vivent dans le stockage du navigateur (IndexedDB `web-scumm-saves` ; le stockage
  local quand IndexedDB n’est pas disponible), sur l’appareil seulement.
- **Les réglages et la langue choisie** vivent dans le stockage local (`<jeu>.settings`, `<jeu>.lang`).
- **Les records de speedrun** vivent dans IndexedDB (`web-scumm-runs`).
- **Les fichiers du jeu** vivent dans le cache du navigateur, pour jouer hors ligne.
- **Avec un lien au monde** (un jeu Reality), la sauvegarde contient aussi le `playerId` pseudonyme donné par le
  Bridge (`p-` et 16 chiffres hexadécimaux, tiré de rien qui concerne la personne), le curseur de livraison et les
  identifiants des signaux appliqués : jamais un email, un jeton, un message ou un badge. La capacité qui lit les
  signaux du joueur est gardée dans le stockage local (`<jeu>:reality-link`).

**Effacer :** **Unlink this game** dans le menu de pause (le libellé anglais par défaut ; un jeu peut le traduire) révoque
le lien sur le Bridge ; effacer les données du site dans le
navigateur retire le reste (Recommencer n’efface que la sauvegarde automatique, pas les emplacements ni les records).

> [!LIMIT id=device-storage-browser-rules]
> C’est le navigateur qui décide de la durée de vie des données d’un site : effacer les données du site, la navigation
> privée, un appareil à court de place, ou, dans un onglet Safari (pas un jeu ajouté à l’écran d’accueil), sept jours
> d’utilisation de Safari sans visite ([WebKit](https://webkit.org/tracking-prevention/)) efface sauvegardes et records avec tout le reste.

<a name="bridge"></a>

## Sur le Bridge

Un Bridge (le serveur Reality d’un jeu) garde, par joueur : le `playerId`, le SHA-256 de sa capacité, son expiration ;
par signal : son identifiant, sa séquence, son nom, sa source, la clé de dédoublonnage du connecteur (un SHA-256 pour
les connecteurs fournis), l’empreinte de ce que le connecteur a vu (`evidenceHash`), l’enveloppe signée, le contenu du
signal tel qu’accepté (pour le signer de nouveau après une rotation de clé), et les heures. Jamais un jeton ni un
email. Un code d’appairage vit dix minutes par défaut. Le journal du Bridge est fait de lignes JSON qui nomment des
événements et des identifiants pseudonymes, sans secret.

L’endroit dépend du stockage choisi par l’opérateur :

| Stockage | Où | Combien de temps |
|---|---|---|
| SQLite (profil `local`, celui de `npm run bridge` par défaut) | un fichier, mode 0600 | Chaque signal est gardé : un stockage SQL n’a pas encore de rétention |
| Postgres (profil `distributed`, expérimental) | la base de l’opérateur | Pareil : pas encore de rétention |
| Le journal en lignes JSON (une configuration écrite avant la 4.1.10) | `journal.jsonl` à côté de la configuration du Bridge | Jusqu’à ce que `compact --retention-days=<N>` (90 par défaut) retire les signaux acquittés plus vieux que N jours ; le dernier signal d’un joueur reste |

Une sauvegarde du Bridge contient les mêmes données que le stockage d’où elle vient.

<a name="runs"></a>

## Classements de speedrun

Un Bridge avec des classements garde chaque run envoyé dans son stockage SQL : le jeu, la catégorie, la graine et les
entrées du run, le verdict, et un **pseudonyme** (2 à 32 lettres, chiffres, espaces, `_ . -` ; un email est refusé).
Les pseudonymes ne sont pas authentifiés, et le Bridge ne connaît aucune identité derrière eux. L’enveloppe du run
est jetée une fois son verdict enregistré. Un classement garde un run 90 jours par défaut (`retentionDays`), et le
supprime sur demande avec le jeton donné à l’envoi (`DELETE /v1/runs/<id>` avec `x-delete-token`). La limite de débit
reconnaît un client par un HMAC de son adresse, jamais l’adresse. Les jetons des mondes du jour et mystère sont gardés
dans le même stockage pendant `retentionDays` (30 par défaut).

<a name="connectors"></a>

## Connecteurs

Ce qui sort de n’importe quel connecteur vers le Bridge : le nom du signal, le joueur, la source, la clé de
dédoublonnage, l’heure, et le SHA-256 du contenu vu par le connecteur (`evidenceHash`) ; jamais le contenu, le message,
la ligne tapée ni le badge.

- **Email, mode webhook** : le message est lu en mémoire puis jeté ; rien n’est écrit.
- **Email, mode IMAP** : le message reste dans la boîte de l’opérateur, là où il est arrivé. Avec `keepDays: 0` (par
  défaut), il est supprimé dès que son signal est accepté (ou trouvé déjà accepté) ; avec `keepDays: N`, après N
  jours. Un message refusé est marqué et gardé pour l’opérateur, qui le supprime. L’expéditeur qui a envoyé un code
  d’appairage est retenu sous forme de SHA-256 salé de son adresse (le sel est aléatoire et vit le temps du processus)
  associé au `playerId`, en mémoire, pendant `linkDays` (30 par défaut) ; un redémarrage l’oublie. L’adresse, le sujet
  et le texte ne sont jamais journalisés ni envoyés au Bridge (seulement une empreinte du Message-ID et le numéro de
  la réponse, de nouveau hachés en `evidenceHash`). Aucune réponse n’est envoyée.
- **Telnet et SSH** : rien de ce qui est tapé n’est gardé ; une ligne est comparée aux commandes du jeu puis oubliée,
  et le Bridge ne reçoit que le nom du signal. Un mot de reprise relie une session ultérieure au même joueur pendant
  30 minutes, en mémoire. Les clés publiques qu’un opérateur déclare pour des joueurs (`ssh.keys`) restent dans la
  configuration du connecteur jusqu’à ce qu’il les retire. L’adresse du client ne sert qu’à la connexion ; le
  connecteur n’en garde aucune liste.
- **Open Badges** : le badge et les documents vers lesquels il pointe sont récupérés, vérifiés puis jetés ; seul un
  verdict sort du connecteur, avec une empreinte de l’identifiant et de l’émetteur du badge en `evidenceHash`. L’email
  qu’un joueur donne pour correspondre à un destinataire haché est haché avec le sel du badge pour la comparaison,
  puis jeté : jamais gardé, journalisé ni envoyé. Les listes de révocation et de statut (celles d’un émetteur, pas
  d’une personne) sont gardées en cache un jour au plus. Les adresses qui postent sur le formulaire sont comptées en
  mémoire pendant une minute (la limite de débit), puis oubliées.

La page de chaque connecteur dit comment le faire tourner : [Email](bridge.connector-email.md),
[Telnet](bridge.connector-telnet.md), [SSH](bridge.connector-ssh.md),
[Open Badges](bridge.connector-open-badges.md).

<a name="logs"></a>

## Journaux et métriques

Chaque connecteur journalise des lignes JSON d’événements, d’identifiants (`playerId`, noms de signaux, codes de
refus) et de compteurs. Une chaîne qui ressemble à du contenu (une espace, un `@`, une barre oblique) est écrite
`[redacted]` ; les tests vérifient qu’aucune adresse, aucun texte ni aucun secret des données de test n’atteint un
journal. Les métriques (`/metrics`) sont des compteurs en mémoire. La durée de vie des journaux est celle de la
rotation choisie par l’opérateur ; ils ne contiennent aucun contenu à effacer, et un `playerId` y est pseudonyme.

<a name="deleting"></a>

## Effacer les données d’un joueur, partout

1. **Sur le Bridge** : `GET /v1/admin/players/<id>` (avec le jeton de l’opérateur) exporte tout ce qui est gardé sur
   le joueur ; `DELETE /v1/admin/players/<id>` le retire (le lien, les signaux, les acquittements) et ferme ses flux
   en direct. Un locataire entier : `tenant export` et `tenant delete --yes`
   ([la ligne de commande du Bridge](bridge.cli.md)).
2. **Dans une boîte IMAP** : supprimez les messages marqués du joueur, s’il y en a (ceux acceptés sont déjà partis avec
   `keepDays: 0`).
3. **Dans la configuration SSH** : retirez la clé déclarée du joueur, s’il y en a une, et redémarrez le connecteur.
4. **En mémoire** (liens d’expéditeur, mots de reprise) : redémarrer les connecteurs oublie tout.
5. **Un run de classement** : supprimé avec son jeton de suppression ; sinon il part après `retentionDays`.
6. **Sur l’appareil** : le joueur efface la sauvegarde ou les données du site.

> [!LIMIT id=backups-keep-deleted]
> Effacer un joueur le retire du stockage en service, pas des sauvegardes faites avant : la durée de vie des
> sauvegardes est le choix de l’opérateur.

<a name="references"></a>

## Références

- [Le Bridge Reality : ce que c’est](bridge.what-it-is.md), [Garanties](bridge.guarantees.md),
  [Installer et faire tourner le Bridge](bridge.install-run.md#retention).
- [Sauvegardes](play.saves.md), [Speedrun pour les joueurs](play.speedrun.md).
- Le code : [`bridge/src/server.ts`](../../bridge/src/server.ts) (les routes d’administration),
  [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts) (`compact`, `tenant`),
  [`src/engine/dom/reality-ui.ts`](../../src/engine/dom/reality-ui.ts) (le lien sur l’appareil).
