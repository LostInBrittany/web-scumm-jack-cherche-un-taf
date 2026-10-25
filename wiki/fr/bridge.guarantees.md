# Garanties

Ce que le Reality Bridge et le joueur promettent à propos d’un signal : un doublon, l’ordre, une livraison répétée ou
rejouée, un Bridge absent ou occupé, deux tenants côte à côte, et ce qu’un signal fait à la progression d’un jeu et à
sa preuve. Chaque réponse est lue dans le code actuel et, quand un test le montre, rattachée à ce test. Chacune dit où
elle s’arrête.

<a name="at-a-glance"></a>

## En bref

| Question | Réponse | Où ça s’arrête |
|---|---|---|
| Un connecteur envoie deux fois le même signal | Accepté une fois : 202 la première fois, 200 avec `"duplicate": true` ensuite | La clé est connue tant que le stockage garde le signal |
| Dans quel ordre un joueur reçoit-il les signaux ? | Numérotés 1, 2, 3… par joueur, dans l’ordre où le Bridge les a acceptés, appliqués dans cet ordre | Aucun ordre entre joueurs, et l’heure d’un fait extérieur ne réordonne rien |
| La réponse s’est perdue, la page a planté | Relivré depuis la dernière séquence acquittée, reconnu, appliqué une fois | La livraison est au moins une fois, jamais « exactement une fois » |
| Le Bridge est occupé ou absent | 503 `busy` avec `Retry-After: 1` (rien d’écrit), 429 au-delà d’un quota ; le jeu continue | C’est au connecteur de renvoyer ; le Bridge ne met rien en file pour lui |
| Deux tenants sur un même déploiement | Chaque requête est rattachée à un tenant avant toute lecture ; les jetons et signaux de l’un sont refusés par l’autre | Pas de sécurité par ligne dans Postgres ; un processus détient les clés de tous les tenants |
| L’extérieur peut-il bloquer le jeu ? | Non : un signal `required` a une solution de repli, et le jeu est prouvé fermé, par scénario et en adversaire | La preuve couvre les signaux déclarés, pas le comportement des connecteurs |

<a name="duplicates"></a>

## Les doublons

Un connecteur donne à chaque fait une clé de déduplication (`dedupeKey`) : le connecteur e-mail
`sha256('email:' + Message-ID)`, Telnet `sha256('telnet:' + session + ':' + ligne)`, le webhook de démonstration
`<source>:<id>`. Sur `POST /v1/signals`, le Bridge répond **202** la première fois qu’il voit une clé pour un joueur,
et **200** avec le signal gardé et `"duplicate": true` pour une clé déjà acceptée : le même `id`, la même `sequence`,
rien d’écrit.

La recherche, la séquence et l’écriture forment une seule étape. Dans un processus, les propositions pour un joueur
passent une à une (un verrou par joueur) ; entre processus, une transaction de la base s’en charge, adossée à des
contraintes d’unicité sur `(tenant, player, dedupe_key)` et `(tenant, player, sequence)`
(`bridge/migrations/0001.up.sql`). Deux connecteurs, ou deux instances, qui proposent la même clé au même instant :
une seule acceptation.

> [!GUARANTEE id=bridge-duplicate-200]
> Un signal proposé de nouveau avec une `dedupeKey` déjà acceptée pour ce joueur reçoit 200, avec la séquence du
> premier signal et `"duplicate": true` ; le joueur ne le reçoit qu’une fois.

> [!GUARANTEE id=bridge-dedupe-concurrent]
> Cinquante propositions d’une même clé en même temps donnent une acceptation et un identifiant ; cent clés
> distinctes en même temps donnent les séquences 1 à 100, sans partage.

> [!LIMIT id=bridge-dedupe-retention]
> Le Bridge reconnaît une clé tant qu’il garde le signal. Sur le journal JSON-lines, `compact` retire les signaux
> acquittés plus vieux que sa rétention (90 jours par défaut ; le dernier signal d’un joueur reste toujours) : une clé
> renvoyée après cela est un nouveau signal. Un stockage SQL garde tous les signaux (il n’a pas encore de rétention).
> La clé est propre à un joueur : la même clé pour deux joueurs fait deux signaux.

<a name="ordering"></a>

## L’ordre

Chaque joueur a sa propre séquence, contiguë depuis 1, tirée quand le Bridge accepte un signal. Le joueur lit les
signaux par séquence (un flux ou une lecture par curseur, les deux donnent la séquence de chaque signal) et le moteur
les applique dans cet ordre : un signal arrivé avant un trou attend que le trou soit comblé, puis le curseur avance sur
la suite contiguë.

