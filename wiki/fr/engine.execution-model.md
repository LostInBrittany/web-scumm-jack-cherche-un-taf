# Modèle d'exécution

Ce que fait le moteur entre un toucher et l'image suivante : quelle réaction répond à une action, dans quel ordre les
règles sont essayées, ce que change chaque commande, quand l'état est sauvegardé, comment le temps est compté, d'où
vient le hasard, et pourquoi les mêmes entrées retombent toujours sur le même état. Tout ce qui suit est lu dans
`src/engine/core` ; le fichier est cité à chaque fois, pour que vous puissiez le vérifier sur votre version.

<a name="why"></a>

## Pourquoi un seul modèle

La même classe `Engine` ([`engine.ts`](../../src/engine/core/engine.ts)) tourne dans le navigateur, dans les tests
node, dans le solveur et dans l'outil de replay. Elle ne connaît pas la page : tout ce qu'elle montre passe par un
`Presenter` ([`ports.ts`](../../src/engine/core/ports.ts)), tout ce qu'elle garde passe par un `SaveStore`. Le
navigateur branche les vrais ; le solveur et les tests branchent un presenter muet et un stockage en mémoire. L'ordre
des effets décrit ici n'est donc pas celui du seul navigateur : c'est ce que le solveur prouve et ce qu'un replay
reproduit ([Ce que prouve le solveur](create.solver-proofs.md)).

<a name="action-cycle"></a>

## Cycle d'une action

1. **Entrée.** Le joueur choisit un verbe, puis touche une chose (ou un objet du sac, puis une cible). La couche
   d'entrée ([`src/engine/dom/input.ts`](../../src/engine/dom/input.ts)) en fait une intention
   (`{ kind: 'act', verb, target, item }`) ; le presenter appelle `engine.act({ verb, a, b })` (depuis 4.1.11). Un
   double tap choisit le verbe que le joueur veut sans doute dire
   ([`default-verb.ts`](../../src/engine/core/default-verb.ts)).
2. **Moteur occupé ?** `Engine.act` rend `null` et ne fait rien tant que le moteur est occupé (une action, une
   cinématique, une conversation, un pas de script en cours). Pendant une étape de tutoriel (`{ guide }`), seul le
   verbe attendu sur la cible attendue est accepté ; toute autre action fait répéter la consigne au héros et répond
   `'guide'`.
3. **Entrée de session.** L'action ouvre une entrée de la session (`{ act }`,
   [`session-runtime.ts`](../../src/engine/core/session-runtime.ts)) : un pas logique de l'horloge du run.
4. **Approche.** Quand la cible est dans la scène (pas dans le sac), le héros marche jusqu'à son point d'approche (tiré
   du layout) et les deux se tournent l'un vers l'autre. Une marche que le joueur interrompt marque l'entrée `aborted` :
   rien d'autre ne se passe, et le replay de cette entrée ne fait rien non plus.
5. **Résolution.** `resolve` ([`interactions.ts`](../../src/engine/core/interactions.ts)) trouve la réaction qui
   répond (section suivante) et exécute ses commandes.
6. **Commandes.** Les commandes s'exécutent une à une par `exec`
   ([`command-runtime.ts`](../../src/engine/core/command-runtime.ts)) ; chacune change `engine.state` et appelle le
   presenter (dire, marcher, changer un accessoire, jouer un son…).
