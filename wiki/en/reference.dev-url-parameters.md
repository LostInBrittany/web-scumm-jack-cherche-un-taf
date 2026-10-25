# Dev URL parameters

The query parameters a game's page reads. Add them to the page's URL in the browser: on the dev server
(`npm run dev` from the root of the engine repository, or from a created project's folder), the address is
`http://localhost:5173/` unless Vite says otherwise. Some are development tools, read only by a development page;
the others work in every build, the production one included.

<a name="where"></a>

## Which builds read them

- `?dev`, `?edit=<room>` and `&at=<checkpoint>` turn on the dev tools only on the dev server, in a Studio demo build
  ([studio.demo-mode](studio.demo-mode.md)) and in a hosted Studio's previews of a revision
  ([`src/main.ts`](../../src/main.ts)). Without them the player's game is the same in every build; a production build
  ignores them.
- Every other parameter below is read by the engine in every build.

> [!LIMIT id=dev-tools-build]
> The dev tools are not in a production build: `?dev` and `?edit=` on a published game show the normal game.

| URL | Effect | Build |
|---|---|---|
| `/` | The normal game: title screen, New Game / Continue. | every |
| `/?dev` | Starts on the first checkpoint, with the debug layer and the DEV panel. | development |
| `/?dev&at=<checkpoint>` | Starts on this checkpoint (one of the game's `checkpoints`). | development |
| `/?edit=<room>` | The room's placement editor. | development |
| `/?edit=<room>&at=<checkpoint>` | The same, in that checkpoint's state (to place a prop in a given state). | development |
| `?lang=<code>` | The language to play in. | every |
| `?renderer=canvas\|dom` | Forces a painter for every room. | every |
| `?music=mix\|stems` | Forces the single mix or the stems. | every |
| `?fps` | A frame counter in a corner. | every |
| `?seed=`, `?daily=`, `?world=` | Opens a Remix world. | every |
| `?reality=sim` | A simulated world link. | every |
| `?speedrunTool=<port>` | Posts the run's events to a local speedrun tool. | every |
| `?token=<token>` | The LAN Studio's token. | dev server in LAN mode |

<a name="dev"></a>

## `?dev`: the layer and the DEV panel

`/?dev` starts the game on its first checkpoint with the engine's trace on, the debug layer and the DEV panel
([`src/engine/dev/`](../../src/engine/dev/index.ts)).

- **Layer**, drawn over the scene:
  - clickable zones in blue, props in purple, characters in green;
  - the walkable zone in green, holes (furniture) in red;
  - depth-scale lines in orange, entry points in pink;
  - approach points: filled if set in the layout, hollow if computed.
- **Show or hide the layer**: the **D** key, or the **DEV** button in the bottom left (on a phone).
- **Panel**:
  - the current room and the "busy" state (a script is running);
  - **Checkpoints**: load a ready state, or start a New Game;
  - **Rooms**: go to any room, without playing its arrival script;
  - **Bag**: check or uncheck an item;
  - **Flags**: edit existing flags, or set a flag name and value (`true`, `false`, a number or text);
  - **Map**: unlock a place, or **Unlock all**;
  - **World**: the room of each moving character (change it to `moveActor` them);
  - **Scripts**: the position of each script in scope (`next command / length`, done, stopped), with a stop or
    restart button;
  - **Journal**: the last ten entries of the engine's journal (what answered, events, script steps, moves, switches;
    the Studio's Play tab shows it whole), and **Export session**: the inputs since the game started, with the
    session's semantic journal, for `npm run replay`;
  - **Semantic journal** (4.1.11): the last twelve events the core numbered in this session (room entered, item
    acquired or lost, flag changed, ending, load, save), refreshed with the panel;
  - **Edit this room**: opens the editor on the room shown.

<a name="at"></a>

## `&at=<checkpoint>`

With `?dev` or `?edit=`, starts on that checkpoint, an id of the game's `checkpoints`, instead of the first one.

<a name="edit"></a>

## `?edit=<room>`: the placement editor

`/?edit=<room>` opens the room's placement editor. On start it loads the first checkpoint located in that room; if
there is none, it starts from a fresh state, without playing an arrival script. All coordinates are logical
(640 × 400). The gestures and the editor's panel are described in [studio.placement](studio.placement.md#placement-editor).

- **Saving** writes `games/<GAME>/layout/<room>.json` in the engine repository (`game/layout/<room>.json` in a created
  project), coordinates rounded to the unit, through the Studio's API (`PUT /__studio/api/room/<room>/layout`, one
  guarded operation of the game's journal: [studio.api](studio.api.md)); the page then reloads with the saved file.
  Where there is no Studio API (a Studio demo build, a static host), the layout joins the demo's edits in this
  browser. A refusal of the Studio is shown with its reason.
- **In the Studio** (`/__studio/`), the editor runs in an iframe and talks to the Studio's page with `postMessage`,
  to the Studio's origin only (the page's own origin, or on a hosted Studio the origin its
  `web-scumm-studio-origin` meta tag names). It sends `{ source: 'web-scumm-editor', room, type }` messages:
  `ready` (with `missing`, the entities that have no place yet), `select` (`key` such as `prop:lamp`, `hs:door`,
  `actor:grandma`, plus `kind` and `id` for those three), `dirty` (unsaved changes) and `saved` (`ok`, `error`; on a
  hosted Studio also the `layout` and the request's `nonce`, the Studio writing it). It accepts
  `{ source: 'web-scumm-studio', type }` messages: `select` (`kind`, `id`), `create` (gives a place to an entity the
  room declares but the layout lacks, optionally at `at`) and `save` (optionally with a `nonce`). In an iframe its
  panel starts folded.

<a name="lang"></a>

## `?lang=<code>`

The language to play in, when the game ships it: it comes before the player's saved choice and the browser's language
(`pickLanguage`, [engine.api](engine.api.md)). See [play.languages](play.languages.md).

<a name="renderer"></a>

## `?renderer=canvas|dom`

Forces one painter for every room: the visual parity check, the Studio's comparison. Any other value is ignored and
each room keeps its own `renderer`.

<a name="music"></a>

## `?music=mix|stems`

Forces the single mix or the director's stems (tests, the Studio); otherwise the device decides
([create.music](create.music.md)).

<a name="fps"></a>

## `?fps`

A frame counter in a corner (3.8): the frame rate now and the lowest second seen, for the real-phone pass.

<a name="remix-links"></a>

## `?seed=`, `?daily=`, `?world=`: a Remix world

For a game that declares `remix` (4.1.15): `?world=<frozen world>` (its hash checked when it is applied),
`?seed=WS-…` (the remix mode) or `?daily=<signed day token>` names the world the page plays. The autosave's world comes
first (Continue never disappears); a link to another world than the saved game's is asked on the title screen, never
adopted silently. See [create.remix](create.remix.md).

<a name="reality"></a>

## `?reality=sim`

For a game that declares `reality`: the world link is simulated, as it always is with the dev tools on, and no
Bridge is contacted ([bridge.signals-manifest](bridge.signals-manifest.md)).

<a name="speedrun-tool"></a>

## `?speedrunTool=<port>`

The page posts its run's events (category, split ids and names, times; nothing else: no save, no player id, no token)
to a local tool on that port of this machine: the OBS overlay or the LiveSplit autosplitter (4.1.14, D23). The port
is 2 to 5 digits; the tool accepts them only from its allowed origin. See [play.speedrun](play.speedrun.md).

<a name="token"></a>

## `?token=<token>`

On the dev server in LAN mode (`npm run dev:lan`, `npm run studio:lan`), the one-session capability token the server
prints in its URL. Given once, it is kept in an `HttpOnly`, `SameSite=Strict` cookie; a request without it (and
without the `x-web-scumm-token` header) is refused with 401. See [studio.security](studio.security.md) and
[create.lan-testing](create.lan-testing.md).
