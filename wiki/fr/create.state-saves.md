# État et sauvegardes : persistant ou temporaire, renommer un id, migrations

Ce que garde la sauvegarde d’un joueur, ce qu’elle oublie, et comment faire évoluer votre jeu sans casser les
sauvegardes de ceux qui y jouent déjà : renommer un id, faire passer une sauvegarde d’une version de votre contenu à la
suivante, et ce qui se passe quand un jeu installé se met à jour.

<a name="what-a-save-holds"></a>

## Ce que contient une sauvegarde, et ce qu’elle ne contient pas

Une sauvegarde est **l’état de la partie en cours** (`GameState`,
[src/engine/core/types/state.ts](../../src/engine/core/types/state.ts)), dans une enveloppe qui nomme le jeu, son
`saveVersion`, l’heure et le monde (`SaveEnvelopeV4`, [src/engine/core/save.ts](../../src/engine/core/save.ts)).

**Persistant : dans la sauvegarde.**

| Quoi | Champ |
|---|---|
| Le lieu courant, la position du héros dans chaque lieu, les lieux visités et combien de fois | `room`, `hero`, `visited` |
| L’inventaire et les objets déjà utilisés | `inventory`, `used` |
| Chaque drapeau, avec sa valeur (booléen, nombre ou texte) | `flags` |
| L’état de chaque accessoire, et les acteurs déplacés, cachés ou montrés par un script | `props`, `actors` (clés `<lieu>.<id>`) |
| Les places débloquées sur la carte | `unlocked` |
| Les compteurs des blocs `once`, `nth`, `cycle` et `random` | `counters` (par id de bloc) |
| Ce qui a déjà été vu : sujets, écouteurs `once`, choix `once`, signaux Reality appliqués | `seen` (`topic.<id>`, `event.<id>`, `choice.<id>`, `reality.<signal>`) |
| Où est chaque personnage mobile | `where` |
| La position de chaque script : sa prochaine étape, fini ou arrêté | `scripts` (l’étape par son id de `stepIds`) |
| La caméra du lieu courant | `camera` |
| Plusieurs personnages jouables : qui est actif, le lieu, les positions et l’inventaire des autres | `active`, `players` |
| Si la partie est finie | `done` |
| La musique et où elle en était | `music` (écrit et lu par l’application du joueur seulement) |
| Le lien avec un Reality Bridge : curseur et signaux appliqués | `reality` |

**Temporaire : jamais dans la sauvegarde.**

- Un événement (`emit`) : il arrive, ses écouteurs s’exécutent, et il disparaît. Seul un écouteur `once` se souvient
  d’avoir réagi, dans `seen`.
- La suite d’une action en cours : les commandes restantes d’une cinématique, une conversation ouverte, un mini-jeu en
  train d’être joué. L’état est écrit quand une action se termine, et à certains moments en cours de route (en entrant
  dans un lieu, par exemple) ; ce qui restait à exécuter de cette action ne repart pas après un rechargement. Les
  scripts, eux, sont différents : leur position est sauvegardée, et ils reprennent.
- Une animation d’accessoire en boucle (`play` d’une animation `loop`) : pure présentation ; après un chargement,
  l’accessoire montre l’image de son état jusqu’à ce qu’une commande relance la boucle.
- La scène : calques, lumières, particules, transitions. Elle lit l’état (conditions `visible`), elle ne le change
  jamais.
