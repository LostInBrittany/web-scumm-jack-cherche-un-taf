# Reprendre après un bail perdu, une déconnexion ou un aperçu périmé

Sur un Studio d'équipe, quelque chose a interrompu votre travail : une salle que vous teniez est passée à quelqu'un
d'autre, la connexion a sauté, vos écritures attendent, vous voilà renvoyé à la page de connexion, ou le jeu affiché
n'est pas le plus récent. Cette page distingue ces cas et dit comment reprendre. Dans aucun d'eux, rien de confirmé
n'est perdu.

<a name="symptom"></a>

## Symptôme

- Votre enregistrement dans une salle où vous travailliez est refusé par une 423 qui nomme quelqu'un d'autre, après
  une pause, un onglet fermé ou un portable en veille ([bail perdu](#lost-lease)).
- Un bandeau : « Reconnecting… last revision seen: N. Nothing is lost: what changed meanwhile is read from the
  journal. » ([déconnexion](#disconnection)), ou « Some changes made while the connection was cut could not be read
  back. », avec **Reload the Studio**.
- Un bandeau : « N changes not answered yet, sent again with the same id: each applies once. » ([écritures en
  attente](#writes-waiting)).
- La page de connexion, la page « Identity provider unreachable », ou « Access not granted » ([session](#session)).
- L'étiquette sous la vue de salle dit « preview of revision N · revision M ready: reload to see it », « revision M
  building… » ou « revision M does not build: … » ; l'onglet Play montre un jeu plus ancien ; un cadre de jeu ne montre
  plus rien de neuf ([aperçu périmé](#stale-preview)).

<a name="causes"></a>

## Causes possibles

1. **Votre bail a expiré.** Un bail dure 120 secondes et votre Studio le renouvelle toutes les 30 secondes tant qu'il
   est ouvert et connecté. Fermé, en veille ou hors ligne plus de deux minutes, vous le perdez ; n'importe qui peut
   alors prendre le pan.
2. **Quelqu'un vous l'a repris.** Un owner a repris le pan (c'est noté dans le journal d'audit), ou un job a pris le
   jeu entier (le bail exclusif).
3. **Le flux en direct a sauté** : le réseau, un proxy, ou un redéploiement du serveur.
4. **Le serveur n'a pas répondu à une écriture** : un redéploiement (la nouvelle instance ne sert pas les écritures
   pendant quelques secondes), une coupure.
5. **Votre session a pris fin ou a été suspendue** : ses limites (8 heures d'inactivité et 24 heures en tout par
   défaut, les clés `sessions.idleHours` et `sessions.absoluteHours` de la configuration), un owner y a mis fin, vous
   avez été retiré ou votre rôle a changé, ou le fournisseur d'identité n'a pas pu la confirmer pendant 15 minutes.
6. **L'aperçu est en retard sur la tête** : chaque modification construit un nouvel aperçu sur le worker, ce qui prend
   du temps, et une vue qui montre un jeu le garde jusqu'à ce que vous chargiez le nouveau.

<a name="diagnosis"></a>

## Diagnostic

- **Spans…** (votre nom dans l'en-tête) liste qui tient quoi, et jusqu'à quand. `GET /api/leases` donne la même chose :
  `span`, `holderName`, `until` (l'horloge du serveur, en millisecondes).
- Le point de révision de l'en-tête est vert tant que le flux en direct fonctionne ; le bandeau dit quand il est coupé.
- Le journal d'audit (owners) montre un `lease-takeover`, `sessions-revoked`, `member-role` ou `member-removed`.
- L'étiquette de l'aperçu dit quelle révision montre la vue du jeu, et ce qui se construit ou échoue.
- `/readyz` répond 503 tant qu'aucune instance ne sert les écritures (un redéploiement).

<a name="fix"></a>

## Correction

<a name="lost-lease"></a>

### Un bail perdu

<!-- step: retake-span -->
1. Ouvrez **Spans…**. Si le pan est libre, cliquez sur **Take** (ou enregistrez simplement : enregistrer le prend).
   Si quelqu'un le tient, cliquez sur **Tell me when it is free** dans la fenêtre du refus, ou demandez-lui : voir
   [423](team.write-refused-423.md#fix). Votre brouillon reste dans la fenêtre ; **Copy the draft** si vous en avez
   besoin ailleurs.
2. S'il a été repris par un owner, le journal d'audit dit qui. Mettez-vous d'accord avec lui avant de le reprendre.
3. Un script qui envoie `x-studio-fences` reçoit `your lease on <span> ended or was taken again: take it again`
   (423) : il reprend le pan (`POST /api/leases` avec `{"spans": ["room:kitchen"]}`), garde les nouveaux jetons, et
   renvoie son écriture.

Un job qui tient le jeu entier renouvelle son bail exclusif toutes les 30 secondes tant qu'il tourne et le rend à la
fin. Si l'instance redémarre pendant un job, l'état du job est perdu ; son bail expire en 120 secondes au plus.

<a name="disconnection"></a>

### Une déconnexion

<!-- step: wait-reconnect -->
1. **Attendez.** Le navigateur rouvre le flux tout seul. Quand le serveur l'a refusé (401, 503), la page demande
   d'abord qui est votre session, puis le rouvre, en attendant un peu plus à chaque fois, 30 secondes au plus.
2. À la reconnexion, le Studio lit ce qu'il a manqué dans le journal (`GET /api/ops?after=<dernière révision vue>`),
   dans l'ordre, et le bandeau disparaît. Si le journal ne peut pas être lu après cinq essais, le bandeau dit que
   certains changements n'ont pas pu être relus : cliquez sur **Reload the Studio**.
3. Si l'histoire du projet a changé entre-temps (un nouvel import, une restauration : une autre *époque*), la page se
   recharge d'elle-même.

<a name="writes-waiting"></a>

### Des écritures en attente

<!-- step: let-retry -->
1. **Laissez l'onglet ouvert.** Une écriture restée sans réponse, ou qui a reçu une 502, 503 ou 504, est renvoyée avec
   le même identifiant d'opération, jusqu'à huit fois de plus, en attendant 0,5 seconde puis le double, jusqu'à 8
   secondes. Le serveur l'applique une seule fois, quel que soit le nombre d'essais. Pendant un redéploiement, les
   écritures sont refusées un court moment ; voir [Redéploiements](clever.redeploys.md).
2. Si le bandeau reste et que les écritures finissent en erreur, le serveur est arrêté ou injoignable : regardez
   `/readyz`, et voir [Worker, PostgreSQL ou Cellar en panne](clever.dependency-down.md).

<a name="session"></a>

### Une session terminée, suspendue ou changée

<!-- step: log-in-again -->
1. **Renvoyé à la page de connexion** : reconnectez-vous ; vous revenez où vous étiez. Les brouillons des fenêtres de
   refus ne survivent pas à la connexion : copiez-les d'abord si une fenêtre est ouverte.
2. **« Identity provider unreachable »** : le fournisseur n'a pas confirmé votre session depuis 15 minutes, alors le
   Studio se met en pause (« Nothing was sent during the pause. »). Cliquez sur **Try again now** une fois le
   fournisseur revenu.
3. **« Access not granted »** : vous êtes connecté mais n'êtes plus membre. Demandez une invitation à un owner.
4. **La page redémarre toute seule** : votre rôle a changé ; le Studio repart avec vos nouveaux droits.

<a name="stale-preview"></a>

### Un aperçu périmé

<!-- step: load-latest -->
1. **La vue de salle** charge le nouvel aperçu d'elle-même une fois construit, sauf si un placement n'est pas
   enregistré. Enregistrez-le (**Save layout**), ou cliquez sur **Reload view** (le placement non enregistré est
   perdu).
2. **L'onglet Play** garde l'aperçu qu'il a chargé, pour ne jamais interrompre une partie en cours : cliquez sur
   **Load the latest preview**.
3. **Un cadre de jeu resté inactif** au-delà de sa session de jeu de 15 minutes ne montre plus rien de neuf :
   **Reload view**, ou rouvrez l'onglet Play.
4. **« revision M does not build: … »** : le dernier aperçu construit reste servi. Survolez l'étiquette pour la raison
   complète, corrigez le jeu, et la révision suivante se construit. Un aperçu se construit à partir des seuls fichiers
   texte du jeu : un jeu dont le code importe une feuille de style ou une image ne peut pas être prévisualisé.
5. **Une sauvegarde faite dans un autre contenu** demande avant d'être reprise : **Resume here** (elle peut se jouer
   bizarrement si cette révision a retiré ce dont la sauvegarde parle), **Restart**, ou **Stay in revision N** (la
   révision propre de la sauvegarde) ; Échap annule
   ([ADR 0026](../../docs/dev/adr/0026-saves-across-revisions.md)).
6. **L'onglet Check** marque ses résultats comme périmés dès que la tête a avancé : relancez la vérification.

> [!LIMIT id=no-offline-editing]
> Un Studio hébergé n'a pas de mode hors ligne : tant que le serveur est injoignable, rien n'est enregistré, et seules
> les écritures déjà envoyées sont retentées. Un brouillon dans une fenêtre de refus ouverte ne vit que dans cet
> onglet.

<a name="check-fixed"></a>

## Comment vérifier que c'est réglé

Le point de révision est vert et aucun bandeau ne s'affiche ; votre enregistrement suivant répond avec une nouvelle
révision ; **Spans…** montre le pan comme le vôtre ; l'étiquette de l'aperçu dit « preview of revision N » avec N la
tête.

<a name="neighbours"></a>

## Cas voisins

- **Une 423 alors que le bail n'était pas à vous avant** : quelqu'un tient simplement ce pan. Voir
  [Écriture refusée : pan verrouillé (423)](team.write-refused-423.md).
- **Une 409 « The file changed since you read it »** : pas un verrou, une lecture périmée. Voir
  [Écriture refusée : révision de base périmée (409)](team.write-refused-409.md).
- **Des 503 pendant des minutes, pour tout le monde** : l'instance ou l'un de ses services est en panne ; voir
  [Dépannage Clever Cloud](clever.troubleshooting.md).
- **Un aperçu qui ne se construit jamais, pour tout le monde** : le worker est peut-être en panne ; voir
  [Worker, PostgreSQL ou Cellar en panne](clever.dependency-down.md).
