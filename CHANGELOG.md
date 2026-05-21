# Changelog

All notable changes to the `@politiclaw/politiclaw` plugin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `CHANGELOG.md` and `SECURITY.md` at the repository root.
- `packages/politiclaw-plugin/CLAWSCAN_NOTE.md` — source-of-truth disclosure note for ClawHub publishes.

### Changed
- `peerDependencies.openclaw` raised from `>=2026.4.15` to `>=2026.4.21` to match the declared `openclaw.compat.pluginApi`.

## [0.0.15] — 2026-05-09

### Added
- Auto-rated bill direction: LLM-derived alignment ratings of bills against declared stances, with the AI involvement disclosed inline on every output.
- `politiclaw_review_auto_ratings` and `politiclaw_resolve_auto_rating` tools so users can audit and override LLM-derived ratings.
- `legislation_review_model` preference and host-LLM adapter for the rating pipeline.
- Per-stance scoping for `stance_signals` so promotion does not leak across issues.

### Changed
- Rep alignment scoring honors the new `auto_direction_mode` preference.
- Bill direction results cached by stance snapshot and amendment date.

## [0.0.14] — 2026-05-02

### Added
- `CONTRIBUTING.md` documenting the auto-generated docs workflow and contributor guardrails.

### Changed
- Widened Senate vote ingest lookback to reduce missed votes near the buffer edge.
- Dropped the dead issue-only stance-signal code path.

## [0.0.13] — 2026-05-01

### Fixed
- Suppressed contradictory no-signal hint in rep-score diagnostics.
- Clarified rep-scoring prerequisite messaging.

### Changed
- Trimmed rep-score coverage diagnostics for readability.
- Realigned prose docs with current plugin reality.

## [0.0.12] — 2026-04-30

### Added
- Skill overrides surfaced via `/politiclaw-doctor`, with prose docs for the override workflow.
- Resumable setup after gateway restarts.

### Changed
- Polished the onboarding quiz prompts.
- Closed a cron-reconcile gap during onboarding.

## [0.0.4 – 0.0.11]

Internal version bumps during the npm-release automation work and the LoC-aligned issue-taxonomy refactor. See the git history for granular changes; these versions were not tagged for public release.

## [0.0.3] — 2026-04-23

### Changed
- Iterations on the initial plugin scaffolding and tool registration.

## [0.0.2] — 2026-04-23

### Changed
- Patch on top of the initial publish.

## [0.0.1] — 2026-04-21

### Added
- Initial public release of `@politiclaw/politiclaw`: local-first OpenClaw plugin for federal legislation tracking, representative alignment scoring, ballot mapping, and stance-based outreach drafting.

[Unreleased]: https://github.com/PolitiClaw/PolitiClaw/compare/v0.0.15...HEAD
[0.0.15]: https://github.com/PolitiClaw/PolitiClaw/compare/v0.0.14...v0.0.15
[0.0.14]: https://github.com/PolitiClaw/PolitiClaw/compare/v0.0.13...v0.0.14
[0.0.13]: https://github.com/PolitiClaw/PolitiClaw/compare/v0.0.12...v0.0.13
[0.0.12]: https://github.com/PolitiClaw/PolitiClaw/compare/v0.0.3...v0.0.12
[0.0.3]: https://github.com/PolitiClaw/PolitiClaw/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/PolitiClaw/PolitiClaw/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/PolitiClaw/PolitiClaw/releases/tag/v0.0.1
