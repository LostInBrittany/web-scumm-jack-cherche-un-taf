# Le DSL, généré depuis ses schémas

Un jeu est une donnée (`docs/fr/CONTENT_GUIDE.md` montre comment l'écrire) : des conditions et des commandes dans les
salles, les règles, les sujets, les écouteurs et les scripts, typées par `web-scumm/content`. Cette page est la
référence de ce vocabulaire, générée par `npx tsx tools/dsl-doc.ts` depuis les schémas que lisent les outils eux-mêmes :
les formulaires du Studio (`src/studio/schema.ts`), le schéma de l'IR (`src/engine/core/ir-schema.ts`) et la table qui
dit ce que compte chaque champ d'un jeu (`src/engine/core/ir-fields.ts`). `tests/dsl-doc.test.ts` échoue quand la page
est en retard sur eux : ce que vous lisez ici est ce qu'acceptent le validateur, le solveur et le Studio.

## Stabilité

Depuis 4.1.12, les noms et les sens listés ci-dessous sont **stables** (D22) : en changer un est une rupture livrée
avec sa migration des jeux fournis et des sauvegardes. Ce qui peut encore grandir jusqu'à 4.1.15, et ce qui est gelé
ensuite pour la 4.2, est écrit dans `docs/dev/DSL-STABILITY.md`, avec les primitives proposées pour cette version et
pourquoi chacune a été admise ou refusée. Une nouvelle primitive entre avec un court enregistrement de décision et
atteint le runtime, le validateur, le solveur, le replay, le Studio, MCP et cette page (`tests/propagation.test.ts`).

## Le jeu tel que le voient les outils

`npm run ir` imprime la représentation intermédiaire du jeu : sa logique en données simples, chaque id avec le fichier
et la ligne qui l'écrivent. L'onglet **Language** du Studio montre la même, et `get_ir` de MCP la renvoie. L'empreinte
du jeu la hache (`logic`), avec à part les extensions de confiance, la présentation et le moteur ; le menu pause en
montre la forme courte. Voir `docs/dev/adr/0013-game-ir-and-fingerprint.md`.

## Référence

<!-- dsl-doc:begin -->
### Conditions

Une condition est une donnée : une chaîne pour un drapeau, un objet pour le reste, imbriqués avec `not`, `all`, `any`.

| Écrit | Signifie |
|---|---|
| `'flag'` | Le drapeau est levé (vrai, un nombre autre que 0, un mot). |
| `'!flag'` | Le drapeau est faux ou n'a jamais été levé. |
| `{ has: 'item' }` | Le joueur porte l'objet. |
| `{ flag: 'x', eq?: value, gte?: n, lt?: n }` | La valeur du drapeau égale, atteint ou reste sous un nombre. |
| `{ not: cond }` | La condition n'est pas vraie. |
| `{ all: [cond, …] }` | Toutes les conditions sont vraies. |
| `{ any: [cond, …] }` | Au moins une condition est vraie. |
| `{ visited: 'room' }` | La salle a été visitée au moins une fois. |
| `{ room: 'room' }` | Le joueur est dans cette salle. |
| `{ prop: ['room.prop', 'state'] }` | L'accessoire est dans cet état. |
| `{ unlocked: 'place' }` | Le lieu est débloqué sur la carte. |
| `{ seen: 'key' }` | Le sujet, le choix ou l'écouteur a déjà été vu. |
| `{ actorIn: ['who', 'room'] }` | Le personnage est dans cette salle. |
| `{ player: 'who' }` | Le joueur contrôle ce personnage. |

### Commandes

Une commande est une clé de `CMD_KEYS` ; ses champs sont ceux du formulaire du Studio. Une chaîne seule est une réplique du héros.

| Commande | Forme | Fait |
|---|---|---|
| `say` | `{ say: [who, line], id?: id, shout?: true, voice?: id }` | Un personnage dit une réplique (une chaîne seule : le héros). |
| `walk` | `{ walk: target \| [x, y], who?: who }` | Un personnage marche vers une chose ou un point. |
| `face` | `{ face: target, who?: who }` | Un personnage se tourne à gauche, à droite ou vers une chose. |
| `pose` | `{ pose: [who, pose] }` | Un personnage prend une pose jusqu'à nouvel ordre. |
| `anim` | `{ anim: [who, pose], ms?: number, at?: … }` | Un personnage joue une pose une fois, avec des commandes à des images choisies. |
| `place` | `{ place: [who, at], face?: 'left' \| 'right' }` | Un personnage apparaît à un point, sans marcher. |
| `wait` | `{ wait: number }` | Attend ce nombre de millisecondes. |
| `parallel` | `{ parallel: [[cmd, …], …] }` | Joue plusieurs listes en même temps, jusqu'à la fin de toutes. |
| `camera` | `{ camera: … }` | Déplace la caméra d'une salle large : suivre, glisser, ou centrer sur une chose. |
| `play` | `{ play: [prop, animation] }` | Joue l'animation d'un accessoire. |
| `stopAnim` | `{ stopAnim: prop }` | Arrête l'animation en boucle d'un accessoire. |
| `launch` | `{ launch: { target: who, to: target \| [x, y], from?: target \| [x, y], height?: number, ms?: number, rotate?: number } }` | Lance une chose en arc balistique (présentation seulement). |
| `spring` | `{ spring: { target: who, axis?: 'x' \| 'y' \| 'rot', amplitude?: number, frequency?: number, damping?: number, ms?: number } }` | Fait osciller une chose puis la pose (présentation seulement). |
| `path` | `{ path: { target: who, points: [[x, y], …], ms?: number, orient?: true } }` | Déplace une chose le long d’un chemin lissé (présentation seulement). |
| `follow` | `{ follow: { target: who, leader: who, offset?: [x, y], ms: number } }` | Garde une chose près d’une autre un moment (présentation seulement). |
| `prop` | `{ prop: [prop, state] }` | Met un accessoire dans un état. |
| `show` | `{ show: target, fade?: number }` | Montre une chose cachée, avec un fondu possible. |
| `hide` | `{ hide: target, fade?: number }` | Cache une chose, avec un fondu possible. |
| `gain` | `{ gain: item }` | Le joueur reçoit un objet. |
| `lose` | `{ lose: item }` | Le joueur perd un objet. |
| `used` | `{ used: item }` | Marque des objets utilisés : gardés, grisés, proposés seulement à une règle qui les nomme. |
| `set` | `{ set: flag }` | Lève un drapeau (vrai, ou la valeur donnée). |
| `unset` | `{ unset: flag }` | Retire un drapeau. |
| `inc` | `{ inc: flag, by?: number }` | Ajoute à un drapeau compté comme un nombre. |
| `unlock` | `{ unlock: place }` | Débloque un lieu sur la carte. |
| `goto` | `{ goto: room, at?: id \| [x, y] }` | Emmène le joueur dans une salle, à une entrée ou un point. |
| `map` | `{ map: true }` | Ouvre la carte de voyage. |
| `moveActor` | `{ moveActor: [who, room], at?: id \| [x, y] }` | Déplace un personnage dans une autre salle. |
| `emit` | `{ emit: event }` | Déclenche un événement : les écouteurs de la salle, puis ceux du jeu. |
| `waitUntil` | `{ waitUntil: cond }` | Dans un script : attend que la condition soit vraie. |
| `waitEvent` | `{ waitEvent: event }` | Dans un script : attend que l'événement soit déclenché. |
| `switchPlayer` | `{ switchPlayer: char }` | Le joueur prend un autre personnage jouable. |
| `transfer` | `{ transfer: [item, to] }` | Donne un objet à un autre personnage jouable. |
| `custom` | `{ custom: command, args?: … }` | Lance une commande personnalisée : ses effets déclarés, puis son code navigateur. |
| `startScript` | `{ startScript: script }` | Démarre un script à sa première commande. |
| `stopScript` | `{ stopScript: script }` | Arrête un script jusqu'à ce qu'il redémarre. |
| `sfx` | `{ sfx: sfx, caption?: text }` | Joue un bruitage, avec une légende possible. |
| `music` | `{ music: … }` | Change la musique : un morceau, empiler, dépiler, arrêter, une fois, ou un jingle. |
| `toast` | `{ toast: text, id?: id }` | Affiche un court message en haut de l'écran. |
| `shake` | `{ shake: number }` | Secoue l'écran ce nombre de millisecondes. |
| `if` | `{ if: cond, then: [cmd, …], else?: [cmd, …] }` | Joue `then` si la condition est vraie, sinon `else`. |
| `once` | `{ once: [cmd, …], id?: id }` | Joue sa liste la première fois seulement. |
| `nth` | `{ nth: [[cmd, …], …], id?: id }` | Joue la liste suivante à chaque fois, puis la dernière. |
| `cycle` | `{ cycle: [[cmd, …], …], id?: id }` | Joue ses listes tour à tour, en boucle. |
| `random` | `{ random: [[cmd, …], …], id?: id }` | Joue une de ses listes au hasard (enregistré pour les rejeux). |
| `cutscene` | `{ cutscene: [cmd, …] }` | Joue une liste que le joueur peut passer. |
| `choice` | `{ choice: [{ id?: id, text: text, if?: cond, once?: true, do: [cmd, …] }, …] }` | Propose des options au joueur, chacune avec ses commandes. |
| `minigame` | `{ minigame: minigame, params?: …, then?: [cmd, …] }` | Lance un mini-jeu, puis joue `then`. |
| `phone` | `{ phone: char, do: [cmd, …] }` | Un appel entrant d'un ou plusieurs personnages. |
| `guide` | `{ guide: { verb: verb, target: target, say: text }, id?: id }` | Une étape du tutoriel : attend ce verbe sur cette cible. |
| `talk` | `{ talk: char }` | Ouvre une conversation avec un personnage. |
| `hint` | `{ hint: true }` | Donne l'indice suivant de la salle. |
| `ending` | `{ ending: true, after?: [cmd, …] }` | La fin scellée : déchiffrée, grattée, fêtée, puis sa carte. |
| `reveal` | `{ reveal: true, after?: [cmd, …] }` | L'ancien nom de `ending` (retiré en 5.0). |
| `end` | `{ end: true }` | Termine le jeu. |

### Objectifs (`GameDef.objectives[id]`)

| Champ | Type | Signifie |
|---|---|---|
| `title` | string | Ce que montre le journal de quêtes (traduit sous `objectives/<id>.title`). |
| `done` | cond | Accompli la première fois que cette condition est vraie après une action ; de préférence une condition qui le reste. |
| `optional` | boolean (facultatif) | Un objectif secondaire : hors du 100 % (`npm run solve -- --goal=100%`). |
| `parent` | string (facultatif) | L'objectif dont celui-ci est une étape : affiché sous lui. |

### Ce que compte chaque champ (IR et empreinte)

Selon `core/ir-fields.ts` : `logic` est dans l’IR et dans le `logic` de l’empreinte ; `presentation` dans son `presentation` ; `both` se partage ; `meta` ne sert qu’aux outils.

Le jeu (`GameDef`) :

- **logic** : `schemaVersion`, `id`, `saveVersion`, `hero`, `players`, `hintItem`, `hintVoice`, `rules`, `scripts`, `events`, `globalTalk`, `start`, `reality`, `checkpoints`, `invariants`, `migrations`, `objectives`, `remix`, `variant`
- **both** : `verbs`, `characters`, `items`, `rooms`, `map`
- **presentation** : `title`, `renderer`, `audio`, `skin`, `ending`, `saves`, `settings`, `input`, `actorGap`, `ui`, `titleScreen`, `creditsScreen`, `credits`
- **meta** : `lang`, `offline`, `lint`, `i18n`, `assetBudgets`, `speedrun`

Une salle (`RoomDef`) :

- **logic** : `id`, `name`, `hotspots`, `look`, `on`, `talk`, `hints`, `onEnter`, `scripts`, `events`, `hero`, `anchors`
- **both** : `props`, `actors`, `exits`, `stage`
- **presentation** : `decor`, `music`, `renderer`
- **meta** : `description`, `furniture`
<!-- dsl-doc:end -->
