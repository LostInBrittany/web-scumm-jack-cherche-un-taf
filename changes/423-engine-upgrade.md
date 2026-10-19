### Changes

- **A hosted game made on 4.1.x is upgraded to this engine's authoring schema from the Studio Server (4.2.3)**: an
  owner's `POST /api/engine/migrate` runs `web-scumm migrate` on the processing worker under their exclusive lease (the
  stable ids, then `schemaVersion: 3`, `saveVersion` + 1 and the ids' migration step in `game.ts`), judges the migrated
  game there (the validator, then the solver), and writes it as one undoable revision; a game it would break, or that
  the solver cannot judge in time, is refused (422) and nothing is written. A game already at schema 3 has nothing to
  do. STUDIO-SERVER (en, fr): "Upgrading the engine of a hosted game".
