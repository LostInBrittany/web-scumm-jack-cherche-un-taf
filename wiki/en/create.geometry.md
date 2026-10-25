# Geometry: placement, walk zones, masks, layers, camera

Where things stand in a room, and how the engine uses it: the layout file, the walk area, approach points, what a tap
touches, the camera of a wide room, and the stage's floors, layers and masks. The logic of the room (what happens) is
in `rooms/<room>.ts`; everything on this page is in `layout/<room>.json`.

<a name="placement"></a>

## Placement: written by the editor, never typed

Each room has a layout, `layout/<room>.json`, written by the placement editor (`/?edit=<room>` on the dev server) or the
Studio's Rooms tab ([placement and stage in the Studio](studio.placement.md)). You drag things on the picture; the
editor saves the file. You never type coordinates by hand, except for a one-off scripted move (`{ walk: [300, 350] }`,
`{ place: … }`).

- **Logical coordinates.** A screen is 640 × 400, origin top-left, whatever the device. A character and a prop are
  placed by their feet (bottom centre).
- **A room without a layout** has nothing clickable: `npm run validate` warns `no layout: nothing will be clickable`.
  A prop or an actor not placed is an error (`no position in the layout`), and so is a hotspot without a zone
  (`no zone in the layout (rect or poly)`).
- **Placed but not declared**: a zone or a position whose id the room does not declare is a warning
  (`zone "x" has no hotspot in the room`, `position "x" has no prop in the room`).
- `/?edit=<room>&at=<checkpoint>` opens the editor in a checkpoint's state, to place a prop in a given state.

<a name="layout-file"></a>

## The layout file