7. **Sauvegarde.** Quand l'exécution la plus extérieure se termine (`Engine.run`, le compteur d'occupation revenu à
   zéro), le moteur sauvegarde : les objectifs sont vérifiés, puis l'état part au `SaveStore`. Dans le navigateur,
   c'est `IndexedDbSaveStore` ([`save-store.ts`](../../src/engine/dom/save-store.ts)), qui écrit une enveloppe
   versionnée ([`save.ts`](../../src/engine/core/save.ts)) et la relit avant de dire qu'elle est sauvegardée ; les
   emplacements manuels vivent dans la même base, en enveloppes, vérifiés aussi ; `localStorage` est le repli de
   compatibilité. Tout l'état est du JSON simple, un `GameState`
   ([`types/state.ts`](../../src/engine/core/types/state.ts)) : lieu, sac, drapeaux, accessoires, compteurs, ce qui a
   été vu. Le format du fichier est dans [Formats de fichiers](engine.file-formats.md#save).
8. **Rendu.** `App` ([`app.ts`](../../src/engine/dom/app.ts)) est le presenter du navigateur : la vue du lieu
   ([`room.ts`](../../src/engine/dom/room.ts), peinte par le DOM ou, à la demande, par Canvas), la parole
   ([`speech.ts`](../../src/engine/dom/speech.ts)), le sac, la musique
   ([`director.ts`](../../src/engine/dom/director.ts), [`audio.ts`](../../src/engine/dom/audio.ts)). Voir
   [Comment fonctionne le moteur](engine.how-it-works.md#scene-frame).

**Conversations.** Une conversation est une seule action jusqu'à « Au revoir ». Depuis 4.3.0 (#218), elle est aussi
sauvegardée après chaque sujet : ce qu'un sujet a changé survit à une page qui meurt avant « Au revoir ». Seulement
quand la conversation est le reste de son action : le verbe parler sur un personnage qui a des sujets, ou un
`{ talk }` qui est la dernière commande d'une règle. Une conversation suivie d'autres commandes, dans une cinématique
ou dans un sujet, est sauvegardée à la fin de l'action, jamais avec la moitié d'un `do` faite. Une sauvegarde ne
contient pas de conversation ouverte : chargée, elle reprend dans le lieu, les sujets vus marqués.

**Entrer dans un lieu sauvegarde aussi.** L'entrée dans un lieu (`enter`,
[`movement.ts`](../../src/engine/core/movement.ts)) pose le lieu, émet `roomEntered`, place le héros (à l'entrée
demandée, sinon là où il se tenait, sinon à l'entrée `default` du layout, sinon en `[320, 360]`), compte la visite,
**sauvegarde**, puis affiche le lieu, le sac et la musique du lieu, et seulement ensuite exécute le `onEnter` du lieu
et lance ses scripts (quand l'entrée vient d'un `goto` ou de la carte).

**Entre deux actions.** Les scripts du monde avancent d'une commande chacun (`ScriptDef`, `Engine.advance`) : PNJ qui
déambule, gag d'ambiance, personnage qui change de lieu (`moveActor`) quand un événement émis (`emit`) réveille son
`waitEvent`. Leur position vit dans l'état : une sauvegarde les reprend. Voir
[Événements et scripts](#events-and-scripts).

<a name="reaction-order"></a>

## Quelle réaction répond à une action

`resolve` essaie, dans cet ordre, et s'arrête à la première qui répond. La *source* rendue (`'rule'`, `'look'`,
`'talk'`, `'hint'`, `'kind'`, `'refuse'`, `'fallback'`) est ce que lisent le solveur et la session.

| Ordre | Quoi | Quand elle répond |
|---|---|---|
| 1 | Une **règle écrite du lieu** (`room.on`) | La première règle, dans l'ordre d'écriture, dont le verbe correspond, dont le `if` est vrai et dont `a` / `b` correspondent à l'action |
| 2 | Une **règle écrite du jeu** (`rules.on`) | Même test, après toutes les règles du lieu |
| 3 | Les répliques **Regarder** | Verbe `look` sans second objet : le `look[a]` du lieu, sinon le `look` de l'objet s'il est dans le sac |
| 4 | **Parler** : l'objet d'indices | Verbe `talk` sur le `hintItem` du jeu quand il est dans le sac : le premier indice du lieu courant dont le `until` est encore faux |
| 5 | **Parler** : une conversation | Verbe `talk` sur un acteur qui a des sujets dans ce lieu (`room.talk[a]`) |
| 6 | Une réaction de **sorte** (`rules.kinds`) | D'abord celle qui vise exactement cette cible, sinon la première pour une sorte qu'a la cible ; une contrainte `item` ne correspond qu'avec un second objet |
| 7 | **Donner** à un autre personnage jouable | Verbe `give` vers un personnage jouable autre que l'actif, l'objet dans le sac, sacs non partagés : l'objet passe dans son sac (source `'rule'`) |
| 8 | Le **refus** du personnage | Verbe `give` vers un personnage dont la fiche a `refuse` |
| 9 | Une réplique de **repli** | Toujours : `rules.fallbacks[verbe]` (`use2` pour « utiliser A sur B »), sinon les replis de `look`, sinon `…` |

Comment une règle correspond (`findRule`) :

- **Le lieu avant le jeu, puis l'ordre d'écriture.** Toutes les règles du lieu passent avant la moindre règle du jeu ;
  dans chaque liste, la première qui correspond gagne. Il n'y a pas d'autre priorité : ni score de spécificité, ni
  poids.
- **Les sorties passent après les règles écrites de leur lieu.** Une sortie déclarée devient un hotspot de sorte
  `exit` et des règles ajoutées à la fin de `room.on` ([`define.ts`](../../src/engine/core/define.ts)
  `normalizeExits`) : « verbe sur la sortie → `goto` » quand sa condition est vraie, puis sa réplique `locked`. Une
  règle écrite sur la même sortie gagne donc.
- **`a` et `b`.** Une règle sans `b` ne répond qu'à une action sans second objet ; une règle avec `b` ne répond qu'à
  une action qui en a un. `a` ou `b` peut être une liste d'ids. Quand les deux objets sont dans le sac, l'ordre ne
  compte pas : « utiliser A sur B » correspond aussi à une règle écrite pour B sur A.
- **`if`.** La condition de la règle est évaluée sur l'état au moment de l'action (après la marche d'approche).

Pour le solveur, seule une règle écrite (ou un indice) fait avancer le jeu ; les répliques Regarder, les sortes, les
refus et les replis sont des réponses que le joueur voit, rien de plus. Les règles, sortes et replis s'écrivent comme
le disent [Réactions](create.reactions.md) et [Conditions](create.conditions.md).

<a name="command-effects"></a>

## Comment les commandes s'exécutent et ce qu'elles changent

**Une à la fois, dans l'ordre.** `exec` exécute une liste `do` commande par commande, en attendant chacune (une
réplique jusqu'à ce qu'elle soit dite, une marche jusqu'à l'arrivée). Elle s'arrête plus tôt dans deux cas : le
moteur a été détruit (`Engine.destroy`, un aperçu du Studio fermé), ou le jeu est fini (`state.done`). Une simple
chaîne dans une liste est une réplique du héros.

**Chaque commande, par une seule table.** `step` cherche la clé de la commande dans
[`command-handlers.ts`](../../src/engine/core/command-handlers.ts). Le catalogue des clés est
[`cmds.ts`](../../src/engine/core/cmds.ts) (`CMD_KEYS`) ; une vérification de types refuse une commande déclarée à un
endroit et pas à l'autre. Avant qu'une commande s'exécute, l'horloge du run reçoit sa durée logique
([Temps](#time-and-randomness)).

**Ce qui change l'état.** `CHANGES` dans `cmds.ts` liste les commandes qui changent l'état du jeu : `prop`, `show`,
`hide`, `gain`, `lose`, `used`, `set`, `unset`, `inc`, `unlock`, `goto`, `map`, `moveActor`, `emit`, `switchPlayer`,
`transfer`, `custom`, `startScript`, `stopScript`, `minigame`, `phone`, `ending`, `reveal`, `end`. Les autres ne font
que montrer, à ces exceptions près, lues dans les handlers : `walk`, `place`, les quatre mouvements (`launch`,
`spring`, `path`, `follow`), `face` et `pose` notent où un personnage se tient, vers où il regarde ou sa pose
(`state.hero`, `state.actors`), et `camera` note la caméra.

Les effets à connaître, tirés des handlers :

| Commande | Effet sur l'état | Événement du journal |
|---|---|---|
| `set`, `unset`, `inc` | Écrit ou retire un drapeau ; `inc` ajoute `by` (1 par défaut) à un nombre, en partant de 0 | `flagChanged`, seulement quand la valeur change vraiment |
| `gain` | Ajoute l'objet une fois ; efface sa marque `used` | `itemAcquired` s'il n'était pas déjà là |
| `lose` | Retire l'objet, l'état d'abord, puis l'événement | `itemLost` s'il était là |
| `used` | Marque un ou plusieurs objets utilisés (grisés, inertes sauf si une règle les vise encore) | — |
| `goto` | Entre dans le lieu (voir « Entrer dans un lieu sauvegarde aussi ») et exécute son `onEnter` | `roomEntered` |
| `emit` | Déclenche l'événement (section suivante) | — |
| `once`, `nth`, `cycle`, `random` | Tiennent un compteur sous la clé du bloc dans `state.counters` | — |
| `minigame` | Le joue ; un résultat qu'il donne est écrit dans le drapeau réservé `minigame.<id>` (depuis 4.1.16), puis `then` s'exécute | `flagChanged` |
| `custom` | Exécute toujours les `effects` déclarés (des commandes) ; la partie `run` seulement dans le navigateur, jamais dans le solveur ni dans une cinématique passée. En dev, un changement d'état fait par `run` hors de ses `effects` est signalé | — |
| `end`, `ending`, `reveal` | Posent `state.done`, vérifient les objectifs, sauvegardent | `endingReached` |
| `waitEvent` | Rien hors du premier niveau d'un script, où il met le script en pause | — |
| `waitUntil` | Attend que la condition soit vraie, réveillé à chaque changement d'état, borné à 100 000 tours | — |

**Les conteneurs.** `if` exécute `then` ou `else` ; `once` exécute sa liste la première fois seulement ; `nth` exécute
la liste *n* la *n*-ième fois et reste sur la dernière ; `cycle` reboucle ; `random` tire une branche, jamais deux fois
la même d'affilée quand il y en a plusieurs ; `choice` propose les options dont le `if` est vrai (et, pour une option
`once`, pas encore prise), le héros dit le texte choisi, puis son `do` s'exécute ; `parallel` lance toutes les branches
à la fois et attend qu'elles finissent, leurs effets s'entremêlent donc ; `cutscene` exécute sa liste comme passable.

**Les clés de `once`, `nth`, `cycle`, `random`.** `compileGame` donne une clé à chaque bloc : son `id` si vous en avez
écrit un, sinon sa position (`<lieu>:on<i>.<j>`, `game:intro.<i>`… ; [`define.ts`](../../src/engine/core/define.ts)
`assignKeys`). Le compteur est sauvegardé sous cette clé. Réordonnez le contenu au-dessus d'un bloc sans nom et sa clé
change : une sauvegarde faite avant le recompte depuis zéro. Donnez un `id` à un bloc dont la mémoire compte
([État et sauvegardes](create.state-saves.md)).

**Passer une cinématique.** `skip()` pendant une cinématique fait exécuter les commandes restantes en mode *rapide* :
tous leurs effets sur l'état ont lieu, leur présentation est coupée (`sfx` et `shake` ne sont pas joués, marches et
attentes finissent aussitôt). La session note après combien de commandes le passage a eu lieu (`skipAt`) : un replay
passe au même endroit.

> [!LIMIT id=parallel-order]
> Dans un `parallel`, les branches tournent en même temps : l'ordre dans lequel leurs effets sur l'état arrivent dépend
> de la durée de chaque appel au presenter. Le presenter muet du solveur et du replay répond aussitôt : les effets y
> arrivent chaque fois dans le même ordre, qui peut ne pas être celui du navigateur. Gardez les branches d'un
> `parallel` indépendantes (la présentation dans l'une, l'état dans une seule au plus).

<a name="events-and-scripts"></a>

## Événements et scripts

**Un `emit`** ([`event-runtime.ts`](../../src/engine/core/event-runtime.ts)) fait trois choses, dans cet ordre :

1. Chaque script du jeu et de chaque lieu (pas seulement du lieu courant) en pause sur `waitEvent` pour cet événement
   passe à la suite.
2. Les écouteurs du lieu courant (`room.events`) dont le `on` est l'événement et dont le `if` est vrai s'exécutent,
   dans l'ordre d'écriture. Un écouteur `once` qui a déjà tourné est sauté ; il est marqué vu avant de tourner.
3. Puis les écouteurs du jeu (`events`), de la même façon.

Les écouteurs tournent à l'intérieur de l'action qui a émis : l'action est sauvegardée une fois qu'ils ont fini.

**Les scripts** ([`script-runtime.ts`](../../src/engine/core/script-runtime.ts),
[`scheduler.ts`](../../src/engine/core/scheduler.ts)). Dans le navigateur, les scripts tournent tout seuls
(`autoScripts`) : ceux du lieu courant démarrent à chaque entrée dans le lieu, ceux du jeu à chaque nouvelle session ;
chaque boucle appelle `advance`, et attend 250 ms chaque fois que rien n'a tourné. Dans node (tests, solveur), ils
n'avancent que quand on les fait avancer. Un `advance` :

- ne fait rien (`blocked`) tant que le moteur est occupé par une action, une cinématique, une conversation ou un
  mini-jeu, ou que le jeu est fini ;
- avec une condition `while` fausse, ramène le script à sa première commande et attend ;
- sur `waitUntil`, ne passe que quand la condition est vraie ; sur `waitEvent`, attend l'`emit` ;
- sinon exécute exactement une commande, puis sauvegarde quand le moteur est libre ;
- à la fin, s'arrête (`done`), ou repart du début quand le script a `loop`.

Changer de lieu arrête les boucles du lieu à leur pas suivant ; une nouvelle session (nouvelle partie, chargement,
checkpoint) et un changement de personnage arrêtent aussi celles du jeu et les relancent. Un script qui lève une erreur
est arrêté et marqué `off` dans l'état : une sauvegarde ne le montre pas vivant. La position de chaque script (`pc`,
et depuis les sauvegardes v3 son `step` nommé, qui suit le script quand ses commandes sont réordonnées) est dans
l'état.

Le solveur joue les scripts comme des actions (« Script &lt;id&gt; », jusqu'à son prochain `wait` : une ronde est vue
lieu par lieu), essaie chaque option d'un `choice` (le chemin s'écrit `Talk x: "sujet" › "réponse"`), et garde la
valeur exacte d'un compteur qui baisse ou qui est posé à un nombre. Voir
[Ce que prouve le solveur](create.solver-proofs.md).

