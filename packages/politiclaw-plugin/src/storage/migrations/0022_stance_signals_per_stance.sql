-- Per-stance scoping for bill-level user signals.
--
-- The classifier rates each bill *per declared stance* (advances housing /
-- obstructs taxation), but `stance_signals` rows historically carry only
-- a `bill_id`, so promoting one stance's AI call wrote a single bill-level
-- signal that rep scoring then applied to every other matched stance on
-- the same bill. This column lets a signal scope itself to a specific
-- stance slug:
--
--   stance_slug = 'housing'  → applies only to the housing stance
--   stance_slug IS NULL      → applies bill-wide (existing behaviour;
--                              still the right shape for skip and for
--                              user-driven dashboard signals that aren't
--                              tied to a particular declared stance)
--
-- Resolution at scoring time prefers the per-stance signal when one
-- exists for the (bill, stance) pair, then falls back to the bill-level
-- signal, then to the classifier under the user's auto_direction_mode.
--
-- All existing rows have stance_slug = NULL, so behaviour is unchanged
-- for any signal recorded before this migration.

ALTER TABLE stance_signals ADD COLUMN stance_slug TEXT;

CREATE INDEX IF NOT EXISTS stance_signals_bill_stance_dir_created
  ON stance_signals(bill_id, stance_slug, direction, created_at DESC);
