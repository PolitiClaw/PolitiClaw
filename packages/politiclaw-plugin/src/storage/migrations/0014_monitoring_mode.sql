-- Rename monitoring_cadence -> monitoring_mode with product-shaped values.
--
-- The prior `monitoring_cadence` enum leaked implementation-shaped names
-- (`election_proximity`, `both`) to users. The replacement `monitoring_mode`
-- enum exposes product-shaped modes the user picks by intent; a pure function
-- in code maps each mode to the subset of default cron templates to install.
--
-- SQLite cannot alter CHECK constraints in place, so we rebuild the table.
-- Legacy value mapping:
--   off                -> off
--   election_proximity -> action_only
--   weekly             -> weekly_digest
--   both               -> full_copilot
-- quiet_watch is a new posture with no legacy source.

CREATE TABLE preferences_new (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  address            TEXT NOT NULL,
  zip                TEXT,
  state              TEXT,
  district           TEXT,
  monitoring_mode    TEXT NOT NULL DEFAULT 'action_only'
    CHECK (monitoring_mode IN ('off','quiet_watch','weekly_digest','action_only','full_copilot')),
  updated_at         INTEGER NOT NULL
);

INSERT INTO preferences_new (id, address, zip, state, district, monitoring_mode, updated_at)
SELECT
  id,
  address,
  zip,
  state,
  district,
  CASE monitoring_cadence
    WHEN 'off'                THEN 'off'
    WHEN 'election_proximity' THEN 'action_only'
    WHEN 'weekly'             THEN 'weekly_digest'
    WHEN 'both'               THEN 'full_copilot'
    ELSE 'action_only'
  END,
  updated_at
FROM preferences;

DROP TABLE preferences;
ALTER TABLE preferences_new RENAME TO preferences;
