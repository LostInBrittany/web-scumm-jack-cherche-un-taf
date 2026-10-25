# Dialogues

Comment écrire une conversation avec un personnage : des sujets qui apparaissent et changent, des choix, le « Au
revoir » du menu, et ce qui rend une réplique lisible sur un téléphone. La première partie construit une conversation
pas à pas ; la seconde liste les champs.

<a name="overview"></a>

## Ce que vous allez construire

Grand-mère, dans la cuisine, avec quatre sujets : un qui fait avancer l'histoire, un gag récurrent qui change à chaque
fois, un qui n'apparaît qu'une fois la citerne vidée, et un pari que le joueur choisit entre deux réponses. Lui parler
ouvre le menu des sujets ; « Au revoir » le ferme.

<a name="what-you-need"></a>

## Ce qu'il vous faut

- Un jeu avec une salle ([votre premier jeu](create.first-game.md)), et le personnage déclaré dans `game.ts` avec une
  `color` ([personnages](create.characters.md)).
- L'acteur placé dans le layout de la salle ([géométrie](create.geometry.md)).

<a name="steps"></a>

## Étapes

<!-- step: topics -->
1. **Les sujets.** Dans la salle, `talk` liste les sujets par acteur : chacun a un `id` stable, la réplique que dit le
   héros (`topic`) et ce qui suit (`do`). Parler à l'acteur ouvre le menu ; choisir un sujet fait dire la réplique au
   héros, puis lance `do`, et le menu revient jusqu'à ce que le joueur choisisse « Au revoir ».

