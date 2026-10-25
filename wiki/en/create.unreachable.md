# Something is visible but unreachable

You can see a thing in the room, but tapping it does nothing, picks something else, or the hero stops short of it.
This page goes from what you see to the cause, in the geometry (`layout/<room>.json`) or in the room's content.

<a name="symptom"></a>

## Symptom

One of these, in the game or in the Studio's play view:

- **The tap walks to the floor.** The sentence line says "Walk to" with no name (with a mouse, hovering shows no
  name either), and the hero walks to where you tapped, as on empty floor.
- **The tap names something else.** The sentence line shows another name (the cupboard instead of the key in it).
- **The hero stops short.** The thing is named, the hero walks, but stops away from it, or on the other side of a
  wall, then acts or speaks from there.
- **The hero stops and says a line** such as "The gate is shut." on the way: a closed walk link.
- **The thing is beyond the edge**: in a wide room, the camera never shows it, or the hero cannot walk that far.

<a name="causes"></a>

## Possible causes

**It is not a target.** A tap reaches only the room's hotspots, its props that have a `name`, its actors without
`interactive: false`, and other playable characters standing there, each only while it is visible
([what a tap touches](create.geometry.md#hit-test)). So:

1. The thing is **painted in the backdrop** and no hotspot covers it. A painting is not clickable.
2. It is a **prop without a `name`**: decoration, by design.
3. It is a **hotspot without a zone**: no `rect` nor `poly` in the layout (`validate` says
   `no zone in the layout (rect or poly)`), or the room has no layout at all
   (`no layout: nothing will be clickable`).
4. Its **`visible` condition is false**: a hidden hotspot or prop is not a target. A hotspot is drawn by nothing, so
   the backdrop still shows the thing while the hotspot is hidden.
5. It is an **actor with `interactive: false`** (living scenery), or a **moving character** that is in another room
   now (`moveActor`): its actor shows only in the room it is in.

**Something smaller wins the tap.** When several targets contain the tap, the smallest box wins. A small hotspot
drawn inside a prop's image, or a small prop on a large one, takes the tap there.

**The approach point cannot be reached.** Before acting, the hero walks to the thing's approach point
([approach points](create.geometry.md#approach)):

6. The approach point is **outside the walk area or in a hole**: the walk goes to the closest point inside it instead,
   and the action goes on from there (from afar, or from the wrong side of a counter).
7. There is **no approach point**, and the computed one lands badly: for a prop, 12 units under its feet (never below
   `floor`, 395 by default); for a hotspot, under the middle of its zone. A hotspot high on a wall gets a point in the
   air, then clamped onto the floor's edge.
8. A prop or an actor **moved** more than 150 units from its saved approach point (`NEAR`): the old point is ignored
   and a new one computed.

**A floor is closed or missing** (rooms with `walkZones`):

9. The thing stands in a zone behind a **closed walk link** (`stage.links.<id>.if` false): the hero walks to the
   link's foot and says its `locked` line. If the room's rule on that thing does not check the same condition, the
   action then runs from the wrong side.
10. No link joins its zone, or a one-way link points the wrong way (`validate` refuses a zone nothing leads to).

**The room is wider than it is drawn**:

11. The thing, its zone or an entry is **beyond the layout's `width`** (`validate` warns `… is beyond the room's
    width`), or the room is wider than 640 but its layout has no `width`.

> [!LIMIT id=not-presentation]
> A layer drawn in front of a thing (`foreground`) or an occluder never blocks a tap on it: they only change what you
> see. If the tap reaches the thing and the rule still does not answer, the cause is not here: see the neighbouring
> cases below.

<a name="diagnosis"></a>

## Diagnosis

<!-- step: dev-overlay -->
1. Open the room with the geometry drawn over it: `/?dev&at=<checkpoint>` on the dev server (in the created project or
   the engine repository: `npm run dev`). The walk area is green, its holes red, hotspots blue, props purple, actors
   green, walk links yellow; an approach point is a dot, **filled** when the layout gives it, **hollow** when the engine
   computes it. A hidden hotspot or prop is not drawn. Press D to toggle the overlay.
   - No blue zone or purple box over the thing: causes 1 to 5.
   - A smaller zone inside it: the smaller one wins.
   - The approach dot outside the green area, in red, or far from the thing: causes 6 to 8.

<!-- step: sentence-line -->
2. Tap the thing with no verb picked (or hover it with a mouse): the sentence line says "Walk to" and the name of the
   target the tap reached, or no name.

<!-- step: validate -->
3. Run the checks:

   ```sh
   # in the engine repository
   npm run validate
   npm run lint
   ```

   ```sh
   # in the created project
   npx quest-n-click validate
   npx quest-n-click lint
   ```

   Look for `no zone in the layout`, `no position in the layout`, `no layout`, `is beyond the room's width`,
   `walk zone "…" cannot be reached`, `no walk link (portal) joins walk zone`, and the lint code `walk-link-gate`.

<!-- step: read-content -->
4. In `rooms/<room>.ts`, read the thing's declaration: is it a hotspot or a prop with a `name`, what is its `visible`,
   is the actor `interactive: false`? For a moving character, the DEV panel shows where it is.

<a name="fix"></a>

## Fix

<!-- step: add-target -->
1. **Not a target**: give the painted thing a hotspot (declare it in the room with a `name`, then draw its zone in
   `/?edit=<room>` or the Studio's Rooms tab, and save); give a prop a `name`; fix its `visible` condition; drop
   `interactive: false`.

<!-- step: move-approach -->
2. **Approach**: in `/?edit=<room>`, drag the thing's approach point inside the green area, out of the red holes, next
   to the thing. The point becomes a filled dot and is written to `layout/<room>.json`. Widen the walk area if the
   thing should be reachable from where it stands.

<!-- step: smaller-wins -->
3. **Something smaller wins**: shrink or move the inner zone, or make the inner thing a separate target with its own
   rule; a polygon (`poly`) fits a shape better than a rectangle.

<!-- step: walk-link -->
4. **Closed link**: when it is the puzzle, add the link's condition to the rule's `if` on the thing behind it (what
   `walk-link-gate` asks). When the zone is simply not joined, add a walk link in the editor.

<!-- step: width -->
5. **Width**: set the layout's `width` to the backdrop's logical width, or move the thing inside it.

Never fix a position by typing coordinates in the layout file: the editor writes it, and a hand edit is lost at the next
save ([geometry](create.geometry.md#placement)).

<a name="check-fixed"></a>

## How to check it is fixed

- In `/?dev`, the thing has its zone or box, and its approach dot sits inside the green area.
- A tap names it on the sentence line; the hero walks next to it, turns to it, and the rule answers.
- `validate` and `lint` print none of the messages above.

<a name="neighbours"></a>

## Neighbouring cases

- **The hero reaches it but the answer is a fallback** ("I can't do that"): the tap and the walk work; no written rule
  matched. Check the rule's verb, `a`/`b` and condition ([reactions](create.reactions.md),
  [conditions](create.conditions.md)); `npm run lint` reports a rule that can never run (`rule-never-run`) or that an
  earlier rule hides (`rule-shadowed`).
- **The room itself cannot be reached**: `validate` warns `no exit, goto or map place leads to this room from the start`
  ([exits](create.exits.md), [world map](create.world-map.md)).
- **The item cannot be used any more**: a greyed-out inventory item was marked `used`
  ([items](create.items.md#used)).
- **The hero walks in a straight line through furniture**: the room has no `walk` area, or holes are missing
  ([the walk area](create.geometry.md#walk-area)).