<a name="time-and-randomness"></a>

## Temps et hasard

ADR 0016 et décision D24 (4.1.14). Trois horloges coexistent, et aucune ne fait autorité pour la logique du jeu.

- **`Engine.clock`** : des millisecondes d'horloge murale, posées par le navigateur seulement. Elle date la session et
  le `t` de chaque entrée. Le solveur et les tests n'en posent pas : leurs sessions sont identiques à l'octet d'une
  exécution à l'autre. Le champ `started` de l'état vient aussi d'elle (sinon de `Date.now()`) ; il n'entre pas dans
  l'empreinte de l'état.
- **L'horloge du run** ([`run-clock.ts`](../../src/engine/core/run-clock.ts), `EngineRunClock`, `Engine.runClock` ;
  `Engine.clock` garde son sens, l'horloge du run est un nouveau nom) : ce qui chronomètre un speedrun. Le cœur
  l'informe de chaque entrée de session (un pas logique), de chaque commande avant qu'elle s'exécute, de chaque
  réplique dite, de chaque marche d'approche arrivée, de chaque entrée dans un lieu en un point et de chaque
  cinématique ouverte et fermée. Elle tient ses propres compteurs (des microticks en `bigint`, 1 ms = 1 000) et
  **n'écrit jamais l'état** ; rien de ce que fait le contenu ne peut en dépendre. `monotonicNow()` est le temps réel
  (RTA), jamais une autorité.
