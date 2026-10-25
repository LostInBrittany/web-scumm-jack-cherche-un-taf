# Starting as an invited dev

You received an invitation link to a team Studio. In about fifteen minutes you will log in, find your way around,
make a first change in your name, see it in the game, and know how to stay out of your teammates' way.

<a name="what-you-will-build"></a>

## What you will build

Nothing new in the game yet: a first small edit (a note, or a line of text in a room), saved as a revision in your
name, seen in the game's preview. At the end the Studio's header shows "revision N" with your change, and your avatar
among the people here.

<a name="what-you-need"></a>

## What you need

- The invitation link an owner sent you. It works once, within 7 days.
- An account at your team's identity provider (Keycloak, GitLab or another) whose **email is verified** and is the
  one the invitation names.
- A recent desktop browser: Chromium, Firefox, or Safari on macOS. The hosted Studio is experimental; Safari is the
  `studio-hosted` human pass, not yet made.
- Nothing to install on your machine.

<a name="steps"></a>

## Steps

<!-- step: open-link -->
1. **Open the invitation link.** You are sent to the provider's login page. Log in with the invited email. You come
   back to the Studio. *You see* the Studio with its tabs: Rooms, Storyboard, Map, Assets, Voices, Music, Check, Play,
   Language, Remix, Notes.

   If you see "Access not granted" instead, the invitation did not match: it expired, was already used, or your
   verified email differs. Ask the owner for a new one ([Invitations](team.invitations.md#common-errors)).

<!-- step: read-header -->
2. **Read the header.** Left to right: "revision N" (the project's current revision; its dot is green while the live
   stream is up), the game's health at a revision, one avatar per person here (hover for where they are), and your
   name with your role ("Léa · dev ▾"). Your name opens a menu: **Spans…**, **Log out** (and **Members…** for an
   owner). *You see* your own avatar among the others.

<!-- step: open-spans -->
3. **See who holds what.** Click your name, then **Spans…**. Every room, and every other part of the game (items,
   cast, rules, story, a language, voices, assets, notes, the map, playtests, signals, the rest), is listed with its
   holder or "free". *You see* which rooms your teammates are working in. Close the panel.

<!-- step: first-edit -->
4. **Make a first change.** Open the **Notes** tab and add a note ("Hello, I am on the kitchen today"), or open a free
   room in **Rooms** and change a line of text, then save. *You see* the header move to the next revision. In the
   Rooms tab, the room's chip now says "held by you": saving took its span for you for two minutes, renewed while your
   Studio is open.

<!-- step: see-preview -->
5. **See it in the game.** The room view shows the game as a preview of one revision. Its label says "preview of
   revision N", then "revision N+1 building…": the server's worker builds your revision. A few moments later the view
   loads it by itself. In the **Play** tab, click **Load the latest preview** to play it. *You see* your change.

<!-- step: check -->
6. **Check the game.** In **Check**, run the validator and the solver. *You see* the results, with the revision they
   were made at; they are marked stale once someone writes again.

<!-- step: comment -->
7. **Say something without writing the game.** In **Notes**, the **Comments** panel takes a comment on a room, an
   item, a rule or the game itself, at the current revision. Your teammates see it at once. See
   [Comments](team.comments.md).

<!-- step: log-out -->
8. **Log out** from the menu under your name when you are done for the day, or just close the tab: your spans are
   released two minutes later.

> [!LIMIT id=tutorial-not-covered]
> This tutorial leaves out what a dev does not do on day one: the Assets tab (uploads and cutting), Prepare, publishing
> builds, Git and the engine's upgrade. A hosted Studio has no captures, no Assistant yet, and the state inspector, the
> rule explainer and the replays beside the Play tab need the local Studio (see [Known limits](team.limits.md)).

<a name="what-you-learned"></a>

## What you learned

- Every save is one revision in your name ([Concepts](team.concepts.md#revision)).
- Saving a file holds its span for you, and someone else's span refuses your save
  ([Concepts](team.concepts.md#lease), [423](team.write-refused-423.md)).
- The game you see is the preview of one revision ([Concepts](team.concepts.md#preview)).
- Your role decides what you may do ([Roles and actions](team.roles.md)).

<a name="next"></a>

## Where to go next

- [Working together day to day](team.day-to-day.md): the routine, undo, conflicts.
- [Recovering after a lost lease, a disconnection or a stale preview](team.recovery.md).
- [Remote MCP](team.remote-mcp.md): an AI agent working in your name.
