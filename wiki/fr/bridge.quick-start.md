# Démarrage rapide

En un quart d’heure environ, sur votre machine, vous faites réagir le jeu d’exemple `signals` au monde extérieur :
d’abord avec le Bridge simulé du Studio, puis avec un vrai Bridge sur `127.0.0.1`, un signal envoyé par son webhook de
démonstration, et le même signal envoyé deux fois. Rien ne sort de votre machine.

<a name="what-you-will-build"></a>

## Ce que vous allez construire

Le jeu d’exemple `games/signals` s’ouvre sur un jardin, un portail fermé et une vieille radio posée sur un banc. À la
fin de ce tutoriel :

- un Bridge local sert le jeu sur `http://127.0.0.1:8787/` ;
- le jeu, joué sur `http://127.0.0.1:5173/`, y est lié (menu pause, ligne **World link**) ;
- un signal `mail.answer.correct`, envoyé par le Bridge, ouvre le portail ; renvoyé, il reçoit la réponse
  `duplicate` et ne change rien.

<a name="what-you-need"></a>

## Ce qu’il vous faut

- Le dépôt du moteur, installé (`npm ci` fait) : [Installer depuis le dépôt](install.from-repository.md). Node 22.12
  ou plus récent ([Prérequis](install.requirements.md)).
- Deux ports libres, 8787 (le Bridge) et 5173 (le jeu), et `curl`.
- Trois terminaux, tous dans le dossier du dépôt du moteur.

<a name="studio"></a>

## L’essayer d’abord dans le Studio

<!-- step: studio -->
1. Lancez le Studio sur le jeu d’exemple :

   ```sh
   # dans le dépôt du moteur
   GAME=signals npm run studio
   ```

   L’onglet Jouer affiche un panneau **Reality**, parce que le jeu déclare `reality` : un bouton par signal, des
   pannes à ajouter (un délai, un doublon, une mauvaise signature, une expiration), la file inversée, la connexion
   coupée puis reprise, et ce qu’est devenue chaque livraison. Appuyez sur le bouton de `mail.answer.correct` : le
   portail s’ouvre.

   C’est un Bridge simulé avec une clé de développement, qui tourne dans la page : le signal passe par la même
   vérification, la même session, la même sauvegarde et la même déduplication qu’un vrai. Arrêtez le Studio (Ctrl-C)
   avant de continuer.

<a name="steps"></a>

## Étapes avec un vrai Bridge

<!-- step: init -->
1. Créez les clés et la configuration du Bridge pour le jeu :

   ```sh
   # dans le dépôt du moteur
   GAME=signals npm run bridge -- init
   ```

   Vous voyez `✔  …/.cache/bridge/config.json (keys, webhook secrets and tokens; mode 600), …/root.key (the root key:
   grant only) and …/admin-token`, puis la liste des webhooks de démonstration, un par source des signaux du jeu :
   `/v1/hooks/badge, /v1/hooks/webhook, /v1/hooks/email, /v1/hooks/mail, /v1/hooks/terminal`. Les valeurs par défaut
   conviennent à ce tutoriel : les origines du jeu `http://127.0.0.1:5173` et `http://localhost:5173`, le journal comme
   stockage.

<!-- step: serve -->
2. Lancez-le, dans un premier terminal :

   ```sh
   # dans le dépôt du moteur, terminal 1
   GAME=signals npm run bridge -- serve
   ```

   Il affiche une ligne JSON, `{"event":"bridge.listening","url":"http://127.0.0.1:8787/","game":"signals",…}`, et
   continue de tourner. Chaque événement suivant (un appairage, un signal) ajoute une ligne ici.

<!-- step: play -->
3. Lancez le jeu, dans un deuxième terminal, et ouvrez `http://127.0.0.1:5173/` :

   ```sh
   # dans le dépôt du moteur, terminal 2
   GAME=signals npm run dev
   ```

   Le `reality.bridge` du jeu vaut déjà `http://127.0.0.1:8787/` (`games/signals/game.ts`).

<!-- step: link -->
4. Liez le jeu. Ouvrez le menu pause, ligne **World link**, et choisissez « Link this game » (les textes anglais par
   défaut du moteur) : le jeu affiche un code de 8 caractères (lettres et chiffres, sans 0, O, 1, I ni L). Il attend
   qu’un connecteur le confirme.

