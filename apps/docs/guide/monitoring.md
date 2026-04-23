# Manage Monitoring

This page is the controls reference — cadence values, the one-off snapshot tool, and the mute commands. For the narrative version of what proactive monitoring feels like, read [Set It and Forget It](./set-it-and-forget-it).

## Core Idea

PolitiClaw monitoring is built around a small set of plugin-owned cron templates plus a saved user monitoring mode. You pick a mode by intent; the plugin maps it to the right subset of default jobs. The exact job names, schedules, and payloads live in the generated reference:

- [Generated Cron Jobs](../reference/generated/cron-jobs)

## User-Facing Controls

Default front door:

- [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure)

Follow-up:

- [`politiclaw_check_upcoming_votes`](../reference/generated/tools/politiclaw_check_upcoming_votes)

If you are choosing between overlapping monitoring paths, see [Entry Points by Goal](./entry-points-by-goal).

## Monitoring modes

The monitoring mode controls which default jobs stay enabled. Use `politiclaw_configure` to save or change it. The generated cron page is the source of truth for current templates; the modes map to:

| Mode | What it does |
|---|---|
| `off` | Paused — PolitiClaw won't run on its own. |
| `quiet_watch` | Silent unless tracked bills or hearings materially change. |
| `weekly_digest` | Sunday digest and monthly rep report, plus background change-watches. |
| `action_only` | Quiet except when an election is near or tracked items change. |
| `full_copilot` | Everything: digest, rep report, election alerts, background watches. |

Background change-watches (`rep_vote_watch`, `tracked_hearings`) are change-detection-gated — they produce no output during quiet windows, so even verbose modes stay silent when nothing has moved.

## What Monitoring Does Not Do

Monitoring does not edit user-authored cron jobs, and it does not quietly fabricate summaries when a source is unavailable. The runtime returns actionable failures or partial results instead.

## Recommended Workflow

1. Run `politiclaw_configure` until you have a saved address and at least one issue stance.
2. Run [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor).
3. Re-run `politiclaw_configure` any time you want to pick a different monitoring mode.
4. Use [`politiclaw_check_upcoming_votes`](../reference/generated/tools/politiclaw_check_upcoming_votes) when you want a manual snapshot.
5. Use the generated cron reference only when you need to inspect exact template behavior or debug operator paths.
