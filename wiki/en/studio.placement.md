# Placement and stage

Where things stand in a room (zones, feet, heights, approach points, the walkable area, depth scale, entries) and the
room's stage geometry (layers, masks, walk zones and their links) are placed with the mouse, never typed by hand.

<a name="what-you-get"></a>

## What you get

A room whose `layout/<room>.json` holds every place the room needs, set by dragging in the engine's own view, and a
stage (layers, occlusion masks, walk zones, links between them) the validator accepts.

<a name="context-and-versions"></a>

## Context and versions

The placement editor runs on any dev server: in the Studio's Rooms tab, or alone at `?edit=<room>` on the game
(`npm run dev`). The stage editor is the Rooms tab's. True from 4.2.1 (a saved layout is one operation of the game's
journal); the `actorGap` setting below from 4.2.4.

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)), or `npm run dev`.
- Every entity declared in the room file ([Edit a room](studio.edit-room.md)); the editor offers a place to those the
  layout lacks.

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository or the created project, on your machine. The editor itself is in the browser.

<a name="steps"></a>

## Steps

<a name="place-everything"></a>

### Place everything

Geometry lives apart from logic, in `games/<id>/layout/<room>.json`, and is never typed by hand. Three ways:

<!-- step: open-editor -->
1. **In the Studio**: the Rooms tab shows the room with the placement editor on top (it is the page
   `/?edit=<room>&at=<checkpoint>` in an iframe). Or **in the game alone**: start the dev server and open the room's
   editor.

   ```sh
   # in the engine repository or the created project
   npm run dev
   # then open http://localhost:5173/?edit=<room>
   ```

<!-- step: phone-page -->
2. **On a phone without the dev server**: publish a drag-and-drop page, place things on it, and bring the result back.

   ```sh
   # in the engine repository
   npm run page:placement
   npm run import-layout <file>
   ```

<!-- step: drag -->
3. Drag, then **Save the layout** (the gestures below). In the Studio, a placement in progress is saved before any
   other save of the room.

<a name="placement-editor"></a>

### The placement editor (`?edit=<room>`)

On start, the editor loads the first checkpoint located in that room; if there is none, it starts from a fresh
state, without playing an arrival script. All coordinates are logical (640 × 400).

| Gesture | Effect |
|---|---|
| Drag a zone | Move it, with its approach point |
| Drag a corner | Resize the zone |
| Drag a foot point (circle) | Move a prop or a character, with its approach point |
| Drag the square above the foot, or scroll | Set the height |
| Drag a small circle (filled or hollow) | Place the approach point: where the hero goes before acting |
| Drag a vertex of the walkable zone or a hole | Move it |
| Double-click an edge of the walkable zone | Add a vertex |
| Alt-click a vertex | Delete it; on a hole reduced to 3 vertices, delete the hole |
| Drag an orange depth-scale line | Change its depth (y); the scale factor is set in the panel |
| Drag a pink triangle | Move an entry point |

The editor's panel:

- **Save the layout**: writes `games/<GAME>/layout/<room>.json`, coordinates rounded to the unit; the page then
  reloads with the saved file.
- **Reload (undo)**: discards unsaved changes.
- **hidden zones**: also shows zones and props whose visibility condition is false (dashed).
- **Selection**: the touched element and its values. For a prop or a character, **mirror ↔** turns it around (the
  layout's `flip`) and, for a prop, **mirror ↕** turns it upside down (`flipV`), as the placement page does; the room
  is redrawn at once and the change is saved with the layout. A prop is mirrored in the state shown when that state
  sets its own mirror, otherwise on the prop itself. A character whose room sets `facing` keeps it: the room's
  `facing` wins over the layout's `flip`, and the panel says so under the checkbox.
- **To place**: one button per hotspot, prop or actor defined in the room but missing from the layout; it creates it
  at the centre, ready to be moved.
- **Walkable zone**: create the zone, add a hole.
- **Depth scale**: create the scale, set the back and front factors.
- **Entries**: add an entry point by name (`default` is the one used by default).
- **Room width**: the logical width of a wide room (640 = no scrolling) and a camera slider to look around while
  placing.
- **Walk zones** folder: makes the single walk polygon a zone, adds zones (holes, zoom) and links between them (mode,
  duration, one way).
- **Stage** folder: each layer's depth, parallax, blend and opacity; occluders drawn as polygons (depth, feather,
  invert); lights and particle areas placed. Handles: drag; double-click a zone edge to add a vertex; Alt-click one to
  remove it.

