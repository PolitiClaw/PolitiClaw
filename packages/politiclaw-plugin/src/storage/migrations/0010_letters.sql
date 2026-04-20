-- Letter drafts to a specific rep on a specific issue.
--
-- Drafts only — there is no `sent_at` column, no send path, and no automated
-- outbound mail. LLM-generated bulk mail gets filtered by congressional CRMs;
-- the user's own hand-edit before sending is the value. The tool produces
-- copy-paste-ready text; the user edits and sends from their own client.
--
-- `stance_snapshot_hash` captures the declared issue stances at draft time so
-- a later audit pass can re-read the exact inputs that shaped a letter even
-- after the user has edited their stance list.

CREATE TABLE IF NOT EXISTS letters (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  rep_id                TEXT NOT NULL,
  rep_name              TEXT NOT NULL,
  rep_office            TEXT NOT NULL,
  issue                 TEXT NOT NULL,
  bill_id               TEXT,
  subject               TEXT NOT NULL,
  body                  TEXT NOT NULL,
  citations_json        TEXT NOT NULL,
  stance_snapshot_hash  TEXT NOT NULL,
  word_count            INTEGER NOT NULL,
  created_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS letters_rep     ON letters(rep_id);
CREATE INDEX IF NOT EXISTS letters_issue   ON letters(issue);
CREATE INDEX IF NOT EXISTS letters_created ON letters(created_at DESC);