<!-- step: gag -->
2. **Un gag qui change.** Enveloppez la réponse dans `nth` (ou `cycle`, `random`) : une réponse différente à chaque
   fois, la dernière se répétant ([commandes : logique](create.commands.md#logic)).

<!-- step: conditional -->
3. **Un sujet qui apparaît.** Donnez-lui un `if` : il ne se montre que tant que la condition tient. Le « Il n'y avait
   pas de clé dans la citerne ! » de Papi n'apparaît qu'une fois `tank_drained` posé.

<!-- step: choice -->
4. **Un choix.** Dans `do`, `{ choice: [...] }` propose au joueur des répliques à choisir ; le héros dit celle qu'il a
   prise, puis son `do` s'exécute. `once: true` sur une option ne la montre qu'une fois.

<!-- step: check -->
5. **Vérifiez.** `npm run validate` (dans un projet créé, `npx quest-n-click validate`), puis parlez-lui sur le
   serveur de développement.

La salle entière, vérifiée par le validateur :

```room-example
{
  "room": {
    "id": "kitchen",
    "name": "La cuisine",
    "decor": "decor/kitchen",
    "actors": { "grandma": { "char": "grandma", "facing": "left" } },
    "look": { "grandma": "Grand-mère, qui touille une marmite." },
    "talk": {
      "grandma": [
        { "id": "ask.key", "topic": "Où est la clé ?",
          "do": [{ "say": ["grandma", "En lieu sûr. En lieu mouillé."] }, { "set": "key_hint" }] },
        { "id": "ask.dinner", "topic": "Qu'est-ce qu'on mange ce soir ?",
          "do": [{ "nth": [
            [{ "say": ["grandma", "De la soupe."] }],
            [{ "say": ["grandma", "Toujours de la soupe."] }],
            [{ "say": ["grandma", "De la soupe. C'est toujours de la soupe."] }]
          ], "id": "dinner.count" }] },
        { "id": "ask.tank", "topic": "Il n'y avait pas de clé dans la citerne !", "if": "tank_drained",
          "do": [{ "say": ["grandma", "Alors essaie le garde-manger, mon chat."] }] },
        { "id": "ask.guess", "topic": "Devine qui a volé la clé ?",
          "do": [{ "choice": [
            { "id": "guess.cat", "text": "Le chat.", "do": [{ "set": ["guess", "cat"] }, { "say": ["grandma", "Biscuit ? Jamais."] }] },
            { "id": "guess.grandpa", "text": "Papi.", "once": true, "do": [{ "set": ["guess", "grandpa"] }, { "say": ["grandma", "Hum. Peut-être."] }] }
          ] }] }
      ]
    },
    "hints": [{ "id": "kitchen.hint", "until": "key_hint", "lines": ["Demande la clé à Grand-mère."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "actors": { "grandma": { "x": 420, "y": 350 } }
  },
  "characters": {
    "grandma": { "name": "Grand-mère", "color": "#ff9ec4", "kind": ["person"], "sprites": { "idle": ["grandma/idle"] },
      "hug": "Toujours.", "refuse": "Garde-le, mon chat." }
  }
}
```

<a name="topics"></a>

## Les sujets de conversation

| Champ | Contenu |
|---|---|
| `id` | Id stable, obligatoire en schéma 3 : la sauvegarde retient un sujet entendu sous `topic.<id>`. |
| `topic` | La réplique que dit le héros quand on le choisit (et le libellé du menu). |
| `if` | Le sujet ne se montre que tant que ceci tient. |
| `do` | Ce qui suit. |

Un sujet déjà entendu reste dans le menu, marqué comme vu. Une conversation est une seule action : elle est
sauvegardée en entier à « Au revoir » (depuis 4.3.0, chaque sujet terminé est sauvegardé dès sa fin, quand la
conversation est le reste de l'action). `{ seen: 'topic.ask.key' }` teste qu'un sujet a été entendu
([conditions](create.conditions.md#seen)).

<a name="global-talk"></a>

## « Au revoir » et le câlin

`globalTalk` dans `game.ts` règle ce qu'ajoute chaque menu : `bye` (la dernière entrée, « … » en son absence),
`byeLine` (ce que dit le héros en partant, rien en son absence), `hug` (une entrée de plus, seulement si elle est
posée). Choisir le câlin fait dire la réplique au héros, et le personnage répond par sa réplique `hug` (♥ en son
absence). Donnez à chaque personnage une réplique `hug` et une réplique `refuse` : ça ne coûte rien, et les joueurs
adorent.

<a name="choice"></a>

## Les choix

`{ choice: [{ id, text, do, if?, once?, img? }, …] }` marche partout où marche une commande, dans un sujet ou dans
une cinématique. Seules les options dont le `if` tient sont proposées ; une option `once` disparaît une fois choisie
(retenue sous `choice.<id>`) ; s'il ne reste aucune option, rien ne s'affiche. `img` (un id du manifeste, un portrait
par exemple) montre l'option comme une carte, l'image avec son `text` en libellé (c'est aussi le nom lu par le lecteur
d'écran) ; les cartes viennent d'abord. Le solveur essaie chaque option.

<a name="talk-command"></a>

## Lancer une conversation depuis un script

`{ talk: 'grandma' }` ouvre le menu d'un acteur depuis une règle ou une cinématique. Un personnage parle au héros
sans menu avec `{ say: [...] }` ; un appel, c'est `{ phone: 'grandma', do: [...] }`
([commandes](create.commands.md#sequences)). Un personnage sans sujet répond à Parler par la réponse de repli de
Parler ([réactions](create.reactions.md#fallbacks)).

<a name="writing"></a>

## Bien écrire les dialogues

- **2 à 4 sujets par personnage, dont un qui fait avancer l'histoire.** Grand-mère : « Où est la clé ? » (l'intrigue),
  « Qu'est-ce qu'on mange ? » (un gag avec `nth`), « Pourquoi enfermer les sardines ? » (le personnage). Le sujet de
  l'intrigue vient en premier.
- **Les sujets peuvent apparaître et changer** avec `if`.
- **`choice` avec parcimonie.** Servez-vous-en quand la réponse du joueur est amusante à choisir, pas pour faire
  bifurquer l'histoire. La démo en a deux : le pari d'ouverture (il pose `guess`, jugé à la fin) et le « discuter ou
  accepter » de Lou, où les deux réponses font avancer.
- **Les couleurs de parole** viennent du `color` de chaque personnage. Faites-les distinctes : Grand-mère `#ff9ec4`, Papi
  `#8fd3ff`, Lou `#b8ff8f`, la marchande `#ffb36b`. La voix des indices de la démo reprend exprès la couleur de Grand-mère.
- **La transcription garde chaque réplique.** Les joueurs remontent : ne cachez pas le seul indice dans une réplique
  dite pendant une cinématique, sans autre trace.
- **Longueur d'une réplique sur téléphone : moins de 90 caractères**, deux lignes à l'écran. `validate` prévient
  au-delà de 140, mais 90 est la limite confortable. Coupez les longues tirades en plusieurs `say`.

Les dialogues dans la conception d'un jeu entier : [concevoir les énigmes](create.puzzle-design.md#dialogue).

<a name="what-you-learned"></a>

## Ce que vous avez appris

- Une conversation est une liste de sujets par acteur, chacun une réplique et ses commandes.
- `if` fait apparaître des sujets ; `nth`, `cycle` et `random` font varier les réponses ; `choice` laisse choisir le
  joueur.
- Les sujets entendus et les options choisies sont retenus par leurs ids.

<a name="next"></a>

## Et ensuite

- Voir l'arbre d'une conversation : le Studio, ou l'outil MCP `dialogue_tree` ([outils MCP](studio.mcp-tools.md)).
- Traduire les répliques ([traductions](create.translations.md)) et les faire dire ([voix](create.voices.md)).
- [Scripts et événements](create.scripts-events.md), pour ce qui se passe sans tap.