<!-- step: confirm -->
5. Confirmez le code comme le ferait un connecteur, dans un troisième terminal. Le webhook de démonstration de la
   source `mail` a un jeton qui peut confirmer des appairages ; remplacez `ABCD2345` par votre code :

   ```sh
   # dans le dépôt du moteur, terminal 3
   TOKEN=$(node -p 'require("./.cache/bridge/config.json").webhooks.mail.token')
   curl -s -X POST http://127.0.0.1:8787/v1/pairings/ABCD2345/confirm -H "Authorization: Bearer $TOKEN"
   ```

   La réponse est `{"playerId":"p-…"}` : 16 chiffres hexadécimaux, un identifiant pseudonyme inventé par le Bridge. Le
   terminal 1 journalise `"event":"pairing.confirmed"`. Le jeu demande au Bridge toutes les deux secondes si son code
   a été confirmé : il récupère son lien tout seul et dit qu’il est lié. Notez le `playerId` pour l’étape suivante.

<!-- step: send -->
6. Envoyez le signal par le webhook de démonstration. Une requête de webhook est signée par un HMAC-SHA256 de son
   corps sous le secret du webhook ; cette commande lit le secret dans la configuration et signe. Remplacez le `p-…` :

   ```sh
   # dans le dépôt du moteur, terminal 3
   node -e '
   const { createHmac } = require("node:crypto");
   const [playerId] = process.argv.slice(1);
   const { secret } = require("./.cache/bridge/config.json").webhooks.mail;
   const body = JSON.stringify({ playerId, event: "answer.correct", id: "try-1" });
   const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
   fetch("http://127.0.0.1:8787/v1/hooks/mail", { method: "POST", body,
     headers: { "Content-Type": "application/json", "X-Web-Scumm-Signature": signature } })
     .then(async (r) => console.log(r.status, await r.text()));
   ' p-0123456789abcdef
   ```

   Elle affiche `202 {"id":"s-…","sequence":1,"duplicate":false}`. Dans le jeu, le portail s’ouvre. L’événement
   `answer.correct` du webhook `mail` est le signal `mail.answer.correct` ; `id` nomme cette livraison.

<!-- step: send-again -->
7. Relancez la même commande. Elle affiche `200 {"id":"s-…","sequence":1,"duplicate":true}` : le même identifiant, la
   même séquence. Le Bridge a gardé le premier ; le jeu ne change rien.

<!-- step: stop -->
8. Arrêtez le Bridge et le jeu par Ctrl-C dans leurs terminaux. Le Bridge écrit `"event":"bridge.stopping"` et
   s’arrête.

> [!LIMIT id=bridge-quick-start-local]
> Ce tutoriel tourne sur une seule machine, en HTTP simple, avec des webhooks de démonstration qui peuvent envoyer
> n’importe quel signal de leur source pour n’importe quel joueur pendant 30 jours. C’est pour le développement
> seulement : sur Internet, le Bridge tourne derrière HTTPS, avec `init --no-demo-webhooks` et un `grant` étroit par
> connecteur ([Installer et lancer le Bridge](bridge.install-run.md)).

<a name="player"></a>

## Entre les mains du joueur

Ce que vous venez de faire à la main, un connecteur le fait pour un joueur. Côté joueur :

- La ligne **World link** du menu pause propose « Link this game », qui affiche le code de 8 caractères que le joueur
  donne au connecteur du jeu : il répond à l’e-mail avec, le tape à l’invite du terminal, l’envoie avec un badge, le
  saisit dans le formulaire d’un webhook. Le code attend dix minutes. Dès qu’un connecteur le confirme, le jeu est
  lié.
- Le lien est annoncé poliment, jamais par-dessus une réplique en cours. Les signaux qui arrivent pendant que le jeu
  est occupé (un dialogue, une cinématique, un mini-jeu) l’attendent. Hors ligne, le jeu continue ; de retour en
  ligne, ce qui est arrivé entre-temps s’applique.
- Le navigateur garde l’URL du Bridge, l’identifiant pseudonyme du joueur et une capacité qui ne peut que lire et
  acquitter les signaux de ce jeu, sous `<jeu>:reality-link` dans le `localStorage`. Rien de cela n’est jamais écrit
  dans une sauvegarde ni une session. Une nouvelle partie sur le même appareil garde le lien. « Unlink » dans le même
  menu révoque le lien sur le Bridge, pas seulement sur l’appareil.
