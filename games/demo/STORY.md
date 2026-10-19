# The Pantry Key — design of the sample game

A 15-minute point-and-click that shows every engine feature once. The hero is **Pixel**, a grey cat (sheet `hero`,
poses: walk, idle, talk, front, back, sleep, curl, stretch, jump, eat). Humans: **Grandma** (`grandma`), **Grandpa**
(`grandpa`, seated poses in `grandpa_seated` and `talk_grandpa/assis`), **Lou the neighbour** (`neighbor`), **the
market seller** (`seller`). A second cat, **Biscuit** (`cat`), sleeps around and reacts to everything.

Premise: Grandma locked the sardines in the pantry and lost the key. Pixel wants the sardines.

## Opening question (sealed ending demo)
Before the first room, a `choice` asks the player: "What do you think is behind the pantry door? Sardines / A mouse /
Nothing at all". It sets the flag `guess`. The ending is sealed with `npm run seal -- --outcome=sardines` and the final
card tells the player whether they guessed right (`ending.guess`).

## Room 1 — Grandma's house (`decor/dining`)
- Props: pantry door (hotspot on the right door, states via a `latch` prop from `home2/r1c3` cabinet closed / `home2/r1c4` open),
  armchair (`home2/r2c1` with remote → `home2/r2c2` without, once searched), shell phone (`items/r4c3`) on the side table,
  clock (`home2/r1c5`), teacup (`home2/r2c3`), Biscuit asleep on the rug (`cat`, pose sleep).
- Actors: Grandma standing near the window (talk topics), Biscuit (kind `cat`).
- Tutorial (`guide`): look at the pantry → talk to Grandma → take the shell phone.
- Grandma topics: "Where is the key?" → "Grandpa had it. He is in the garden fixing the pipes." → `unlock garden`;
  "What's for dinner?" → sardines joke; "Can I have a cuddle?" is the global hug.
- Search the armchair (`open`/`pull` armchair): finds a coin (`items/r2c2` star card used as a "token" — call it a
  *market token*) only once (`once`), second time: "Just crumbs."
- `kinds`: using anything on Biscuit → "Biscuit purrs and goes back to sleep." Pulling Biscuit → "Never pull a cat."
- Hint voice: talking to the shell phone makes **Grandma** answer from the kitchen (offscreen character `grandma_voice`).
  Hints per room follow the puzzle order.

## Room 2 — The garden (`decor/backyard`)
- Props: water tank (`house/r3c5` full → `house/r3c6` draining), a pipe section on the ground (`house/r4c1`), the key
  (`items/r2c4`) hidden, visible only when the tank is drained; a sock (`minigame/r4c1`) that appears instead of the key.
- Actor: Grandpa seated on the bench (`grandpa_seated/r2c1` idle, `r2c3` surprised, `r2c4` laughing).
- Talk to Grandpa: 1st "The key? It fell in the tank. Drain it, the valve is stuck." (`nth` 1), 2nd "Still stuck?", 3rd laughs.
- Use pipe section on tank → minigame `pipes` (tiles from `pipes/r3c1..r4c4`, tank `house/r3c5`, mushrooms `house/r4c5`).
  Win → tank drains (`prop` state), `cutscene`: water sound, Grandpa surprised… the sock appears, not the key.
- Look sock → "A sock, and a note: 'Borrowed the key to copy it. Lou.'" → `set lou_has_key`.
- Use shell phone (`talk` phone or `use` phone) → `phone` two-voice call with Lou: "I'm at the market, come and get it!"
  → `unlock market`.

## Room 3 — The market (`decor/market`)
- Props: the three stalls (`furniture_market/etal_*`), a lantern (`world/r3c4`), a basket of oranges (`minigame/r3c1`),
  a bouquet (`items/r2c1`) on the stall, hidden until won.
- Actors: Lou (neighbor, pose `r4c3` holding a key when she has it), the seller.
- Talk Lou: "I left the key with the seller as a deposit for this lantern. Pay him and it's yours." `choice`: argue / accept.
- Give market token to seller → "A token? I only take flowers today. Bring me the right one." → minigame `pick`
  (rounds over `minigame/r1c1..r1c6`: the seller describes a flower, pick it; wrong = decoy). Win → `gain bouquet`.
- Give bouquet to seller → seller gives the key (`gain key`, `sfx coins`), Lou cheers (`neighbor/r4c2`).
- Map: `map` with three places (house, garden, market), vehicle car (`ui/r2c2`), pin `ui/r1c6`, news `ui/r2c4`.

## Ending
- Back home: use key on pantry → latch open, `cutscene` Pixel eats (`hero` pose eat), Biscuit wakes up, Grandma laughs.
- `{ ending: true }`: scratch ticket (`items/r4c1`) then the sealed card (headline, message, the `guess` verdict).
- Credits.

## Engine features covered
guide, look lists, props with states, visible conditions, kinds, once/nth, choice, talk topics, hints with an offscreen
voice, phone (two voices), unlock + map with vehicle, minigames pipes and pick, cutscene, sfx, music push/pop, ending +
guess, checkpoints per room, used items greyed.

## Sounds (`audio/sfx`, built from `audio/sfx.json` by `npm run audio -- sfx`)
door_open, door_close, latch, coins, cloth, paper, click, success, error, ring, drop, bell, glass, metal, shuffle, chips, pluck, select, bong:
Mega Drive renders (YM2612 + SN76489) from the shared palette, so they sound like the music.
Music: `audio/music/swan_theme.mp3`, the oboe theme of Tchaikovsky's *Swan Lake* (public domain), written out and
arranged for the project (`audio/projects/swan-theme/compose.py`, `spec.json`) and rendered for the Mega Drive chips by
`npm run audio`; played on the title screen and in every room. CC BY 4.0 (`audio/projects/swan-theme/SOURCE.md`).