- **Les durées logiques** ([`timing.ts`](../../src/engine/core/timing.ts), `TIMING_VERSION = 1` ; un run note la
  version et un vérificateur en refuse une autre) :

| Quoi | Coût logique |
|---|---|
| Une réplique (un `say`, une simple chaîne, un Regarder, un repli, un indice) | 2 200 ms, quels que soient son texte, sa langue ou la vitesse du texte (`SAY_LOGICAL_MS`) |
| Une marche (la marche d'approche, une commande `walk`) | Sa distance depuis la dernière ancre logique du personnage, divisée par `WALK_SPEED` = 150 unités par seconde, arrondie à la ms |
| `wait` | Son `ms` |
| `anim` | Son `ms`, 800 par défaut |
| Un panoramique `camera` | Son `ms`, 600 par défaut (`follow` et `reset` ne coûtent rien) |
| `launch`, `spring`, `path`, `follow` | Leur `ms`, par défaut 900, 1 200, 1 500 et 0 |
| Tout ce qui tourne en mode *rapide* (une cinématique passée) | Rien (une marche déplace quand même l'ancre) |
| Tout le reste, un choix compris | Rien : le temps de réflexion du joueur n'est que du temps réel (RTA) |

Ce qui tourne dans une cinématique compte dans le temps de jeu (IGT) mais pas dans l'IGT actif. À l'écran, une
réplique dure `max(2 200, 70 ms par caractère) / vitesse du texte` ; ce temps de présentation n'est jamais compté.
Catégories, splits et vérification : [Speedrun pour les auteurs](create.speedrun.md).

**Le générateur à graine** ([`prng.ts`](../../src/engine/core/prng.ts)) : xoshiro128** sur des entiers de 32 bits
(`PRNG_VERSION = 1`), écrit avec `Math.imul` et des décalages non signés seulement : Node, Chromium, WebKit et Firefox
tirent les mêmes nombres de la même graine (`tests/fixtures/prng-vectors.json`). Une graine est une chaîne ;
`derive(seed, stream)` donne des flux indépendants : `logic`, `cosmetic`, `minigame:<id>`, `copy-protection`. Un tirage
cosmétique ne déplace jamais la suite de la logique.

- `engine.random` tire dans le flux `logic` du run (`Engine.sessions.seed`).
- Une **nouvelle partie** ou un **checkpoint** commence un nouveau run : une nouvelle graine (le `nextSeed` de l'hôte
  quand il en a choisi une, sinon 128 bits frais de WebCrypto ; sans WebCrypto, une erreur, jamais un tirage
  devinable) et l'horloge du run remise à zéro.
- Un **chargement** continue le flux et l'horloge.
- La graine n'est écrite dans la session (`Session.seed`) que si l'hôte l'a choisie (une catégorie de speedrun, un
  vérificateur) ; une session que personne n'a semée reste comme avant 4.1.14.
- **Chaque tirage est enregistré** dans l'entrée qui l'a fait (`rnd[]`) : la commande `random`, et le choix d'une
  réplique de repli (qui évite aussi de répéter la précédente).
- Les répliques Regarder et les indices ne sont pas tirés au hasard : ils défilent dans l'ordre, avec un compteur dans
  l'état.
- Les particules ont une graine par émetteur, sur l'horloge de présentation, jamais les dés du moteur.
- `rnd[]` reste la trace : un vérificateur rejoue **sans** la lui donner et exige que les tirages de la graine
  l'égalent.

**Le journal du run.** [`run-tape.ts`](../../src/engine/core/run-tape.ts) fait de chaque entrée un maillon (l'entrée,
les événements sémantiques de son début au début de la suivante, l'horloge du run après elle) ;
[`journal-chunks.ts`](../../src/engine/core/journal-chunks.ts) chaîne les maillons par SHA-256 en chunks de
`SESSION_MAX` = 500 entrées (aussi le renouvellement de la session), chacun écrit en une transaction
([`run-store.ts`](../../src/engine/dom/run-store.ts), IndexedDB `web-scumm-runs`) et relu vérifié. Le speedrun
lui-même (catégories, splits, le `.wsrun`, le vérificateur) est dans `tools/speedrun/` : voir
[Speedrun pour les auteurs](create.speedrun.md) et [Formats de fichiers](engine.file-formats.md).

> [!GUARANTEE id=prng-same-seed-same-draws]
> La même graine donne les mêmes tirages, et la session nomme la graine qu'on lui a donnée.

> [!GUARANTEE id=run-clock-never-writes]
> L'horloge du run observe et n'écrit jamais : l'état est le même qu'on relève ses mesures ou non.

<a name="determinism"></a>

## Déterminisme : enregistrer, rejouer, prouver

**Ce que la session enregistre.** Chaque entrée du joueur est une entrée d'`Engine.session` : une action, un voyage
par la carte, un changement de personnage, un pas de script, un signal extérieur (Reality Bridge). Chaque entrée garde
les réponses rencontrées en chemin : les choix (`picks`), les lieux choisis sur la carte (`maps`), les tirages
(`rnd`), les résultats des mini-jeux (`mg`, depuis 4.1.16) et leurs transcriptions (`mgt`, depuis 4.1.17), le point de
passage d'une cinématique (`skipAt`), ce qui a répondu (`ran` : les ids des règles, sujets, écouteurs, pas de script),
et dans le navigateur une empreinte de l'état après elle. L'empreinte couvre l'état logique (`logicalState`,
[`diff.ts`](../../src/engine/core/diff.ts)) : positions, caméra et horodatages en sont exclus. Une session contient au
plus 500 entrées (`SESSION_MAX`) ; l'entrée suivante en commence une nouvelle à partir de l'état courant.

**Le replay.** `replay()` ([`src/engine/tools/replay.ts`](../../src/engine/tools/replay.ts), `npm run replay`)
exécute une session sur un moteur muet tout neuf et redonne les réponses enregistrées au lieu de les demander ; les
scripts avancent exactement quand ils avaient avancé. Il retombe sur le même état, et dit à quelle entrée il diverge
quand ce n'est pas le cas. Par défaut, les tirages enregistrés sont redonnés (un tirage manquant vaut 0) ; avec une
graine, il écarte les tirages enregistrés et les refait depuis le flux de la graine. Un mini-jeu n'est jamais rejoué :
son résultat enregistré sert, et une transcription enregistrée qui ne donne pas ce résultat arrête le replay.

**Le solveur** ([`src/engine/tools/solve`](../../src/engine/tools/solve/expansion.ts)) fait tourner le même moteur
avec sa propre source de hasard : pour chaque tirage rencontré, il essaie une valeur représentative par branche de
chaque bloc `random` du jeu, si bien que chaque branche est explorée. Il laisse hors de l'état ce qui ne peut pas
changer l'issue (un drapeau que seul son poseur lit, un script d'horloge que personne ne lit, un promeneur que personne
n'attend) : un monde décoratif ne lui coûte rien. Il note ce que chaque action a lu (`Engine.reads`) et ce qui a répondu
(`SessionEntry.ran`) : le profil (`--profile`) dit de quoi les états sont faits, et la réduction d'ordre partiel
(`--por`, [`por.ts`](../../src/engine/tools/por.ts)) saute les ordres d'actions qui commutent. Sa solution est une
session (`SolveResult.steps`), qui se rejoue comme toute autre. Les options sont dans
[Options du solveur](create.solver-options.md).

**Ce qui fait que ça tient.** La logique du moteur ne lit que l'état, le contenu, les réponses enregistrées et le
générateur à graine. L'heure murale ne fait que dater les entrées. La présentation (images d'animation, vitesse du
texte, particules, renderer) ne remonte jamais dans l'état :
[Comment fonctionne le moteur](engine.how-it-works.md#scene-frame).

> [!LIMIT id=determinism-scope]
> Le déterminisme couvre la logique du moteur. La partie `run` d'une commande personnalisée et le code propre d'un
> mini-jeu sont du code de confiance que le moteur ne peut pas vérifier ; seul ce qu'ils déclarent (`effects`) ou
> rapportent (un résultat, une transcription) entre dans l'état et la session. L'heure murale (`t`, `started`, RTA)
> change d'une exécution à l'autre.

<a name="alternatives"></a>

## Alternatives écartées

- **Un coût logique de réplique fonction de sa longueur** : refusé par l'ADR 0016. Une traduction est de la
  présentation ; un run en français et un run en anglais sur le même parcours doivent avoir le même temps de jeu.
- **Le presenter, ou la cadence d'images, comme source de temps** : refusé par D21 et D24. Une durée que le joueur
  pourrait raccourcir sans une entrée que la session enregistre rendrait le temps invérifiable.
- **`Math.random`** : le moteur y tirait jusqu'à 4.1.13, avec `rnd[]` comme simple trace. Les flux à graine de 4.1.14
  permettent à un vérificateur de retirer les mêmes nombres au lieu de croire la trace.
- **Un minuteur qui change l'état tout seul** : il casserait le replay (ADR 0004). Les scripts avancent par pas que la
  session enregistre, et l'horloge du moteur est enregistrée, jamais lue par la logique.

<a name="trade-offs"></a>

## Compromis

- L'ordre d'écriture est simple à lire et à reproduire, mais une règle large placée tôt masque sans bruit une règle
  précise placée plus bas : mettez la règle précise d'abord. Le moteur n'a pas d'autre priorité entre règles.
- Une sauvegarde à chaque entrée dans un lieu et après chaque action, ce sont beaucoup de petites écritures IndexedDB ;
  chacune est relue avant de compter.
- Les clés par position de `once`, `nth`, `cycle` et `random` ne demandent rien à l'auteur, mais bougent quand le
  contenu est réordonné ; un `id` explicite coûte un mot.
- Un observateur de plus sur le chemin le plus chaud du cœur : un appel de fonction par commande et par entrée pour
  l'horloge du run (ADR 0016).
- L'horloge logique ignore le temps que le joueur a vraiment mis à lire ou à réfléchir ; c'est le rôle du RTA, et le
  RTA est la parole du client, pas une preuve.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0002, contenu déclaratif](../../docs/dev/adr/0002-declarative-content.md)
- [ADR 0003, le solveur fait tourner le moteur](../../docs/dev/adr/0003-solver-runs-the-engine.md)
- [ADR 0004, la session comme unité de reproduction](../../docs/dev/adr/0004-session-unit-of-reproduction.md)
- [ADR 0005, IndexedDB relu](../../docs/dev/adr/0005-indexeddb-read-back.md)
- [ADR 0011, trame de scène, intentions, journal](../../docs/dev/adr/0011-scene-frame-intents-journal.md)
- [ADR 0016, horloge du run et enveloppe](../../docs/dev/adr/0016-run-clock-and-envelope.md) (D24)
- [ADR 0020, transcriptions des mini-jeux](../../docs/dev/adr/0020-minigame-transcripts.md)
- [Décisions](../../docs/dev/DECISIONS.md)