- Les textes de l’interface sont `realityLink`, `realityStart`, `realityCode`, `realityWaiting`, `realityOpen`,
  `realityOffline`, `realityRevoked`, `realityNone`, `realitySimulated`, `realityUnlink`, `realityMismatch` et
  `realityRelink`, dans le `ui` du jeu ; les valeurs anglaises par défaut sont dans `src/engine/dom/reality-ui.ts`
  ([Traductions](create.translations.md)).
- Le joueur vérifie chaque signal avec les clés du Bridge, chacune dans sa fenêtre, et l’expiration d’un signal, avec
  cinq minutes de tolérance pour l’horloge de l’appareil (`CLOCK_SKEW_MS` dans `src/engine/reality/protocol.ts`, la
  même valeur dans la vérification croisée en Rust). Quand un signal nomme une clé absente du trousseau (le Bridge a
  fait tourner sa clé pendant que le lien était ouvert), le client redemande les clés une fois avant de le refuser.
- Un `WorldSignalV2` (ADR 0010) nomme le tenant, l’environnement, l’origine depuis laquelle le joueur s’est appairé,
  le lien et la clé pour lesquels il a été signé, et le joueur refuse un signal signé pour un autre contexte
  (`audience-mismatch`), l’origine de la page étant vérifiée par défaut. Un Bridge qui sert plusieurs tenants ne
  signe que du V2 ; un Bridge à un seul tenant signe du V1, sauf si sa configuration dit `signalVersion: 2`
  (`init --signal-version=2`), et le joueur accepte les deux ([Sécurité](bridge.security.md#signatures)).

Ce que garde la sauvegarde, et ce qui se passe quand une sauvegarde rencontre le lien d’un autre joueur :
[Garanties](bridge.guarantees.md#session-and-save).

<a name="sample-chapter"></a>

## Pour aller plus loin : le chapitre d’exemple

`games/signals` a un chapitre, « la boîte aux lettres et le terminal », joué avec les vrais connecteurs. Liez le jeu
(menu pause, World link), puis :

- écrivez au portail avec « open the door » dans le sujet ou le texte, et la porte de la cabane s’ouvre (le connecteur
  e-mail) ;
- tapez `lamp on` au terminal de la cabane, en Telnet ou en SSH, et une lampe s’allume dans le jardin ;
- montrez un badge de la guilde des jardiniers, et un ruban se pose sur le seau (le connecteur Open Badges).

Rien de tout cela n’est nécessaire pour finir le jeu : la radio sur le banc ouvre toujours le portail. Le terminal
Telnet est le plus rapide à essayer en local. Avec le Bridge de l’étape 2 en marche :

```sh
# dans le dépôt du moteur, terminal 3
GAME=signals npm run bridge -- grant --connector=shed-telnet --source=terminal --signals=terminal.lamp --pair > .cache/bridge/telnet.token
cat > .cache/bridge/telnet.json <<'EOF'
{
  "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "telnet.token" },
  "gameId": "signals",
  "health": { "port": 9301 },
  "telnet": { "port": 2323 }
}
EOF
npm run connector -- telnet --config .cache/bridge/telnet.json
```

Puis, depuis un quatrième terminal, `nc 127.0.0.1 2323` (ou `telnet 127.0.0.1 2323`) : la bannière de la cabane
demande le code d’appairage que montre votre jeu ; tapez-le, puis `lamp on`. Le terminal répond « Click. Somewhere in
the garden, a lamp glows. ». Chaque connecteur a sa page : [Telnet](bridge.connector-telnet.md),
[SSH](bridge.connector-ssh.md), [e-mail](bridge.connector-email.md), [Open Badges](bridge.connector-open-badges.md).

<a name="what-you-learned"></a>

## Ce que vous avez appris

- Un signal est un identifiant déclaré, envoyé par un connecteur et signé par le Bridge :
  [Le Reality Bridge : ce que c’est](bridge.what-it-is.md).
- L’appairage lie un jeu sur un appareil à un joueur pseudonyme ; le jeu garde une capacité qui ne lit que ses propres
  signaux : [Sécurité](bridge.security.md).
- Un signal envoyé deux fois est accepté une fois : [Garanties](bridge.guarantees.md#duplicates).

<a name="next"></a>

## Et ensuite

- Déclarer les signaux de votre propre jeu : [Signaux et manifeste](bridge.signals-manifest.md).
- Faire tourner un Bridge pour de vrais joueurs : [Installer et lancer le Bridge](bridge.install-run.md).
- Quand quelque chose ne va pas : [Dépannage du Bridge et des connecteurs](bridge.troubleshooting.md).
