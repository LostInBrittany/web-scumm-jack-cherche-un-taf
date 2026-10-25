# The stage: lights, particles, floors

A room can show more than its backdrop: layers in front of and behind the characters, things that hide a character
standing behind them, pools of light, rain or dust, several floors joined by stairs, and a transition when the room
is entered. This page is the reference of a room's `stage` and of the layout fields that place it.

<a name="stage"></a>

## The stage of a room

Three parts share the work:

- **the content says what exists and when**: `stage` in the room file;
- **the layout says where**: `layers`, `occluders`, `walkZones`, `walkLinks`, `lights` and `emitters` in the room's
  layout, written by the Studio's editors;
- **the painter draws it**.

Nothing on the stage is game state. A layer, a light or a particle never changes what the solver sees, and a gated
walk link is a way to walk, never a puzzle by itself: the puzzle is a rule. `tests/stage.test.ts` proves the sample
game with a stage on every room and finds the same states.

```ts
stage: {
  layers: [
    { id: 'sky', image: 'pier/sky', role: 'backdrop' },               // behind everything (else `decor` is the backdrop)
    { id: 'counter', image: 'pier/counter', role: 'scenery' },        // among the characters, by its layout `z`
    { id: 'lantern', image: 'pier/lantern', role: 'foreground', visible: 'lantern_lit' },  // in front of everyone
    { id: 'fog', image: 'pier/fog', role: 'effect' },                 // above all
  ],
  lights: [{ id: 'lamp', kind: 'radial', color: '#ffd28a', intensity: 0.7, visible: 'lantern_lit' }],
  emitters: [{ id: 'spray', kind: 'rain', rate: 40 }],
  transition: 'fade',                                                  // cut (default), fade, wipe
  links: { stairs: { if: 'gate_open', locked: 'The gate is shut.' } }, // the logic of a walk link
},
```

An old room is a stage of one backdrop (`decor`) and one walk zone (`walk`, named `main`): nothing to rewrite.

> [!GUARANTEE id=stage-not-state]
> Layers, lights and a transition on every room of the sample game change nothing the solver reports: the same
> verdict, the same number of states, the same number of softlocks.

<a name="stage-content"></a>

## In the room: `stage`

The types are in [src/engine/core/types/stage.ts](../../src/engine/core/types/stage.ts).

### `layers`

| Field | Meaning |
|---|---|
| `id` | Stable id: its geometry is `layout.layers[id]`, and a mask can be its alpha (`occluders[].layer`). |
| `image` | A manifest image id. |
| `role` | `backdrop` behind everything; `scenery` among the characters, at the depth of its layout `z`; `foreground` in front of them; `effect` above all (fog, a vignette). |
| `visible` | Shown only while this condition holds (a window lit at night, a curtain drawn). |

### `lights`

| Field | Meaning |
|---|---|
| `id` | Its position is `layout.lights[id]`. |
| `kind` | `radial`: a pool of light at its layout position; `ambient`: a colour over the whole room. |
| `color` | A CSS colour. |
| `intensity` | 0 to 1, default 0.6. |
| `blend` | `screen` brightens (a lamp), `multiply` darkens (night, a shadow). Default `screen` for radial, `multiply` for ambient. |
| `visible` | A condition. |

### `emitters`

| Field | Meaning |
|---|---|
| `id` | Its area is `layout.emitters[id]`. |
| `kind` | `dust`, `rain`, `snow`, `sparks`, `smoke` or `leaves`. |
| `image` | A particle image (manifest id); default a small dot of `color`. |
| `color` | The dot's colour. |
| `rate` | Particles per second (default by kind). |
| `visible` | A condition. |

Particles are seeded: the same room draws the same particles.

### `transition`

How the room appears when entered: `cut` (default), `fade` or `wipe`, or `{ kind, ms }` to set the duration. Reduced
motion makes every transition a cut.

### `links`

The logic of the layout's walk links, by link id: `if` (the link can be walked only while it holds) and `locked` (what
the hero says when trying it while it is closed). See [Walk links](#walk-links) below.

<a name="stage-layout"></a>

## In the layout: where it stands

The Studio's editors write these in the room's layout file; you do not type them by hand (see
[Placement and stage](studio.placement.md)).

| Layout field | Shape | What it places |
|---|---|---|
| `layers.<id>` | `{ x, y, z, parallax: [x, y], blend, opacity }` | A layer's top-left corner, its depth line, its parallax per axis (1 moves with the room, 0.5 half as fast, behind; 1.2 faster, in front), its blend (`normal`, `multiply`, `screen`, `overlay`) and opacity. |
| `occluders.<id>` | `{ polygon \| mask \| layer, z, feather?, invert? }` | What hides a character standing deeper than `z`: a pillar, a counter, a window frame. A polygon, a black-and-white mask image, or a stage layer's alpha. |
| `walkZones.<id>` | `{ area, holes?, scale?, zoom? }` | Several floors; they replace `walk`. Each zone scales the characters by its own depth line (`scale`) and can zoom the camera (`zoom`, 1 to 2: a balcony seen closer). |
| `walkLinks.<id>` | `{ from: { zone, at }, to: { zone, at }, mode, ms?, facing?, oneWay? }` | How to go from one zone to another; `mode` is `walk`, `stairs`, `ladder`, `jump` or `teleport`. |
| `lights.<id>` | `{ at, radius }` | A radial light's position and radius. |
| `emitters.<id>` | `{ area }` | Where particles appear. |

A zoomed camera also moves up and down to keep the hero in view. The geometry itself (walk areas, holes, depth scale,
the camera) is explained on [Geometry](create.geometry.md#layers-and-masks).

<a name="walk-links"></a>

## Walk links and their puzzle

A link that is closed (its `if` in `stage.links` does not hold) cannot be walked: the hero walks to its foot, says its
`locked` line, and **the action goes on from there**. So the rules about what stands behind the link must check the same
condition: the puzzle is the rule, the link only stops the walk. The lint warns when a rule behind a link does not
check its condition (`walk-link-gate`):

```sh
# in the created project
npx quest-n-click lint

# in the engine repository
GAME=<id> npm run lint
```

The walker takes the fewest links between two points.

<a name="renderer"></a>

## Which painter draws what

`renderer: 'canvas'` (on the room, or on the game for every room) chooses the Canvas painter. Masks from images or
layers, lights, particles and blend modes are drawn **only** by it; occluders from a polygon are drawn by both
painters. The validator says so on a room painted by the DOM painter (the default). `?renderer=canvas` or
`?renderer=dom` in the game's URL forces one painter for every room, to compare them.

> [!LIMIT id=stage-dom-painter]
> On the DOM painter (the default), mask occluders, lights, particles and blend modes are not drawn. Set
> `renderer: 'canvas'` on the rooms that need them.

Reduced motion (the setting, or the system's `prefers-reduced-motion`) turns off parallax, particles and transitions.

<a name="since"></a>

## Since

Layers, masks, lights, particles, transitions, several walk zones and links, the per-zone zoom, the Canvas painter and
`walk-link-gate`: 3.4.0. Before 3.4, a room had one backdrop and one walk area, which is still how an old room reads.

<a name="related"></a>

## Related identifiers

- `layout.width`, the `camera` command: [Staging](create.staging.md#wide-rooms).
- `walk`, `scale`, `entries`, `hotspots`: [Geometry](create.geometry.md).
- Placing layers, lights and zones in the Studio: [Placement and stage](studio.placement.md).
- "I can see it but cannot reach it": [Visible but unreachable](create.unreachable.md).
