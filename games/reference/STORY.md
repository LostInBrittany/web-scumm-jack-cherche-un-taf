# The Night Market — design of the reference chapter

The engine's second real game (3.4, D13): a 30-to-45-minute chapter built only from the sample game's art and sound,
reframed, that exercises what 3.4 added — Canvas painter, layers with parallax, masks, walk zones and links, a staged
finale — and what a second game must prove: two playable characters who need each other. It is a test bench as much
as a story: CI builds it, proves it chapter by chapter, and plays it to the end at the keyboard in Chromium and WebKit,
and in French.

Cast: **Pixel** (`hero`, playable), **Biscuit** (`biscuit`, playable, asleep in the garden at the start), **Grandma**
(`grandma`, in her kitchen), **Lou** (`neighbor`, the festival organiser, in his office), **the seller** (`seller`,
walking up and down in the dark until the lights come back: the autonomous script `seller_rounds`).

Premise: festival night, and every light in the market is out. Lou needs three things: the lights (a new cable in the
fuse box), the festival board on the stage, and a lit lamp on the big lamp post.

## The puzzle chain
1. Grandma's armchair hides a **token** (kitchen).
2. The token buys **lamp oil** at the seller's honesty box (alley). The seller himself refuses tokens: he points to the box.
3. The radio makes Grandma dance; then the cupboard gives the **matches** (kitchen).
4. The old **lamp** sits on top of the garden wall. Pixel cannot reach it: Biscuit climbs the cherry tree (a `jump` link
   open to Biscuit only), pushes the **ladder** down (`ladder_down`), and the ladder link opens for both.
5. Oil in the lamp, then a match: the **lit lamp** (game rules; matches on an empty lamp are refused).
6. Only Biscuit fits under the alley fence (`fence_gap`, `{ player: 'biscuit' }`): the **cellar key** lies in the mud.
7. Keys are Pixel's department: the key opens the **cellar** door for Pixel only (Biscuit has a refusal line).
8. The cellar is dark: with the lit lamp, the crate shows and gives the **spare cable**.
9. The cable in the fuse box: the **cables** minigame, then `lights_on`, the `lights` event (the seller runs back to his
   stall, a toast), the night lights turn to glow.
10. Lou gives the **board** once the lights are back; it goes up on the stage behind the tiled booth (`board_hung`).
11. The lit lamp on the lamp post, lights on and board hung: the staged finale (parallel lines, a spring, a launch, the
    seller and Lou moving), then the end.

Items travel between the two characters (`give`); the chapter's boundary is the lights coming back on (checkpoint
`lights`, `npm run solve -- --chapters`).

## The staged scene: the market
`market` is the demanding scene of the 3.4 exit criteria: Canvas, 960 wide, six layers (three stalls, a bush and a
chair in the foreground with parallax), three occluders (a polygon with feather, a layer's alpha, the arch), lights and
two particle emitters, two walk zones (the square and the stage, zoom 1.35) joined by `steps` (stairs).
`yard` has two planes too: the ground and the top of the wall, joined by the ladder and the tree.

## Rooms
street (hub, fuse box), market (staged), alley (seller, honesty box, fence gap), backlot (the key, fog), yard (two
planes), kitchen (Grandma), cellar (dark until the lamp), hall (Lou).
