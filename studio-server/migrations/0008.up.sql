-- Personal undo (4.2.2 PR 4, plan §2.4, G5): each member's undoable operations, by revision, in their order. `state`:
-- done (undoable) or undone (redoable); a later edit of the same member drops their undone ones. Undo and redo are
-- operations of the journal themselves; history is never rewritten.
CREATE TABLE studio_undo (
  epoch TEXT NOT NULL,
  rev BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  what TEXT NOT NULL,
  state TEXT NOT NULL,
  at BIGINT NOT NULL,
  PRIMARY KEY (epoch, rev)
);
CREATE INDEX studio_undo_user ON studio_undo (epoch, user_id, state);