| Field | What | Default |
|---|---|---|
| `width` | the room's width in logical units; wider than 640, the room scrolls ([camera](#camera)) | 640 |
| `floor` | the bottom of the floor (logical y): a computed approach point never goes lower | 395 (`FLOOR`) |
| `walk` | the walkable area: `{ area: [[x, y], …], holes?: [[[x, y], …], …] }` (an outer polygon, holes for furniture) | none: walks go in a straight line |
| `scale` | character scale by depth: `[[back y, scale], [front y, scale]]` | 1 |
| `entries` | the hero's entry points, at least `default` | `default` at [320, 360] |
| `hotspots.<id>` | `rect: [x, y, w, h]` or `poly: [[x, y], …]`, `approach`, `face` | |
| `props.<id>` | `x`, `y` (the feet), `h` (height), `z`, `on`, `flip`, `flipV`, `rot`, `approach`, `states.<state>` | |
| `actors.<id>` | `x`, `y`, `h`, `z`, `flip`, `approach` | |
| `walkZones`, `walkLinks`, `layers`, `occluders`, `lights`, `emitters` | the stage ([below](#layers-and-masks)) | |

Fields read by the engine besides positions:

- On a prop (and in each of its `states`): `rot` (degrees, clockwise, pivot at the feet), `flip` (horizontal mirror),
  `flipV` (vertical mirror: the image sits below the feet line, as on the placement page), `z` (forced depth line).
  A field missing from a state falls back to the prop's own. `on: true` says the prop stands on a piece of furniture.
- On an actor: `z` forces their depth (otherwise it follows their feet); `flip` turns them to face left, unless the
  room's `facing` for them (or one a script left) says otherwise. The placement editor's **mirror ↔** sets it:
  [Placement](studio.placement.md#placement-editor).
- On the room: `floor`.

<a name="approach"></a>

## Approach points and distance to a character

Before acting on something in the room, the hero walks to its approach point, then turns to it (and a character he
acts on turns to him). The point is, in order ([`src/engine/core/world-queries.ts`](../../src/engine/core/world-queries.ts)):

1. the `approach` the layout gives (a hotspot's always; a prop's or an actor's only if it is within 150 units of the
   thing, `NEAR`: farther, it predates a move and is recomputed);
2. for a prop: under its feet, 12 units lower, never below `floor`;
3. for an actor: beside them on the side facing the middle of the room, 44 units away whatever their size; with
   `actorGap` on the game (4.2.4; for example `0.8`), that share of the two characters' mean height (`height` of the
   hero and of the character, or the actor's `h` in the layout), times the depth scale where the character stands;
4. for a hotspot: under the middle of its rectangle or polygon, 12 units lower, never below `floor`.

Tall characters who gesture as they talk end up with a hand in each other's head at 44 units: that is what `actorGap`
is for. An `approach` point in the layout still wins, for a character who needs the other side. `actorGap` is
presentation only, like approach points: no rule nor the solver reads it.

<a name="walk-area"></a>

## The walk area

The walk area is triangulated once (earcut), then a path between two points is the navmesh's shortest path, pulled
straight where the shortcut stays inside ([`src/engine/dom/walk.ts`](../../src/engine/dom/walk.ts)). A target outside
the area is replaced by the **closest point inside it**: the hero walks as near as he can, then the action goes on from
there. A room without `walk` walks in a straight line anywhere.

`scale` sets a character's size by the depth of their feet: in the template, 0.8 at y 250 and 1 at y 396. Character
heights are in logical units (in the demo, Pixel is 36, Grandma 120).

<a name="hit-test"></a>

## What a tap touches

The engine computes, for each frame, the targets of the room and their boxes
([`src/engine/scene/frame.ts`](../../src/engine/scene/frame.ts)):

- the targets are the room's hotspots, its props **with a `name`**, its actors without `interactive: false`, and the
  other playable characters standing there, each only while it is visible;
- a target's box is the drawn image's (rotation included) when it shows one, else the layout's rectangle, else its
  polygon's bounds; a target with none of them is not in the frame: nothing to tap;
- a hotspot with a `poly` is tested against its polygon, anything else against its box (edges included);
- when several targets contain the tap, **the smallest wins** (by box area). No target: the tap is a walk to that
  point of the floor.

Stage layers and occluders are not targets: a foreground layer drawn over a prop does not stop a tap on it.

<a name="camera"></a>
<!-- applies: .. since 3.4.0 -->

## Wide rooms and the camera

A room is 640 × 400 logical units. Give its layout a `width` (for example 960 or 1280: in the editor's "Room width"
folder, or in `layout/<room>.json`) and paint its backdrop that wide (800 px tall, the width in proportion;
`npm run assets` keeps it): the room scrolls, and the camera follows the hero. Positions stay world coordinates (a prop
at x 900 is in the right part). `validate` refuses a `width` under 640 and warns about a zone, a prop or an entry
beyond it.

| Command | Effect |
|---|---|
| `{ camera: { to: 'far_stalls', ms: 900 } }` | Pan to centre on something (an actor, a prop, a zone), then stay there. |
| `{ camera: { pan: 320, ms: 600 } }` | Pan to a left edge, in logical units (clamped to the room). |
| `{ camera: 'follow' }` (or `'reset'`) | Follow the hero again. Entering a room always follows the hero. |

The camera is in the state (a save restores it), the solver ignores it, and "reduce motion" makes every pan instant. A
camera command in a 640-wide room does nothing (`validate` warns). Animations and the rest of staging:
[staging](create.staging.md).

<a name="layers-and-masks"></a>
<!-- applies: .. since 3.4.0 -->

## Floors, layers and masks (the stage)

A room can show more than its backdrop. The content says what exists and when (`stage` in the room: layers, lights,
particles, the logic of walk links); the layout says where; the painter draws it. The content side, lights and
particles are on [the stage](create.stage.md). The geometry is:

- `walkZones.<id> { area, holes?, scale?, zoom?, elevation? }`: several floors. They **replace** `walk` (`validate`
  warns when both are given). Each zone scales the characters by its own depth line (`scale`) and can zoom the camera
  (`zoom`, 1 to 2: a balcony seen closer); a zoomed camera also moves up and down to keep the hero in view. Where zones
  overlap, the one with the higher `elevation` holds the point.
- `walkLinks.<id> { from: { zone, at }, to: { zone, at }, mode, anim?, ms?, facing?, oneWay? }`: how to go from one
  zone to another; `mode` is `walk`, `stairs`, `ladder`, `jump` or `teleport`. A path across zones takes the fewest
  links. Every zone must be joined to another, and reachable from the zone of the `default` entry with every link
  open: `validate` refuses a zone nothing leads to.
- `layers.<id> { x, y, z, parallax: [x, y], blend, opacity }`: where a stage layer stands. Its role (in the content)
  puts it behind everything (`backdrop`), among the characters by its `z` (`scenery`), in front of them
  (`foreground`), or above all (`effect`). `parallax` 1 moves with the room, 0.5 half as fast (behind), 1.2 faster
  (in front).
- `occluders.<id> { polygon | mask | layer, z, feather?, invert? }`: what hides a character standing deeper than `z`
  (a pillar, a counter, a window frame): a polygon, a black-and-white mask image, or a stage layer's alpha.
- `lights.<id> { at, radius }` and `emitters.<id> { area: [x, y, w, h] }`: where the radial lights and the particles
  are.

An old room is a stage of one backdrop (`decor`) and one zone (`walk`, named `main`): nothing to rewrite.

**A closed link.** `stage.links.<id> { if, locked }` in the content closes a link while its condition does not hold.
The hero walks to its foot, says its `locked` line, and the action goes on from there. So the rules of what stands
behind it must check the same condition: `npm run lint` warns (`walk-link-gate`) when a rule on a target behind a
closed link does not. The puzzle is the rule; the link only stops the walk.

> [!GUARANTEE id=closed-link-stops-walk]
> A closed walk link is never crossed: the walk stops at its foot and names the link.

> [!GUARANTEE id=geometry-stage-not-state]
> Layers and lights on the stage are not game state: they do not change what the solver sees. The sample game with a
> foreground layer and a light on every room proves the same: same verdict, same number of states, same softlocks.

> [!LIMIT id=canvas-only-effects]
> Masks from images or layers, lights, particles and blend modes are drawn only by the Canvas painter:
> `renderer: 'canvas'` on the room or the game. On a room the DOM painter draws (the default), `npm run validate` says
> what it will not draw.

<a name="debugging"></a>

## Seeing the geometry

`/?dev` draws the geometry over the room: the walk area in green and its holes in red, hotspots in blue, props in
purple (their box and their feet), actors in green, entry points as pink triangles, the depth-scale lines in orange,
walk links in yellow. An approach point is a dot: **filled** when the layout gives it, **hollow** when the engine
computes it. A hidden hotspot or prop (its `visible` condition false) is not drawn. Press D to hide the overlay. When something cannot be reached, start with
[something is visible but unreachable](create.unreachable.md).

<a name="why"></a>

## Why the geometry is apart

Geometry is edited with the mouse against the picture, and changes for other reasons than the story: a new backdrop
moves every rectangle and no rule. Keeping it in its own file means a placement never touches the logic, the Studio
can write it safely, and the solver ignores it: walking, the camera and the stage are presentation, and what the
solver proves does not depend on them ([what the solver proves](create.solver-proofs.md)). The reference painter is
the DOM, for accessibility; Canvas is allowed for rooms that need its effects
([ADR 0001](../../docs/dev/adr/0001-dom-renderer.md), [ADR 0011](../../docs/dev/adr/0011-scene-frame-intents-journal.md)).

<a name="related"></a>

## Related identifiers

- `FLOOR` (395) and `NEAR` (150) in [`src/engine/core/define.ts`](../../src/engine/core/define.ts); `actorGap` in
  `game.ts`.
- The types: `Layout`, `StageDef` in [`src/engine/core/types/stage.ts`](../../src/engine/core/types/stage.ts).
- [Rooms](create.rooms.md), [staging](create.staging.md), [the stage](create.stage.md),
  [placement in the Studio](studio.placement.md).