- L’ordre est celui de l’acceptation par le Bridge. Le `occurredAt` d’un connecteur voyage dans le signal à titre
  d’information ; il ne réordonne jamais rien.
- Il n’y a pas d’ordre entre deux joueurs, ni entre deux tenants.
- Avec plusieurs instances, un signal accepté par l’une atteint le flux que tient une autre, dans l’ordre, une fois
  chacun.

> [!GUARANTEE id=bridge-sequences-contiguous]
> Quel que soit l’entrelacement des propositions concurrentes et de leurs répétitions, les séquences d’un joueur sont
> 1..n sans trou ni doublon, et une `dedupeKey` n’est acceptée qu’une fois.

<a name="replay"></a>

## Livraison, accusé de réception et rejeu

La livraison est **au moins une fois, appliquée une fois**. Le transport du joueur tient trois curseurs : *reçu* (la
dernière séquence envoyée par le Bridge), *livré* (la dernière remise au jeu) et *durable* (la dernière acquittée,
après la sauvegarde). Le client vérifie un signal, le remet au moteur, attend que la sauvegarde soit durable, et
seulement alors envoie `POST /v1/ack { through }`. Chaque requête au Bridge, une lecture périodique ou une reconnexion,
part du curseur durable : un signal remis et non acquitté (un refus qui peut passer plus tard, une sauvegarde ratée, un
plantage avant l’accusé) est relivré, avec une attente qui grandit jusqu’à une minute tant que rien ne se règle. Avant
la 4.1.8, le transport partait du curseur livré.

La sauvegarde garde la dernière séquence reçue sans trou et les identifiants appliqués au-dessus
(`GameState.reality`, au plus 1 024 au-dessus du curseur), si bien qu’un signal relivré est reconnu et n’est pas
appliqué deux fois. Un signal est aussi une entrée de la session,
`{ external: { id, sequence, signal, source, receivedAt, playerId } }` : `npm run replay` l’applique hors ligne, sans
Bridge.

> [!GUARANTEE id=bridge-ack-after-durable-save]
> Le client n’acquitte un signal qu’après que la sauvegarde qui le contient est durable, et seulement jusqu’au curseur
> contigu.

> [!GUARANTEE id=bridge-resume-from-durable]
> En polling, un signal remis au jeu et non acquitté est redemandé depuis le curseur acquitté.

> [!GUARANTEE id=bridge-session-replays-offline]
> Une session qui contient des signaux se rejoue hors ligne, sans Bridge, jusqu’au même état.

<a name="unavailability"></a>

## Quand le Bridge est occupé ou absent

| Ce qui arrive | Ce que répond le Bridge | Quoi faire |
|---|---|---|
| Un autre processus garde le verrou d’écriture de SQLite plus de 5 s | 503 `{"error": "busy"}`, `Retry-After: 1` ; rien d’écrit | Renvoyer (les connecteurs le font, avec la même clé) |
| Le stockage ne répond pas | `/readyz` et `/healthz` en 503 `{"status": "unavailable"}` ; `/livez` reste à 200 | Regarder la base |
| Un `serve` a perdu son bail de maintenance (4.1.20) | Ses écritures répondent 503 et `/readyz` échoue jusqu’à ce qu’il reprenne un bail | Lire sa ligne de journal `maintenance.lease.lost` |
| Au-delà du quota d’un connecteur (120 par minute) ou de l’arriéré d’un joueur (1 000 non acquittés) | 429 `quota` ou `pending` | Le connecteur le voit ; rien n’est perdu en silence |
| Une adresse au-delà de 60 requêtes par minute sur les routes ouvertes à tous, ou de 60 authentifications ratées | 429 `rate`, `Retry-After: 60` | Attendre |

Un connecteur renvoie avec la même clé une proposition dont la réponse s’est perdue : trois essais en tout par défaut,
puis un refus qu’il compte (`timeout`, `unreachable`). Le connecteur e-mail laisse un message non lu quand le Bridge l’a
refusé pour une raison passagère, et le relit au relevé suivant. Côté joueur, un jeu hors ligne ou sans signal
continue, et ce qui arrive plus tard s’applique à son arrivée. Une instance tuée ou plantée ne perd rien : une
transaction est validée ou absente (`tests/bridge-fanout.test.ts` tue une instance sur trois pendant 1 000
propositions).

> [!GUARANTEE id=bridge-busy-503]
> Un stockage SQLite occupé plus longtemps que son attente répond 503 avec `Retry-After: 1` en moins de deux secondes.
> Une fois le verrou libre, la proposition suivante est acceptée avec la séquence 1.