- L’ensemble des objectifs déjà accomplis. Il est reconstruit depuis l’état au chargement : ce qui tient à ce moment
  compte comme fait (voir [Chapitres et objectifs](create.chapters.md#objectives)).
- Les préférences du joueur : vitesse et taille du texte, animations réduites, police lisible, volumes, sous-titres,
  touches des verbes (`<jeu>.settings` dans le localStorage du navigateur) et la langue (`<jeu>.lang`). Elles
  appartiennent au navigateur, pas à une partie ; voir [Mise en scène](create.staging.md#settings).

D’où la règle simple : **ce qui doit survivre à un rechargement est un drapeau, un objet, l’état d’un accessoire, un
compteur ou la position d’un script**. Une variable gardée dans le JavaScript d’une commande personnalisée (voir
[Code personnalisé](create.custom-code.md)) est perdue au rechargement, sauf si vous l’écrivez dans l’état. Quand
choisir un drapeau, une variable ou un événement : [Drapeaux, variables et événements](create.flags-variables-events.md).

<a name="guarantees"></a>

## Ce qui est garanti

**Où vivent les sauvegardes.** L’autosauvegarde et les emplacements manuels vivent dans IndexedDB
([src/engine/dom/save-store.ts](../../src/engine/dom/save-store.ts)). Les écritures passent une par une, et chaque
écriture validée est **relue et comparée** avant que la sauvegarde compte comme faite
([ADR 0005](../../docs/dev/adr/0005-indexeddb-read-back.md)). Un navigateur sans IndexedDB (fenêtre privée, profil
verrouillé) reçoit le stockage localStorage ([src/engine/dom/storage.ts](../../src/engine/dom/storage.ts)), annoncé une
fois.

> [!GUARANTEE id=save-read-back]
> L’autosauvegarde est écrite dans IndexedDB sans erreur, et retrouvée, identique, après la réouverture de la base.

Chaque écriture est relue et vérifiée avant de compter (`whenIdle()` rejette quand la copie ne correspond pas).

**Chaque opération dit ce qu’elle a fait.** `save()` signale une écriture refusée par le rappel d’échec du stockage et
`whenIdle()` rejette ; `clear()` et `clearSlot()` rendent `false` quand le navigateur a refusé la suppression (la
sauvegarde est toujours là, et la page continue de la montrer). L’application du joueur en tient compte :

- « Recommencer » garde la partie en cours quand l’autosauvegarde ne peut pas être effacée ;
- « Nouvelle partie » depuis le titre reprend la partie sauvegardée à la place ;
- un import de fichier ne charge jamais par-dessus la partie courante quand sa copie dans un emplacement libre a été
  refusée.

Chaque cas affiche `ui.saveFailed` (valeur anglaise par défaut « Save failed »).

> [!GUARANTEE id=save-refused-write-reported]
> Une écriture refusée par le navigateur (quota plein) fait rejeter `whenIdle()` et elle est signalée ; l’état reste
> en mémoire.

**Ce qui est refusé, et ce qui est ajusté.** Au chargement d’une sauvegarde (l’autosauvegarde au démarrage, un
emplacement, un fichier importé), `parseSave` la confronte au jeu :

- **refusé, sans toucher à la session courante** : une corruption structurelle, la sauvegarde d’un autre jeu, des
  versions d’enveloppe et d’état qui ne s’accordent pas, un lieu courant qui n’existe plus, un joueur actif inconnu,
  une version de sauvegarde sans chaîne de migrations jusqu’au `saveVersion` du jeu (y compris une sauvegarde **plus
  récente** que le jeu : jamais lue à moitié) ;
- **ajusté, avec un seul avertissement visible** : les références que le contenu n’a plus mais dont la reprise n’a pas
  besoin (un objet disparu de l’inventaire, un état d’accessoire qui n’existe plus, un script supprimé ou dont l’id
  d’étape a disparu, le lieu disparu d’un personnage mobile, qui revient alors dans son lieu d’origine). Le joueur voit
  `ui.saveAdjusted` (« Save adjusted for this version ») avec la liste, et Continuer marche toujours.

> [!GUARANTEE id=save-refused-untouched]
> La sauvegarde d’un autre jeu, une forme corrompue ou un lieu courant absent est refusée sans rien changer à la partie
> en cours.

> [!GUARANTEE id=save-stale-pruned]
> Les références périmées dont la reprise n’a pas besoin sont élaguées, et le joueur est prévenu une fois.

**D’une version du moteur à l’autre.** Une sauvegarde écrite par n’importe quelle release des lignées 3.x ou 4.x se
charge dans toute 4.x suivante : l’enveloppe est versionnée (schéma 4 depuis 4.1.15, le schéma 3 toujours lu), et les
`migrations` de votre jeu portent ses ids. `tests/save-v3.test.ts` charge une sauvegarde figée du jeu d’exemple par
release (`tests/fixtures/saves/demo-<version>.json`, de 3.0.0 à 4.4.0 en 4.4.0), la migre et la joue jusqu’à la fin.
Dans le dépôt du moteur, dans un vrai navigateur, `npm run e2e -- --save` vérifie qu’une sauvegarde manuelle survit à
un rechargement, et `--save --no-indexeddb` la même chose pour le repli. La partie stockage de `npm run e2e:a11y` (une
porte de la CI depuis la 3.3, Chromium et WebKit) met à niveau une sauvegarde ancienne avec la vraie version
construite : l’autosauvegarde et l’emplacement v2 en localStorage sont copiés dans IndexedDB et supprimés seulement une
fois la copie vérifiée, une enveloppe 3.1.0 déjà dans IndexedDB est migrée, le bouton Continuer du titre la reprend, et
une sauvegarde manuelle survit ensuite à un rechargement.

Le fichier `.wsrun` d’un speedrun est de schéma 2 depuis 4.1.16 (le monde du run scellé dans sa preuve) ; un fichier
de schéma 1 de 4.1.14 ou 4.1.15 est toujours vérifié, comme un run Story. Son format est dans
[Formats de fichiers](engine.file-formats.md).

> [!LIMIT id=save-own-content-only]
> Le moteur garantit sa propre enveloppe d’une release à l’autre. Que **vos** sauvegardes survivent à un changement de
> **votre** contenu dépend de vos `migrations` : le moteur ne peut pas deviner que vous avez renommé un drapeau.

<a name="renaming-an-id"></a>

## Renommer un id sans casser les sauvegardes

Depuis le schéma 3 (`schemaVersion: 3` dans `game.ts`), tout ce dont la position survit dans une sauvegarde porte un id
explicite et unique : chaque `Rule`, `TalkTopic`, `Choice`, `EventRule`, et chaque bloc `once`, `nth`, `cycle` ou
`random` ; un `ScriptDef` ajoute une entrée `stepIds` par commande de premier niveau. Le validateur refuse un jeu v3
avec des ids absents ou dupliqués. Ainsi, **réordonner le contenu ou traduire un texte ne change plus le sens d’une
sauvegarde** ; renommer un id, si. Le contrat lui-même est dans
[Les principes du contenu](create.principles.md#identity-contract).

```ts
schemaVersion: 3,
// …
{ id: 'ouvrir.garde_manger', verb: 'open', a: 'garde_manger', do: […] }
{ id: 'demander.cle', topic: 'Où est la clé ?', do: […] }
{ once: […], id: 'arrivee.premiere' }
{ id: 'horloge', stepIds: ['attendre', 'sonner'], do: [{ wait: 1000 }, { sfx: 'carillon' }] }
```

L’outil `ids` avec `--write --map` écrit ces ids dans un jeu existant, ainsi que l’étape de migration que ses
sauvegardes demandent (`ids.migration.json`) et la table des chemins de traduction (`ids.paths.json`), à côté des
sources du jeu. Le passage complet au schéma 3 est dans
[Notes de mise à niveau, de la v2 à la v3](install.upgrade-notes-v2-to-v3.md#v3-schema).

**Ce qu’un renommage touche dans une sauvegarde.** Un drapeau, un objet, un lieu, un accessoire, un acteur, une place
de la carte, un script, une étape de script, un personnage jouable, un personnage mobile, l’id du bloc d’un compteur, ou
l’id de ce dont `seen` se souvient (un sujet, un écouteur `once`, un choix `once`). En cas de doute, cherchez l’id parmi
les clés de l’état d’une sauvegarde (le tableau en haut de cette page). L’id d’un hotspot n’y apparaît jamais ; le
renommer peut quand même changer des chemins de traduction (plus bas).

La procédure. Les sources du jeu sont dans `game/` dans un projet créé, dans `games/<id>/` dans le dépôt du moteur ;
les outils se lancent avec `npx quest-n-click <outil>` dans un projet créé, avec `GAME=<id> npm run <outil> --` dans le
dépôt du moteur.

<!-- step: rename-in-content -->
1. **Renommez l’id partout dans le contenu** : sa définition et chaque référence (conditions, commandes, `goals`,
   `objectives`). Le validateur liste comme id inconnu chaque référence oubliée.

<!-- step: bump-save-version -->
2. **Incrémentez `saveVersion`** dans `game.ts`, de un.

<!-- step: add-migration -->
3. **Ajoutez une étape de migration** depuis l’ancienne version, avec le renommage :

   ```ts
   saveVersion: 4,
   migrations: [
     // …les étapes précédentes, inchangées
     { from: 3, renameFlag: { found: 'key_found' } },
   ],
   ```

   La cible renommée doit exister dans le contenu : le validateur refuse `renamed item does not exist: "<id>"` (de
   même pour les lieux, places de la carte, scripts, joueurs, personnages, accessoires et acteurs).

<!-- step: move-texts -->
4. **Suivez les textes.** Les chemins de traduction contiennent des ids (`room:house/props.pantry.name`). Après un
   renommage, lancez `extract --lang <xx>` de l’outil `i18n` pour chaque langue : ce qui ne correspond plus à rien est
   mis de côté sous `_stale:<chemin>` ; déplacez chaque traduction de son ancien chemin vers le nouveau, à la main (voir
   [Traductions](create.translations.md)). Les clips de voix rangés par id de réplique (`audio.voices`,
   `voicesByLang`) se renomment de la même façon ([Voix](create.voices.md)).

<!-- step: check-rename -->
5. **Vérifiez** que le contenu passe la validation et que chaque traduction est toujours en place :

   ```sh
   # dans le projet créé
   npx quest-n-click validate
   npx quest-n-click i18n status

   # dans le dépôt du moteur
   GAME=<id> npm run validate
   GAME=<id> npm run i18n -- status
   ```

Les trois cas que rencontre un joueur, dits de la même façon dans [Sauvegardes](play.saves.md#what-is-kept) et
[Dépannage](play.troubleshooting.md) : un objet disparu se charge, ajusté ; la salle courante disparue est refusée ; la
salle courante renommée avec une migration (`{ from: 2, renameRoom: { entree: 'hall' } }`, [Migrations](#migrations))
se charge, dans `hall`, car la migration passe avant le contrôle de la salle. Avant de supprimer ou de renommer une
salle, gardez donc la salle courante et le joueur actif valides après migration : renommez avec `renameRoom`, jamais en
supprimant l’ancienne salle.

<a name="migrations"></a>

## Emplacements de sauvegarde et migrations

**Les emplacements manuels** se demandent :

```ts
saves: { slots: 3 },   // le menu pause gagne Sauver / Charger avec trois emplacements, plus export et import en fichier JSON
ui: { …, save: 'Sauver', load: 'Charger', slot: 'Emplacement {n}', emptySlot: 'vide', exportSave: 'Exporter en fichier', importSave: 'Importer un fichier', confirmOverwrite: 'Écraser cet emplacement ?' },
```

Absent ou 0 : l’autosauvegarde seule. Les emplacements manuels sont stockés comme l’autosauvegarde : dans IndexedDB, en
enveloppes, relus après chaque écriture. Un fichier importé depuis le menu remplit aussi le premier emplacement libre.
L’autosauvegarde est une enveloppe validée, contrôlée avant de toucher à la partie courante ; le premier lancement d’une
version v3 importe une fois l’ancienne autosauvegarde `<jeu>.save` du localStorage (et les emplacements
`<jeu>.slot.<n>`), et ne les supprime qu’après la copie vérifiée. Ce que le joueur voit des emplacements, de l’export et
de l’import est dans [Les sauvegardes, côté joueur](play.saves.md).

**Les migrations.** Quand le contenu change de façon incompatible, incrémentez `saveVersion` et convertissez l’état,
en données, une étape par version :

```ts
saveVersion: 3,
migrations: [
  { from: 1, renameFlag: { trouve: 'cle_trouvee' }, renameItem: { cle: 'key' } },
  { from: 2, renameRoom: { entree: 'hall' }, renameProp: { 'hall.lampe': 'hall.lanterne' }, dropFlag: ['tmp'] },
],
```

Une étape va de `from` à `from + 1` ; les clés sont les anciens ids, les valeurs les nouveaux. Le type `Migration`
complet ([src/engine/core/types/game.ts](../../src/engine/core/types/game.ts)) :

| Champ | Ce qu’il convertit |
|---|---|
| `renameFlag`, `dropFlag` | Les drapeaux. |
| `renameItem`, `dropItem` | Les objets, dans l’inventaire du joueur actif et dans `used`. |
| `renameRoom` | Le lieu courant, les positions du héros, `visited`, la partie lieu des clés d’accessoires et d’acteurs, `where`. |
| `renameProp`, `renameActor` | `lieu.accessoire` → `lieu.accessoire`, `lieu.acteur` → `lieu.acteur`. |
| `renamePlace` | Les places débloquées de la carte. |
| `renameCounter`, `dropCounter` | Les compteurs des blocs `once` / `nth` / `cycle` / `random`. |
| `renameSeen`, `dropSeen` | Les sujets, écouteurs et choix vus (`topic.<id>`, `event.<id>`, `choice.<id>`). |
| `renameScript`, `dropScript` | Les positions des scripts. |
| `renameScriptStep` | Id du script → ancien id d’étape → nouvel id d’étape. |
| `renamePlayer` | Le joueur actif et les fiches des autres joueurs. |
| `renameCharacter` | Les personnages mobiles dans `where`. |

`renameItem` et `dropItem` n’atteignent pas les inventaires des autres personnages jouables (`players`) : un id d’objet
renommé y devient inconnu, et le chargement l’élague avec l’avertissement ci-dessus.

La chaîne s’applique dans l’ordre, sur une copie, jusqu’à ce que la sauvegarde atteigne `saveVersion`
([src/engine/core/migrate.ts](../../src/engine/core/migrate.ts)). Le validateur refuse deux étapes depuis la même
version, un `from` qui n’est pas inférieur à `saveVersion`, et une cible renommée qui n’existe pas ; il avertit quand une
version n’a pas d’étape (`no migration from version <n>: those saves start a new game`).

> [!GUARANTEE id=migration-newer-save-refused]
> Une sauvegarde plus ancienne est migrée par les étapes du jeu ; une sauvegarde plus récente que le jeu est refusée,
> jamais lue à moitié.

Une sauvegarde sans chemin jusqu’à `saveVersion` n’est pas chargée : le joueur repart d’une nouvelle partie. Ne
convertissez les clés positionnelles de compteurs et de sujets d’un ancien contenu que si vous connaissez ce contenu et
son sens : une fois le contenu réordonné ou traduit, il n’existe pas de conversion automatique sûre. Une référence
facultative périmée non convertie est élaguée avec l’avertissement visible ci-dessus.

<a name="offline-updates"></a>

## Les sauvegardes face aux mises à jour d’un jeu installé

Un jeu publié est une PWA : une fois visité, il se joue hors ligne depuis le cache du service worker. Quand vous
publiez une nouvelle version, un jeu installé la trouve à sa prochaine visite en ligne, et la sauvegarde du joueur
rencontre votre nouveau contenu.

1. **La mise à jour attend une sauvegarde vérifiée.** La page affiche `ui.updateAvailable` (« A new version is
   ready. ») avec un bouton `ui.updateNow` (« Save and update »). Au tap, une partie en cours est d’abord sauvegardée,
   et la nouvelle version n’est activée qu’une fois l’écriture confirmée par le stockage (`offerUpdate` dans
   [src/engine/dom/update.ts](../../src/engine/dom/update.ts)). Si l’écriture est refusée, la mise à jour n’a pas lieu,
   `ui.saveFailed` s’affiche, et le bouton peut être touché de nouveau. Sur l’écran titre, il n’y a pas d’état vivant :
   l’autosauvegarde déjà enregistrée est la progression.
2. **La nouvelle version lit l’ancienne sauvegarde** avec vos `migrations`, comme plus haut : migrée, ajustée avec un
   avertissement, ou refusée (et alors une nouvelle partie).
3. **Tant que le joueur ne touche pas le bouton**, la page ouverte garde la version qu’elle a chargée, hors ligne
   compris. Le nouveau service worker attend (`registerType: 'prompt'`, `skipWaiting: false` dans
   [vite.config.ts](../../vite.config.ts)) ; un navigateur ne passe de lui-même à la nouvelle version qu’une fois tous
   les onglets du jeu fermés, et c’est alors l’autosauvegarde écrite après chaque action qui fait foi.

> [!LIMIT id=update-needs-migrations]
> La mise à jour protège l’écriture, pas le sens : si votre nouveau contenu a renommé un id sans migration, l’ancienne
> sauvegarde perd cette référence (élaguée avec un avertissement) ou, pour un lieu courant qui n’existe plus, est
> refusée.

Sur un Studio hébergé, les aperçus de toutes les révisions partagent la même origine : une sauvegarde faite dans une
révision peut être reprise dans une autre. Une version d’aperçu demande d’abord quand le contenu diffère (Resume here,
Restart, Stay in revision N) ; les versions destinées aux joueurs ne demandent jamais. C’est
l’[ADR 0026](../../docs/dev/adr/0026-saves-across-revisions.md) ; voir
[Aperçu, application, annulation](studio.preview-apply.md).

<a name="why"></a>

## Pourquoi ça marche ainsi

- **Relire avant de compter** ([ADR 0005](../../docs/dev/adr/0005-indexeddb-read-back.md)). Les navigateurs perdent
  des écritures : quota plein, fenêtre privée, onglet tué pendant une écriture, stockage évincé. Une sauvegarde que le
  joueur croit présente et qui ne l’est pas est le pire bug d’un long jeu. Le prix : une lecture de plus par
  sauvegarde, et un stockage asynchrone partout.
- **Les migrations sont des données, pas du code.** Une étape est une liste de renommages et de suppressions : le
  validateur peut vérifier que chaque cible existe, et une migration ne peut pas exécuter de code arbitraire sur la
  sauvegarde d’un joueur. L’alternative, une fonction de migration, serait plus puissante et bien plus difficile à
  vérifier.
- **Élaguer le facultatif, refuser l’essentiel.** Refuser toute sauvegarde contenant une référence périmée ferait
  disparaître Continuer après chaque mise à jour du contenu ; accepter une sauvegarde dont le lieu courant a disparu
  laisserait le joueur nulle part. La frontière entre les deux : « la partie peut-elle reprendre à partir d’elle ».
- **Des ids stables plutôt que des positions** (schéma 3). Avant, un compteur ou un sujet vu était repéré par sa
  position : insérer une règle au-dessus, ou traduire son texte, changeait en silence le sens d’une ancienne
  sauvegarde.

<a name="references"></a>

## Références

- [src/engine/core/save.ts](../../src/engine/core/save.ts), [src/engine/core/migrate.ts](../../src/engine/core/migrate.ts),
  [src/engine/dom/save-store.ts](../../src/engine/dom/save-store.ts), [src/engine/dom/update.ts](../../src/engine/dom/update.ts).
- ADR : [0005](../../docs/dev/adr/0005-indexeddb-read-back.md) (relecture),
  [0026](../../docs/dev/adr/0026-saves-across-revisions.md) (sauvegardes d’une révision du Studio à l’autre).
- Le format du fichier de sauvegarde, champ par champ : [Formats de fichiers](engine.file-formats.md).
- Ce que le projet promet d’une version à l’autre : [Stabilité et support](start.stability.md).
