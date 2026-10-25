# Premier déploiement

La première mise en ligne du Studio d’équipe : déployer le worker, puis le studio, importer le jeu une fois, inviter
le premier owner, et vérifier que l’instance sert les écritures.

<a name="what-you-will-build"></a>

## Ce que vous allez construire

Un Studio hébergé en marche sur `https://studio.exemple.fr` : votre jeu importé en révision 1, ses fichiers dans le
bucket, vous connecté comme son premier owner, et `/readyz` qui répond 200.

**Vérifié sur : 19 octobre 2026, par le déploiement de référence**, depuis le dépôt, au commit du moteur 52e68932
(package.json 4.2.2, le travail de la 4.2.3 avant son tag), organisation Clever Cloud de test, région `par`, deux
applications XS, PostgreSQL DEV, Cellar S, Keycloak managé, sur trois noms en `*.cleverapps.io`. Non vérifiés sur une
installation réelle : le texte exact de cette page, un domaine à soi, et la variante par les archives de la release
([plus bas](#from-release-archives)). S’applique à partir de la 4.3.0, la version dont les commandes portent les noms
`quest-n-click` utilisés ici (les paquets sont des `@quest-n-click/…` à partir de la 4.5.2 ; les archives gardent leur
nom).

<a name="what-you-need"></a>

## Ce qu’il vous faut

- [Applications et add-ons](clever.apps-addons.md), [Domaines et TLS](clever.domains-tls.md), le fournisseur
  ([Keycloak](clever.keycloak.md)) et la [Configuration](clever.configuration.md), tous faits.
- Votre jeu dans le dépôt déployé, sous `games/my-game` (le `game` de la configuration), avec ses assets préparés
  versionnés dans `public/`.
- L’e-mail vérifié avec lequel vous vous connecterez, connu du fournisseur.

<a name="steps"></a>

## Étapes

<!-- step: deploy-worker -->
1. Déployez le worker d’abord, puis le studio, depuis votre machine, dans le dépôt du moteur :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever deploy --alias my-game-worker
   clever deploy --alias my-game-studio
   ```

   Chaque déploiement pousse le commit courant du dossier. Le build du worker lance son hook Python ; celui du studio
   construit la page du Studio (`npm run studio-client`). Chacun finit par « deployed ».

> [!MEASURE id=first-deploy-time]
> Worker : « deployed in 0 minutes and 36 seconds » (environ 48 s de bout en bout), son hook pip environ 7 s. Studio :
> « 0 minutes and 29 seconds » (environ 43 s de bout en bout).
> - date: 2026-10-19
> - version: 4.2.2
> - volume: un déploiement de chaque application, depuis le dépôt
> - conditions: phase A du déploiement de référence, moteur au commit 52e68932 avant le tag 4.2.3 (package.json disait 4.2.2) ; organisation Clever Cloud de test, région par ; deux applications XS, PostgreSQL DEV, Cellar S ; un échantillon chacun
> - source: [QUALIF-4.2.3-REFERENCE.md §1](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

<!-- step: watch-start -->
2. Regardez le studio démarrer. `clever logs` suit les journaux jusqu’à ce qu’on l’arrête, même avec `--until` :
   lancez-le en arrière-plan, et arrêtez-le par son numéro de processus une fois ce qu’il faut obtenu :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever logs --alias my-game-studio > studio.log 2>&1 &
   echo $!          # le numéro de processus, pour l'arrêter plus tard : kill <ce numéro>
   ```

   Une configuration refusée arrête le serveur avec une ligne qui nomme le champ (voir
   [Configuration](clever.configuration.md#common-errors)). Une fois qu’il écoute et tient le bail, le journal a une
   ligne `{"event":"lease-taken",…}`.

<!-- step: import -->
3. Importez le jeu une fois, depuis un shell sur l’application studio :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever ssh --alias my-game-studio
   ```

   ```sh
   # dans ce shell, sur l'application studio
   cd "$APP_HOME"
   npm run studio-server -- import games/my-game
   ```

   Le shell de `clever ssh` a les variables de l’application (`STUDIO_CONFIG_JSON`, celles des add-ons) : aucune
   commande n’a besoin de `--config`. L’import envoie chaque fichier au bucket et affiche
   `{"event":"imported","game":"my-game","revision":1}`. Il refuse une instance qui a déjà un projet (« import: this
   instance already has a project »).

> [!MEASURE id=import-time]
> L’import du jeu de démo par `clever ssh` : 242 s, révision 1.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: `games/demo`, 500 fichiers envoyés à Cellar
> - conditions: phase A du déploiement de référence, moteur au commit 52e68932 avant le tag 4.2.3 (package.json disait 4.2.2) ; application studio XS, Cellar S, région par ; un échantillon
> - source: [QUALIF-4.2.3-REFERENCE.md §1](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

<!-- step: invite-owner -->
4. Dans le même shell, invitez le premier owner :

   ```sh
   # dans ce shell, sur l'application studio
   npm run studio-server -- invite --email you@example.fr --role owner
   ```

   Elle affiche un lien à usage unique, `https://studio.exemple.fr/auth/login?invite=…`, valable 7 jours. Ouvrez-le et
   connectez-vous avec cet e-mail vérifié. L’invitation n’est consommée que par cet e-mail, vérifié par le fournisseur.

   `clever ssh --command '…'` lance une commande sans session interactive, mais refuse tant qu’une seconde instance est
   listée (l’ancienne d’un déploiement reste `STOPPING` environ deux minutes) : attendez qu’elle parte.

<!-- step: readyz -->
5. Vérifiez que l’instance sert les écritures :

   ```sh
   # sur votre machine
   curl -s https://studio.example.fr/readyz
   ```

   Elle répond 200 avec `{"ok":true,"writes":"served","rpoMs":0}` dès que l’instance tient le bail de service, et 503
   avec `"writes":"waiting"` avant. Dans le Studio, `GET /auth/me` dit `role: owner` ; faites une modification (une
   note) et voyez-la enregistrée.

<!-- step: first-backup -->
6. Faites une première sauvegarde dans le bucket, par le script même de la sauvegarde quotidienne, et voyez sa ligne :

   ```sh
   # dans un shell sur l'application studio (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && ops/studio/backup-cron.sh
   ```

   Il affiche `{"event":"backup","key":"backups/<date>-r1.json",…}` ([Sauvegardes](clever.backups.md)).

<a name="from-release-archives"></a>

### Depuis les archives de la release

À partir de la 4.2.1, une release porte `quest-n-click-studio-server-<version>.tgz` (nommée
`web-scumm-studio-server-…` avant la 4.3.0) : les deux commandes `quest-n-click-studio-server` et
`quest-n-click-studio-worker`, la page du Studio déjà construite, et ses propres dépendances (OpenID Connect, JWT,
Postgres). Leurs versions sont verrouillées dans son `npm-shrinkwrap.json` et son SBOM. npm lit ce verrou quand il
installe depuis le registre, pas depuis un fichier d’archive, où `pg` prend le dernier 8.x que permet sa plage
(`quest-n-click-studio-server deps` dit lequel). Il fait tourner le serveur du moteur installé à côté, qui doit être de
la même version :

```sh
# dans votre dossier de déploiement (le dépôt d'une application ou un serveur), les deux archives d'une même release à côté
npm install quest-n-click-<version>.tgz quest-n-click-studio-server-<version>.tgz
npx quest-n-click-studio-server import ./my-game --config studio.config.json
npx quest-n-click-studio-server serve --config studio.config.json
npx quest-n-click-studio-worker          # sur la machine du worker, avec WORKER_PUBLIC_KEY et WORKER_INSTANCE
```

- Un worker installé depuis les archives prépare aussi les assets (depuis la 4.2.3 ; en 4.2.2, il fallait un worker
  déployé depuis le dépôt). Son hook de build installe le `requirements.txt` à empreintes que porte le paquet du
  moteur, depuis le dossier du worker, où le worker cherche les paquets (`WORKER_PYTHON_PATH` pour les mettre
  ailleurs) :
  `CC_POST_BUILD_HOOK=python3 -m pip install --target .python --require-hashes --only-binary=:all: -r node_modules/@quest-n-click/engine/requirements.txt`.
  Ses empreintes couvrent les roues de toutes les plateformes que publie PyPI, dont le runtime natif de Clever Cloud
  (CPython 3.13, Linux x86_64). Avant la 4.5.2, le hook nommait `ops/studio/worker-requirements.lock`, qui
  n’existe plus.
- L’archive du moteur apporte Vite et tsx, dont le worker a besoin pour exécuter le code du jeu et construire ses
  prévisualisations (le Studio lui-même ne fait plus tourner Vite, depuis la 4.2.2).
- Mettez dans `publicDir` les assets préparés de votre jeu (`public/` de son dépôt) : le `public/` du moteur ne contient
  que ses icônes et sa police.
- Les archives ne portent pas le script de la sauvegarde quotidienne : [Sauvegardes](clever.backups.md#from-archives)
  dit comment l’ajouter.
- Le candidat de chaque release installe ces deux archives dans un dossier vide et y sert un jeu, ses dépendances
  trouvées que npm les remonte ou les imbrique (`scripts/studio-install-smoke.mjs`). C’est une vérification de la CI,
  pas un déploiement sur Clever Cloud.

L’installation générale depuis les archives, c’est [Installer depuis l’archive de la release](install.from-archive.md).

<a name="what-you-learned"></a>

## Ce que vous avez appris

- Le worker d’abord, le studio ensuite ; l’import et la première invitation se lancent une fois, sur l’application
  studio, par `clever ssh`, sans `--config`.
- `/readyz` dit si cette instance sert les écritures, et de combien l’expédition du journal vers le bucket est en
  retard (`rpoMs`).
- `clever logs` ne s’arrête jamais seul : arrêtez-le par son numéro de processus.

<a name="next"></a>

## Pour continuer

- Invitez l’équipe : [Invitations](team.invitations.md).
- Posez les alertes : [Supervision](clever.monitoring.md). Prévoyez un [exercice de restauration](clever.restore-drill.md).
- Le déploiement suivant : [Redéploiements](clever.redeploys.md).
- Les commandes du serveur : [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts) ; la référence
  de la CLI : [La CLI du serveur](team.server-cli.md).
