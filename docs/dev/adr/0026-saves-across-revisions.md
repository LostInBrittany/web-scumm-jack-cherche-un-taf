# 0026 · Saves across revisions: the envelope unchanged, a question before resuming (4.2.2)

**Context.** A hosted Studio serves the game as the preview of a revision (`/preview/<rev>/`, 4.2.2 PR 2a), and every
revision's preview is on the same game origin, so they share the browser's saves. A save made in revision 3 can be
resumed in revision 9, where a room, an item or a flag it refers to may be gone. The plan
(`docs/dev/PLAN-4.2.2-ATELIER-JOUABLE.md` §2.2, guarantee G2) asks for a choice before such a resume; D40 forbids a
change of the save format in 4.2.x.

**Decision.**

1. **The envelope does not change** (`SaveEnvelopeV4`, `src/engine/core/save.ts`). What a save says of where it was
   made is written beside it:
   - a manual slot: `SlotMeta.revision` (`{ rev, fingerprint }`), optional, read back only when well formed;
   - the autosave: one record per game in the page's storage (`<game>.save-revision`), written once each autosave is
     written (after the store's verification when it has one: a refused write records nothing) and removed when the
     autosave is erased.
2. **Only a build that declares its revision does this** (`BootOptions.revision`; a preview takes it from its base).
   The player's builds write nothing more and never ask.
3. **The test is the content, not the number.** The record holds the full fingerprint (ADR 0013: logic, trusted
   extensions, presentation, engine). A save made in the same content resumes without a question, whatever the
   revision number (a revision that changed only the notes, or only placements, which the fingerprint does not cover,
   asks nothing); one made in other content, or under another engine, asks.
4. **The question has three answers** (on Continue, above the title screen; on loading a slot, above the menu), and
   Escape cancels it (nothing loaded, nothing replaced):
   - **Resume here**: loaded as it is. It may fail, or play oddly, if this revision removed what the state refers to:
     the question says so, nothing repairs it;
   - **Restart**: a new game, confirmed as New game is, since it replaces the game in progress;
   - **Stay in revision N**: the save's own revision, by its URL (`/preview/N/`), offered when the number differs. It
     opens on its title screen, without the dev tools (which would start a new game there): Continue resumes the
     autosave; a slot is loaded from its menu again.
5. **Its texts are the Studio's**, in English, outside the game's `ui`: only the game's authors see a preview, and a
   game needs no new key (D40).

**Tests.** `tests/revision.test.ts` (no question for the same content or a save that says nothing; each answer
followed; the autosave's record follows its verified saves and its erasure, and a refused storage changes nothing; a
record is read only when well formed); `scripts/e2e-studio-hosted.ts` (in a real preview: the revision recorded; a
slot saved in other content asks, through the pause menu, with its three answers, and each is followed: Resume loads
it, Stay opens revision 1 on its title screen, Restart confirmed starts a new game; on that title screen, Continue
asks above the title, and Escape cancels).

**Costs.**
- The autosave's record lives apart from the save: storage cleared by hand, or refused, loses it, and that save then
  resumes without a question, as before 4.2.2. A store that drops a write without failing (an autosave of another
  world kept, 4.1.15) still gets the record of this revision.
- A save in a page without WebCrypto (an insecure origin) records nothing: the fingerprint cannot be computed, and the
  game runs as before 4.2.2.
- A revision whose preview is no longer kept (collection, 4.2.2 PR 7; another epoch) cannot be stayed in: its URL
  answers that there is no such preview.
- The Studio's Play tab starts a new game (`?dev`) and does not offer Continue; the question there comes from a slot.

**What would change it.**
- A save format change (a 4.3): the revision and the fingerprint could then go into the envelope itself.
- A migration of states between revisions (renamed rooms and items followed): Resume could then repair instead of
  warn.
