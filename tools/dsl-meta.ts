// What the generated DSL page says of each condition and command (4.1.12, tools/dsl-doc.ts), in English and French.
// The shapes come from the schemas (src/studio/schema.ts `CMD_SPECS`, src/engine/core/ir-schema.ts); the sentences
// live here, typed over every key: a command or a condition added to the DSL without its sentence does not compile.
import type { CmdKey } from '../src/engine/core/cmds';
import type { CondKind } from '../src/studio/schema';

/** One sentence in each language. */
export type Said = readonly [en: string, fr: string];

/** Each kind of condition: how it is written, and what it means. */
export const COND_DOCS: Record<CondKind, { shape: string; said: Said }> = {
  flag: {
    shape: "'flag'",
    said: [
      'The flag is set (true, a number other than 0, a word).',
      'Le drapeau est levé (vrai, un nombre autre que 0, un mot).',
    ],
  },
  notflag: {
    shape: "'!flag'",
    said: ['The flag is false or was never set.', "Le drapeau est faux ou n'a jamais été levé."],
  },
  has: { shape: "{ has: 'item' }", said: ['The player holds the item.', "Le joueur porte l'objet."] },
  flagvalue: {
    shape: "{ flag: 'x', eq?: value, gte?: n, lt?: n }",
    said: [
      "The flag's value equals, reaches or stays under a number.",
      'La valeur du drapeau égale, atteint ou reste sous un nombre.',
    ],
  },
  not: { shape: '{ not: cond }', said: ['The condition does not hold.', "La condition n'est pas vraie."] },
  all: { shape: '{ all: [cond, …] }', said: ['Every condition holds.', 'Toutes les conditions sont vraies.'] },
  any: { shape: '{ any: [cond, …] }', said: ['At least one condition holds.', 'Au moins une condition est vraie.'] },
  visited: {
    shape: "{ visited: 'room' }",
    said: ['The room has been entered at least once.', 'La salle a été visitée au moins une fois.'],
  },
  room: { shape: "{ room: 'room' }", said: ['The player is in this room.', 'Le joueur est dans cette salle.'] },
  prop: {
    shape: "{ prop: ['room.prop', 'state'] }",
    said: ['The prop is in that state.', "L'accessoire est dans cet état."],
  },
  unlocked: {
    shape: "{ unlocked: 'place' }",
    said: ['The place is unlocked on the map.', 'Le lieu est débloqué sur la carte.'],
  },
  seen: {
    shape: "{ seen: 'key' }",
    said: ['The topic, choice or listener was already seen.', "Le sujet, le choix ou l'écouteur a déjà été vu."],
  },
  actorIn: {
    shape: "{ actorIn: ['who', 'room'] }",
    said: ['The character is in that room.', 'Le personnage est dans cette salle.'],
  },
  player: {
    shape: "{ player: 'who' }",
    said: ['This character is the one the player controls.', 'Le joueur contrôle ce personnage.'],
  },
};