For a prop with a per-state position (`states` in the layout, a pulled-out stool for instance), the editor edits the
variant of the state shown.

Inside the Studio the editor runs in an iframe and talks to the page with `postMessage` (same origin only). In an
iframe its panel starts folded. It sends `{ source: 'web-scumm-editor', room, type }` messages: `ready` (with
`missing`, the entities that have no place yet), `select` (`key` such as `prop:lamp`, `hs:door`, `actor:grandma`,
plus `kind` and `id` for those three), `dirty` (unsaved changes) and `saved` (`ok`, `error`). It accepts
`{ source: 'web-scumm-studio', type }` messages: `select` (`kind`, `id`), `create` (gives a place to an entity the room
declares but the layout lacks, optionally at `at`) and `save`. On the dev server the editor writes the layout through
the Studio's API (`PUT /__studio/api/room/<id>/layout`); in the demo it keeps it as a patch ([Demo mode](studio.demo-mode.md)).

<a name="stage-editor"></a>

### The stage editor: layers, masks, zones

Under the room sheet of the Rooms tab, the stage editor shows the backdrop with the occlusion masks (red), the walk
zones (green) and the links between zones.

<!-- step: stage -->
4. Set each layer's depth, parallax, opacity and blend in its fields. **Draw a mask** or **Draw a zone**, click its
   corners on the backdrop, then **Close the polygon** (a polygon that closes no surface is not kept). **Link them**
   joins two zones by a stairs, ladder, jump, teleport or walk link, placed by two clicks. **Save stage** writes this
   geometry (`layers`, `occluders`, `walkZones`, `walkLinks`) over the room's layout once the placement view is
   saved.

> [!LIMIT id=stage-save-blocked]
> **Save stage** stays off while a mask closes no surface or a zone has no link: the validator refuses both too
> ([`src/engine/tools/validate-stage.ts`](../../src/engine/tools/validate-stage.ts)).

<a name="layout-fields"></a>

### What the layout holds besides positions

Fields the engine reads: on a prop (and in each of its `states`) `rot` (degrees, clockwise, pivot at the feet), `flip`
(horizontal mirror), `flipV` (vertical mirror: the image sits below the feet line, as on the placement page), `z`
(forced layer); a field missing from a state falls back to the prop's own. On an actor, `z` forces their layer
(otherwise it follows their feet) and `flip` turns them to face left, unless the room sets their `facing`. On the
room, `floor` (default 395) is the bottom of the floor: a computed approach point never goes lower.

An actor with no `approach` point in the layout is reached from the side facing the middle of the room, 44 units away
whatever the characters' size. The whole layout format: [Geometry](create.geometry.md#layout-file).

<a name="actor-gap"></a>
<!-- applies: 4.2.4.. -->

### Tall characters: `actorGap`

Tall characters who gesture as they talk can end up with a hand in each other's head. Set `actorGap` on the game
(for example `0.8`): the distance becomes that share of the two characters' mean height (`height` of the hero and of
the character, or the actor's `h` in the layout), times the depth scale where the character stands. An `approach`
point in the layout still wins, for a character who needs the other side.

<a name="expected-result"></a>

## Expected result, and how to check it

After **Save the layout** the page reloads with the saved file and the thing stays where you left it.
`npm run validate` (or the Check tab) reports no geometry error, and the solver still reaches the end.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| An entity is missing from the view | It is declared in the room but has no place in the layout | **To place**, then drag it |
| **Save stage** is greyed out | A mask closes no surface, or a zone has no link | Close the polygon, or link the zone |
| Something visible cannot be reached | Its approach point is outside the walkable area | [Something is visible but unreachable](create.unreachable.md) |

<a name="files-changed"></a>

## Files or data changed

`games/<id>/layout/<room>.json` only (in a created project, `game/layout/<room>.json`).

<a name="recovery"></a>

## Recovery or going back

Before saving: **Reload (undo)**. After: the Studio's Undo (one step per save), or `git checkout -- games/<id>/layout/<room>.json`.

<a name="references"></a>

## References

- [Geometry: placement, walk zones, masks, layers, camera](create.geometry.md), [Dev URL parameters](reference.dev-url-parameters.md#edit).
- [`src/studio/rooms-stage.ts`](../../src/studio/rooms-stage.ts), [`src/studio/rooms-bridge.ts`](../../src/studio/rooms-bridge.ts).