> [!LIMIT id=bridge-no-queue-for-connectors]
> Le Bridge ne garde pas une proposition refusée pour plus tard : après un 503 ou un 429, c’est au connecteur de
> renvoyer. Le quota d’un connecteur est compté par instance : avec N instances, un connecteur peut proposer N fois
> son quota.

<a name="tenant-isolation"></a>

## L’isolation des tenants

Un tenant est le jeu d’un opérateur dans un environnement, avec sa propre racine Biscuit, sa clé d’événements, son
jeton d’opérateur, ses quotas et ses révocations ([Plusieurs tenants](bridge.multi-tenant.md)). Sur un serveur qui en
tient plusieurs :

- Une requête est rattachée à son tenant par son `Host` (les `hosts` de chaque tenant), ou par `X-Web-Scumm-Tenant`
  quand `--tenant-header` l’autorise, **avant toute lecture** ; aucun tenant ne correspond : une 404 `tenant`.
- Chaque ligne du stockage porte son tenant, et chaque requête SQL filtre dessus.
- Le jeton d’un connecteur est lié à son tenant (`grant` l’ajoute) : un jeton du tenant A est refusé par le tenant B,
  même quand les deux ont reçu (à tort) la même racine Biscuit.
- Un tenant d’un déploiement partagé signe des `WorldSignalV2`, qui nomment leur tenant : un signal de A présenté à un
  joueur de B est refusé `audience-mismatch`, même sous une clé d’événements partagée.

> [!GUARANTEE id=bridge-tenant-token-bound]
> Un jeton de connecteur lié à son tenant est refusé par un autre tenant (403), même quand les deux tenants partagent
> une racine Biscuit.

> [!GUARANTEE id=bridge-tenant-routing]
> Un serveur qui tient plusieurs tenants route chaque requête par `Host`, par l’en-tête de tenant seulement quand il
> est autorisé, et répond 404 à une requête qui ne nomme aucun de ses tenants.