/** Each command: what it does, in one sentence. */
export const CMD_DOCS: Record<CmdKey, Said> = {
  say: [
    'A character says a line (a plain string is the hero).',
    'Un personnage dit une réplique (une chaîne seule : le héros).',
  ],
  walk: ['A character walks to a thing or a point.', 'Un personnage marche vers une chose ou un point.'],
  face: [
    'A character turns left, right or towards a thing.',
    'Un personnage se tourne à gauche, à droite ou vers une chose.',
  ],
  pose: ['A character takes a pose until told otherwise.', "Un personnage prend une pose jusqu'à nouvel ordre."],
  anim: [
    'A character plays a pose once, with commands at chosen frames.',
    'Un personnage joue une pose une fois, avec des commandes à des images choisies.',
  ],
  place: ['A character appears at a point, without walking.', 'Un personnage apparaît à un point, sans marcher.'],
  wait: ['Waits that many milliseconds.', 'Attend ce nombre de millisecondes.'],
  parallel: [
    'Runs several lists at the same time, until all end.',
    "Joue plusieurs listes en même temps, jusqu'à la fin de toutes.",
  ],
  camera: [
    'Moves the camera of a wide room: follow, pan, or centre on a thing.',
    "Déplace la caméra d'une salle large : suivre, glisser, ou centrer sur une chose.",
  ],
  play: ["Plays a prop's animation.", "Joue l'animation d'un accessoire."],
  stopAnim: ["Stops a prop's looping animation.", "Arrête l'animation en boucle d'un accessoire."],
  launch: [
    'Throws a thing along a ballistic arc (presentation only).',
    'Lance une chose en arc balistique (présentation seulement).',
  ],
  spring: [
    'Makes a thing swing and settle (presentation only).',
    'Fait osciller une chose puis la pose (présentation seulement).',
  ],
  path: [
    'Moves a thing along a smooth path (presentation only).',
    'Déplace une chose le long d’un chemin lissé (présentation seulement).',
  ],
  follow: [
    'Keeps a thing next to another for a while (presentation only).',
    'Garde une chose près d’une autre un moment (présentation seulement).',
  ],
  prop: ['Puts a prop in a state.', 'Met un accessoire dans un état.'],
  show: ['Shows a hidden thing, with an optional fade.', 'Montre une chose cachée, avec un fondu possible.'],
  hide: ['Hides a thing, with an optional fade.', 'Cache une chose, avec un fondu possible.'],
  gain: ['The player gains an item.', 'Le joueur reçoit un objet.'],
  lose: ['The player loses an item.', 'Le joueur perd un objet.'],
  used: [
    'Marks items used: kept, greyed, offered only to a rule that names them.',
    'Marque des objets utilisés : gardés, grisés, proposés seulement à une règle qui les nomme.',
  ],
  set: ['Sets a flag (true, or the value given).', 'Lève un drapeau (vrai, ou la valeur donnée).'],
  unset: ['Removes a flag.', 'Retire un drapeau.'],
  inc: ['Adds to a flag counted as a number.', 'Ajoute à un drapeau compté comme un nombre.'],
  unlock: ['Unlocks a place on the map.', 'Débloque un lieu sur la carte.'],
  goto: [
    'Takes the player to a room, at an entry or a point.',
    'Emmène le joueur dans une salle, à une entrée ou un point.',
  ],
  map: ['Opens the travel map.', 'Ouvre la carte de voyage.'],
  moveActor: ['Moves a character to another room.', 'Déplace un personnage dans une autre salle.'],
  emit: [
    "Fires an event: the room's listeners, then the game's.",
    'Déclenche un événement : les écouteurs de la salle, puis ceux du jeu.',
  ],
  waitUntil: ['In a script: pauses until the condition holds.', 'Dans un script : attend que la condition soit vraie.'],
  waitEvent: [
    'In a script: pauses until the event is fired.',
    "Dans un script : attend que l'événement soit déclenché.",
  ],
  switchPlayer: ['The player takes another playable character.', 'Le joueur prend un autre personnage jouable.'],
  transfer: ['Hands an item to another playable character.', 'Donne un objet à un autre personnage jouable.'],
  custom: [
    'Runs a custom command: its declared effects, then its browser code.',
    'Lance une commande personnalisée : ses effets déclarés, puis son code navigateur.',
  ],
  startScript: ['Starts a script from its first command.', 'Démarre un script à sa première commande.'],
  stopScript: ['Stops a script until it is started again.', "Arrête un script jusqu'à ce qu'il redémarre."],
  sfx: ['Plays a sound effect, with an optional caption.', 'Joue un bruitage, avec une légende possible.'],
  music: [
    'Changes the music: a track, push, pop, stop, once or a stinger.',
    'Change la musique : un morceau, empiler, dépiler, arrêter, une fois, ou un jingle.',
  ],
  toast: ['Shows a short message at the top of the screen.', "Affiche un court message en haut de l'écran."],
  shake: ['Shakes the screen that many milliseconds.', "Secoue l'écran ce nombre de millisecondes."],
  if: ['Runs `then` when the condition holds, else `else`.', 'Joue `then` si la condition est vraie, sinon `else`.'],
  once: ['Runs its list the first time only.', 'Joue sa liste la première fois seulement.'],
  nth: [
    'Runs the next list each time, the last one again after.',
    'Joue la liste suivante à chaque fois, puis la dernière.',
  ],
  cycle: ['Runs its lists in turn, looping.', 'Joue ses listes tour à tour, en boucle.'],
  random: [
    'Runs one of its lists at random (recorded for replays).',
    'Joue une de ses listes au hasard (enregistré pour les rejeux).',
  ],
  cutscene: ['Runs a list the player can skip.', 'Joue une liste que le joueur peut passer.'],
  choice: [
    'Offers the player options, each with its commands; an option with an `img` shows as a card (the image, its text under it), the cards first.',
    "Propose des options au joueur, chacune avec ses commandes ; une option avec `img` s'affiche en carte (l'image, son texte dessous), les cartes d'abord.",
  ],
  minigame: ['Starts a minigame, then runs `then`.', 'Lance un mini-jeu, puis joue `then`.'],
  phone: ['An incoming call from one or several characters.', "Un appel entrant d'un ou plusieurs personnages."],
  guide: [
    'A tutorial step: waits for that verb on that target.',
    'Une étape du tutoriel : attend ce verbe sur cette cible.',
  ],
  talk: ['Opens a conversation with a character.', 'Ouvre une conversation avec un personnage.'],
  hint: ['Gives the next hint of the room.', "Donne l'indice suivant de la salle."],
  ending: [
    'The sealed ending: decrypted, scratched, celebrated, then its card.',
    'La fin scellée : déchiffrée, grattée, fêtée, puis sa carte.',
  ],
  reveal: ['The old name of `ending` (removed in 5.0).', "L'ancien nom de `ending` (retiré en 5.0)."],
  end: ['Ends the game.', 'Termine le jeu.'],
};
