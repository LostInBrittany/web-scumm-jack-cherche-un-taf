# Recovering after a lost lease, a disconnection or a stale preview

On a team Studio, something interrupted your work: a room you held went to someone else, the connection dropped, your
writes are waiting, you were sent to the login page, or the game you see is not the latest. This page tells these
cases apart and says how to get back to work. Nothing confirmed is lost in any of them.

<a name="symptom"></a>

## Symptom

- Your save in a room you were working on is refused with a 423 naming someone else, after a pause, a closed tab or a
  sleeping laptop ([lost lease](#lost-lease)).
- A banner: "Reconnecting… last revision seen: N. Nothing is lost: what changed meanwhile is read from the journal."
  ([disconnection](#disconnection)), or "Some changes made while the connection was cut could not be read back.",
  with **Reload the Studio**.
- A banner: "N changes not answered yet, sent again with the same id: each applies once." ([writes
  waiting](#writes-waiting)).
- The login page, the page "Identity provider unreachable", or "Access not granted" ([session](#session)).
- The label under the room view says "preview of revision N · revision M ready: reload to see it", "revision M
  building…", or "revision M does not build: …"; the Play tab shows an older game; a game frame shows nothing new
  ([stale preview](#stale-preview)).

<a name="causes"></a>

## Possible causes

1. **Your lease ran out.** A lease lasts 120 seconds and your Studio renews it every 30 seconds while it is open and
   connected. Closed, asleep or offline for more than two minutes, you lose it; anyone may then take the span.
2. **Someone took it from you.** An owner took the span over (written in the audit log), or a job took the whole game
   (the exclusive lease).
3. **The live stream dropped**: the network, a proxy, or a redeploy of the server.
4. **The server did not answer a write**: a redeploy (the new instance does not serve writes for a few seconds), a cut.
5. **Your session ended or was suspended**: its limits (8 hours idle and 24 hours in all by default, the configuration's
   `sessions.idleHours` and `sessions.absoluteHours`), an owner ended it, you were removed or your
   role changed, or the identity provider could not confirm it for 15 minutes.
6. **The preview is behind the head**: each change builds a new preview on the worker, which takes time, and a view
   that shows a game keeps it until you load the new one.

<a name="diagnosis"></a>

## Diagnosis

- **Spans…** (your name in the header) lists who holds what, and until when. `GET /api/leases` gives the same:
  `span`, `holderName`, `until` (the server's clock, in milliseconds).
- The header's revision dot is green while the live stream is up; the banner says when it is cut.
- The audit log (owners) shows a `lease-takeover`, `sessions-revoked`, `member-role` or `member-removed`.
- The preview label says which revision the game view shows, and what is building or failing.
- `/readyz` answers 503 while no instance serves writes (a redeploy).

<a name="fix"></a>

## Fix

<a name="lost-lease"></a>

### A lost lease

<!-- step: retake-span -->
1. Open **Spans…**. If the span is free, click **Take** (or just save: saving takes it). If someone holds it, click
   **Tell me when it is free** in the refusal dialog, or ask them: see [423](team.write-refused-423.md#fix). Your draft
   is kept in the dialog; **Copy the draft** if you need it elsewhere.
2. If it was taken over by an owner, the audit log says who. Agree with them before taking it back.
3. A script that sends `x-studio-fences` gets `your lease on <span> ended or was taken again: take it again` (423):
   take the span again (`POST /api/leases` with `{"spans": ["room:kitchen"]}`), keep the new fences, send the write
   again.

A job that holds the whole game renews its exclusive lease every 30 seconds while it runs and gives it back when it
ends. If the instance restarts during a job, the job's state is lost; its lease runs out within 120 seconds.

<a name="disconnection"></a>

### A disconnection

<!-- step: wait-reconnect -->
1. **Wait.** The browser opens the stream again by itself. When the server refused it (401, 503), the page first asks
   who your session is, then opens it again, waiting longer each time, 30 seconds at most.
2. On reconnection the Studio reads what it missed from the journal (`GET /api/ops?after=<last revision seen>`), in
   order, and the banner goes. If the journal cannot be read after five tries, the banner says some changes could not
   be read back: click **Reload the Studio**.
3. If the project's history changed meanwhile (a new import, a restore: another *epoch*), the page reloads by itself.

<a name="writes-waiting"></a>

### Writes waiting

<!-- step: let-retry -->
1. **Leave the tab open.** A write that got no answer, or a 502, 503 or 504, is sent again with the same operation id,
   up to eight more times, waiting 0.5 seconds and doubling up to 8 seconds. The server applies it once, whatever the
   number of tries. During a redeploy writes are refused for a short while; see [Redeploys](clever.redeploys.md).
2. If the banner stays and the writes end in an error, the server is down or unreachable: check `/readyz`, and see
   [Worker, PostgreSQL or Cellar down](clever.dependency-down.md).

<a name="session"></a>

### A session ended, suspended, or changed

<!-- step: log-in-again -->
1. **Sent to the login page**: log in again; you come back where you were. Your drafts in refusal dialogs are not kept
   across the login: copy them first if one is open.
2. **"Identity provider unreachable"**: the provider has not confirmed your session for 15 minutes, so the Studio
   pauses ("Nothing was sent during the pause."). Click **Try again now** once the provider is back.
3. **"Access not granted"**: you are logged in but no longer a member. Ask an owner for an invitation.
4. **The page restarts by itself**: your role changed; the Studio starts again with your new rights.

<a name="stale-preview"></a>

### A stale preview

<!-- step: load-latest -->
1. **The room view** loads the new preview by itself once it is built, unless you have a placement not saved. Save
   it (**Save layout**), or click **Reload view** (it drops the unsaved placement).
2. **The Play tab** keeps the preview it loaded, so a game in progress is never interrupted: click **Load the latest
   preview**.
3. **A game frame left idle** past its 15-minute game session shows nothing new: **Reload view**, or open the Play
   tab again.
4. **"revision M does not build: …"**: the last preview that built is still served. Hover the label for the whole
   reason, fix the game, and the next revision builds. A preview is built from the game's text files only: a game
   whose code imports a stylesheet or an image cannot be previewed.
5. **A save made in another content** asks before resuming: **Resume here** (it may play oddly if this revision
   removed what the save refers to), **Restart**, or **Stay in revision N** (the save's own revision); Escape cancels
   ([ADR 0026](../../docs/dev/adr/0026-saves-across-revisions.md)).
6. **The Check tab** marks its results stale once the head has moved on: run the check again.

> [!LIMIT id=no-offline-editing]
> A hosted Studio has no offline mode: while the server cannot be reached, nothing is saved, and only the writes
> already sent are retried. A draft in an open refusal dialog lives in that tab only.

<a name="check-fixed"></a>

## How to check it is fixed

The revision dot is green and no banner shows; your next save answers with a new revision; **Spans…** shows the span
as yours; the preview label says "preview of revision N" with N the head.

<a name="neighbours"></a>

## Neighbouring cases

- **423 while nobody's lease was yours before**: someone simply holds that span. See
  [Write refused: span locked (423)](team.write-refused-423.md).
- **409 "The file changed since you read it"**: not a lock, a stale read. See
  [Write refused: stale base revision (409)](team.write-refused-409.md).
- **503 for minutes, for everyone**: the instance or one of its services is down; see
  [Clever Cloud troubleshooting](clever.troubleshooting.md).
- **A preview that never builds, for everyone**: the worker may be down; see
  [Worker, PostgreSQL or Cellar down](clever.dependency-down.md).
