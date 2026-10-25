# World map

The travel map: regions, places that open rooms, the journey between them, and the "news" marker. Declared once in
`game.ts` (`map`). A game with only two or three rooms joined by doors does not need one.

<a name="map"></a>

## The map

```ts
map: {
  start: 'world',
  regions: { world: { name: 'World', image: 'decor/map' }, town: { name: 'Town', image: 'decor/map_town', parent: 'world' } },
  places: {
    market: { name: 'Market', room: 'market', region: 'town', pos: [61, 41], portrait: 'seller/r1c2', vehicle: 'car', news: '!market_done' },
  },
},
```

| Field | What |
|---|---|
| `start` | The region shown when the map opens. |
| `regions.<id>` | `name`, `image` (the map picture), `parent` (the region it opens from: France from World), `frame: [x, y, w, h]` (its area on the parent's image, in %, for the zoom button). |
| `places.<id>` | `name`, `room` (the room it opens), `region`, `pos: [x, y]` (in % of the region's image), `portrait`, `vehicle`, `news`, `joins`. |
| `music` | The map's music. |
| `vehicles` | `{ car, plane, pin, news }`: images that replace the skin's icons on the map. |

The validator wants the start region, each place's room and region, and each region's parent to exist.

<a name="unlocking"></a>

## Unlocking and travelling

A place shows only once unlocked: `{ unlock: 'market' }` in a rule, or `start.unlocked` in `game.ts` (a checkpoint has
its own `unlocked`). `{ unlocked: 'market' }` tests it. The player opens the map with its button (`skin.icons.map`), or
a rule does with `{ map: true }`; a tap on a pin travels to its place's room (its `onEnter` runs). `vehicle: 'car'` or
`'plane'` draws the vehicle along the route: a small animation and a sense of distance.

`news: COND` shows a "!" on the pin while the condition is true: where something new is waiting. In the demo, the
garden has news while `!tank_drained`, the house when you hold the key and the pantry is still closed.

<a name="pins"></a>
<!-- applies: 4.4.0.. since 4.4.0 -->

## One pin for several places

A place's `portrait` can be a list: several faces side by side on its pin, when several characters live there. A place
that says `joins: '<place>'` sits on that place's pin instead of having its own: once it is unlocked its face is added
there, a tap on a face travels to that face's place, and from any of them the pin is "here" (only the current face is
ringed). Moving between two places of one pin draws no journey. Its own `pos` is not used: write the pin's.

```ts
places: {
  harbour: { name: 'Harbour', room: 'quay', region: 'town', pos: [30, 70], portrait: ['captain/r1c2', 'cook/r1c2'] },
  // Another room of the same town: its face joins the harbour's pin and leads straight there.
  lighthouse: { name: 'Harbour: the lighthouse', room: 'lighthouse', region: 'town', pos: [30, 70], portrait: 'keeper/r1c2', joins: 'harbour' },
},
```

The validator wants the pin's place to exist, in the same region, and not to join another itself (and refuses a place
that joins itself). A pin with one place renders as before.

<a name="design"></a>

## Designing the map

- **Add one from three places.** With two, a door is enough ([exits](create.exits.md)).
- **Vehicles** give each trip a small animation and a sense of distance.
- **The news marker** shows where something new is waiting.
- **No locked places shown.** A place appears when a rule unlocks it, with a `toast` ("New on the map: the garden").
  Players should never see a pin they cannot use.

More on how the map serves the story: [puzzle design](create.puzzle-design.md#map).

<a name="related"></a>

## Related identifiers

- `MapDef`, `MapRegion`, `PlaceDef` in [`src/engine/core/types/game.ts`](../../src/engine/core/types/game.ts); the
  validator's rules in [`src/engine/tools/validate/map.ts`](../../src/engine/tools/validate/map.ts).
- `unlock`, `map` ([commands](create.commands.md#world)), `{ unlocked }` ([conditions](create.conditions.md)), the map
  texts `ui.mapTitle`, `ui.mapBack`, `ui.world`, `ui.zoomIn`, `ui.arrival`. The Studio's map view:
  [Studio map](studio.map.md).
