-- Auto-rated bill direction support.
--
-- Three changes:
--   1. Extend `bill_alignment` primary key with `bill_update_date` so cached
--      relevance scores invalidate when a bill is amended. This fixes a
--      pre-existing latent staleness bug where amendments to a bill silently
--      kept old relevance/confidence scores.
--   2. Add `bill_direction` to cache LLM-derived directional classifications
--      (`advances` / `obstructs` / `mixed` / `unclear`) per bill, per stance,
--      per snapshot. Keyed identically to bill_alignment so amendments and
--      stance edits both invalidate cached classifications.
--   3. Add the `auto_direction_mode` user preference. Default is `off`; the
--      classifier never runs unless the preference is set to one of the
--      active modes. The default flips to `co-equal` in a later migration
--      after the feature is generally available.
--
-- SQLite cannot alter primary keys in place, so step 1 rebuilds the table
-- via rename + copy (precedent: 0014_monitoring_mode.sql). Bills whose
-- `update_date` is null in `bills` get an empty string in the new column;
-- application code looks them up with the same empty string, preserving
-- their cached scores.

-- ------------------------------------------------------------------------
-- 1. Extend bill_alignment with bill_update_date in the primary key.
-- ------------------------------------------------------------------------

CREATE TABLE bill_alignment_new (
  bill_id              TEXT NOT NULL,
  bill_update_date     TEXT NOT NULL,
  stance_snapshot_hash TEXT NOT NULL,
  relevance            REAL NOT NULL CHECK (relevance BETWEEN 0 AND 1),
  confidence           REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  matched_json         TEXT NOT NULL,
  rationale            TEXT NOT NULL,
  computed_at          INTEGER NOT NULL,
  source_adapter_id    TEXT NOT NULL,
  source_tier          INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5),
  PRIMARY KEY (bill_id, bill_update_date, stance_snapshot_hash),
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
);

INSERT INTO bill_alignment_new (
  bill_id, bill_update_date, stance_snapshot_hash, relevance, confidence,
  matched_json, rationale, computed_at, source_adapter_id, source_tier
)
SELECT
  alignment.bill_id,
  COALESCE(bill.update_date, '') AS bill_update_date,
  alignment.stance_snapshot_hash,
  alignment.relevance,
  alignment.confidence,
  alignment.matched_json,
  alignment.rationale,
  alignment.computed_at,
  alignment.source_adapter_id,
  alignment.source_tier
FROM bill_alignment AS alignment
LEFT JOIN bills AS bill ON bill.id = alignment.bill_id;

DROP TABLE bill_alignment;
ALTER TABLE bill_alignment_new RENAME TO bill_alignment;

-- Recreate indexes that were attached to the original table (originally
-- declared in 0004_bill_alignment.sql and 0011_hot_path_indexes.sql).
CREATE INDEX IF NOT EXISTS bill_alignment_bill ON bill_alignment(bill_id);
CREATE INDEX IF NOT EXISTS bill_alignment_computed ON bill_alignment(computed_at);
CREATE INDEX IF NOT EXISTS bill_alignment_stance_snapshot
  ON bill_alignment(stance_snapshot_hash);

-- ------------------------------------------------------------------------
-- 2. New bill_direction table caches LLM directional classifications.
-- ------------------------------------------------------------------------

CREATE TABLE bill_direction (
  bill_id              TEXT NOT NULL,
  bill_update_date     TEXT NOT NULL,
  stance_snapshot_hash TEXT NOT NULL,
  stance_slug          TEXT NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN ('advances','obstructs','mixed','unclear')),
  confidence           REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  rationale            TEXT NOT NULL,
  evidence_json        TEXT NOT NULL,
  computed_at          INTEGER NOT NULL,
  model_id             TEXT NOT NULL,
  PRIMARY KEY (bill_id, bill_update_date, stance_snapshot_hash, stance_slug),
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS bill_direction_review_queue
  ON bill_direction(stance_snapshot_hash, kind, confidence);

CREATE INDEX IF NOT EXISTS bill_direction_bill
  ON bill_direction(bill_id);

-- ------------------------------------------------------------------------
-- 3. User preference for auto-direction mode.
-- ------------------------------------------------------------------------

ALTER TABLE preferences
  ADD COLUMN auto_direction_mode TEXT NOT NULL DEFAULT 'off'
  CHECK (auto_direction_mode IN ('off','supplement','co-equal','advisory'));
