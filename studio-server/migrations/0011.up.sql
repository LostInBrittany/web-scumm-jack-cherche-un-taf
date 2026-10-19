-- The client an operation came from (4.2.3 PR 1, H10): a browser tab, a CLI or MCP session, each its own id. A write
-- read at an older revision is never refused for this same client's own operations since; another client's are
-- counted, the same member's included (another tab, an agent through the MCP).
ALTER TABLE studio_ops ADD COLUMN client TEXT NOT NULL DEFAULT '';
