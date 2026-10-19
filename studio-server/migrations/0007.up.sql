-- The game's health by revision (4.2.2 PR 3, plan §2.3): the validator's verdict on each revision judged (the head
-- after a burst of writes, and the revisions a bisection looked at), and, for a failing one, the revision that broke
-- what the last passing one passed (`culprit`), when it is known.
CREATE TABLE studio_health (
  epoch TEXT NOT NULL,
  rev BIGINT NOT NULL,
  ok INTEGER NOT NULL,
  errors TEXT NOT NULL,
  warnings BIGINT NOT NULL,
  culprit BIGINT,
  ms BIGINT NOT NULL,
  made_at BIGINT NOT NULL,
  PRIMARY KEY (epoch, rev)
);
