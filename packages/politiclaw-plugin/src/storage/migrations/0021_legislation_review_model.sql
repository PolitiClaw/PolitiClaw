-- User-overridable model for legislation directional review.
--
-- Empty string means "use whatever model OpenClaw resolves as the host's
-- default" (the host runs the plugin and may be configured for any provider —
-- Anthropic, OpenAI, lmstudio, etc.). A non-empty value is passed through to
-- OpenClaw's `prepareSimpleCompletionModelForAgent` as `modelRef`, e.g.
-- "anthropic/claude-haiku-4-5" or "openai/gpt-4o-mini".
--
-- This preference is read only when `auto_direction_mode` is not 'off'.

ALTER TABLE preferences
  ADD COLUMN legislation_review_model TEXT NOT NULL DEFAULT '';