> [!LIMIT id=bridge-tenant-isolation-scope]
> L’isolation est dans le code du Bridge, pas dans la base : il n’y a pas de sécurité par ligne et par tenant dans
> Postgres, et un processus qui sert plusieurs tenants détient les clés privées de chacun (une instance compromise,
> ce sont tous ses tenants compromis : [Sécurité](bridge.security.md#procedures)).

<a name="session-and-save"></a>

## L’effet sur la progression du jeu

Un signal arrive dans le jeu comme l’événement du même nom, comme une entrée du joueur :

- **`once`** (par défaut `true`) : son effet s’exécute une fois par partie, quel que soit le nombre de ses arrivées.
  Avec `once: false`, chaque signal distinct venu du Bridge le relance ; une livraison répétée du même ne le relance
  jamais.
- Un signal qui arrive pendant que le jeu est occupé (un dialogue, une cinématique, un mini-jeu) l’attend.
- Le premier signal lie la sauvegarde à son joueur pseudonyme (`GameState.reality.playerId`, le `p-…` donné par le
  Bridge à l’appairage ; jamais la capacité). Une sauvegarde qui arrive sur un appareil lié à quelqu’un d’autre
  (importée d’un autre appareil, ou faite avant un « Unlink » suivi d’un nouvel appairage) est en **désaccord**
  (`mismatch`) : rien n’en est appliqué ni acquitté, le jeu continue, et la ligne World link du menu pause propose
  d’utiliser le lien de cet appareil avec cette sauvegarde ; son état de lien repart alors de zéro pour ce joueur
  (curseur 0), et les signaux dont la sauvegarde a déjà l’effet ne sont pas réappliqués. Une livraison sans joueur ne
  lie rien (4.4.0).
- La sauvegarde et la session gardent l’identifiant du joueur, le curseur et les identifiants appliqués : jamais un
  jeton, un e-mail, un message ni une charge.

> [!GUARANTEE id=bridge-applied-once]
> Le moteur applique une fois un signal déclaré, l’inscrit dans la session et le sauvegarde avec l’état.

> [!GUARANTEE id=bridge-save-bound-to-player]
> La première livraison lie la sauvegarde à son joueur ; une livraison pour un autre joueur est un désaccord et ne
> change rien.

<a name="proof"></a>

## L’effet sur la preuve

Une preuve ne suppose jamais que l’extérieur coopère. `npm run solve:reality` (inclus dans `npm run prove:game` et dans
`quest-n-click release`) prouve le jeu dans trois sortes de mondes :

1. **fermé** : aucun signal ; le jeu doit pouvoir se finir par ses solutions de repli ;
2. **chaque scénario** de `games/<id>/reality/scenarios/*.json` (`{ "signals": ["mail.answer.wrong",
   "mail.answer.correct"] }`), puis chaque rejeu enregistré par les connecteurs (`games/<id>/replays/*.json`) : ces
   signaux dans cet ordre, chacun pouvant arriver à n’importe quel moment après le précédent ; quand le jeu a des
   signaux `required`, au moins un scénario les envoie tous ;
3. **adverse** : n’importe quel signal déclaré, à n’importe quel moment, encore et encore.

Chacun doit être résolu sans blocage (softlock) et jamais tronqué. Le solveur remet lui-même le signal au moteur :
aucun service n’est contacté. Dans le MCP du Studio, `solve` prend `reality` pour essayer un monde. `npm run validate`
vérifie que la `fallback` d’un signal requis nomme une règle ; le lint du contenu (`npm run lint`, dans `verify:game`)
vérifie que le témoin du monde fermé la joue, et avertit `fallback-unplayed` quand le jeu se finit sans l’extérieur par
un autre chemin (la solution de repli est déclarée sur une règle dont personne n’a besoin : déclarez l’action que joue
le témoin, ou faites de celle déclarée le passage obligé). Comment lire un résultat du solveur en général :
[Ce que prouve le solveur](create.solver-proofs.md).

> [!GUARANTEE id=bridge-proof-closed]
> Dans le monde fermé, le solveur finit le jeu par la solution de repli, jamais par un signal.

> [!GUARANTEE id=bridge-proof-adversarial]
> Dans le monde adverse, les doublons et tous les ordres des signaux déclarés ne font jamais perdre la partie.

La catégorie d’un speedrun dit ce qu’elle accepte de l’extérieur : `forbidden` (un signal dans le run est
`reality-forbidden`), `recorded` (chaque signal appliqué est gardé avec son JWS signé, son identifiant de clé et son
empreinte, et le vérificateur contrôle la signature avec les clés publiques du Bridge, `--keys` ou `GET /v1/keys` ;
sans preuve : `missing-reality-proof`) ou `live` (la même preuve, dans une catégorie à part, car la latence et la
disponibilité d’un signal en direct ne se reproduisent pas ; sans les clés, le vérificateur ne peut pas conclure,
`no-keyring`). Le détail : [Speedrun pour les auteurs](create.speedrun.md).

> [!GUARANTEE id=bridge-speedrun-reality-proof]
> Un run dont la preuve Reality manque reçoit le code `signal-missing`, une preuve modifiée `signal-signature`, et une
> preuve signée par une autre clé le verdict `missing-reality-proof`. Sans trousseau, le verdict est `inconclusive`
> (`no-keyring`).

> [!LIMIT id=bridge-proof-scope]
> La preuve couvre les signaux que le jeu déclare, dans n’importe quel ordre et nombre. Elle ne dit rien de la
> question de savoir si un connecteur en enverra un, ni de ce qu’un connecteur fait de son entrée.

<a name="what-the-bridge-holds"></a>

## Ce que le Bridge garde d’un joueur

Par joueur : le `playerId`, le SHA-256 de sa capacité, son expiration, l’identifiant de session, l’origine depuis
laquelle il s’est appairé. Par signal : son identifiant, sa séquence, son nom, sa source, la clé de déduplication du
connecteur, l’empreinte de ce que le connecteur a vu (`evidenceHash`), les heures, l’enveloppe signée et, depuis la
4.1.2, la charge telle qu’acceptée (pour la re-signer après une rotation) : jamais un jeton, un e-mail, un message ni
un badge. Les codes d’appairage attendent dix minutes : en mémoire sur le journal (un redémarrage les oublie), dans la
table `pairings` d’un stockage SQL. Le journal d’exécution (sortie standard) nomme des événements et des identifiants
pseudonymes, jamais un secret. Conservation, export et suppression :
[Installer et lancer le Bridge](bridge.install-run.md#retention) ; tout ce qu’un jeu, un Bridge et ses connecteurs gardent d’un joueur :
[Vie privée](play.privacy.md).

<a name="limits"></a>

## Ce qui n’est pas garanti

- **« Exactement une fois »** : jamais promis. Chaque étape peut répéter ; les garanties ci-dessus rendent une
  répétition sans effet.
- **Les connecteurs et le profil `distributed` sont expérimentaux** : personne n’a encore fait tourner un connecteur
  contre un vrai fournisseur d’e-mail, un vrai badge ou un terminal exposé sur un réseau, ni le profil `distributed`
  derrière un vrai domaine pendant 24 à 48 heures ([Stabilité et support](start.stability.md)).
- **Pas de sécurité par ligne et par tenant dans Postgres**, pas de rétention sur un stockage SQL, pas de quota de
  connecteur partagé entre instances.
- Le Bridge de référence est fait pour un jeu, un développeur, un événement ou les jeux d’un petit studio ; c’est le
  protocole qui reste.
