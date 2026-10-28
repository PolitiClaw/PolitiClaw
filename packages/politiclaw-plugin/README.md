# PolitiClaw Plugin

A local-first OpenClaw plugin: a civic copilot that holds your representatives accountable to the stances you declare. It watches federal legislation and elections, flags when your reps' votes and actions align or don't, and drafts letters you send yourself. It does not send those letters, recommend a vote, or invent a stance.

Political data stays in a plugin-private SQLite database under the gateway's state directory. It does not write to shared agent memory.

## Install

Install the plugin into a running OpenClaw gateway from ClawHub:

```bash
openclaw plugins install clawhub:@politiclaw/politiclaw
```

Or install the package directly from npm:

```bash
openclaw plugins install @politiclaw/politiclaw
```

Reload the gateway (or restart the OpenClaw app) to pick up the new tools.

Working on the plugin from a local checkout instead? See [Development](#development).

## First-run checklist

Slash commands are for you. Tools are for the agent. Ask the agent to call `politiclaw_configure`; typing that name into a terminal does nothing.

1. **Start setup.** Run `/politiclaw-setup`. It prints the next step and a prompt to hand to the agent. On a fresh install that prompt is: `Ask your agent: Call the agent tool politiclaw_configure with my street address.`

2. **Walk the setup questions.** The agent collects, in order: street address, issue stances, monitoring mode, and accountability. Alignment scores exist only for stances you declared. Put the specific concern in `note`. Letters, call scripts, rep reports, and the monitoring contract use that text. Add or change a stance later with `politiclaw_issue_stances` (`set`, `list`, or `delete`).

3. **Save the required key** when setup asks for it. See [API keys](#api-keys). Saving a key restarts the gateway. Reconnect, run `/politiclaw-setup`, and continue. Earlier answers are already saved.

4. **Expect alerts on the schedule you picked**, not immediately. The default mode is **Action only**.

Call `politiclaw_configure` again later to refresh reps, change mode, save a key, or update the address.

If a step looks wrong, run `/politiclaw-status`, `/politiclaw-doctor`, or `/politiclaw-version`. See [Troubleshooting](#troubleshooting).

### What each monitoring mode runs

| Mode | What runs |
| --- | --- |
| Action only (default) | 6-hour bill watch, 12-hour hearings, election alert |
| Weekly digest | Those watches, 7-day summary, 30-day rep report |
| Full copilot | Weekly digest, plus the election alert |
| Quiet watch | 6-hour bill watch and 12-hour hearings |
| Paused | No scheduled jobs |

The bill watch runs every 6 hours and the hearing watch every 12 hours. Both stay silent when nothing material changed. The weekly summary runs every 7 days, and the rep report runs about every 30 days. The election alert posts when the next election is 30, 14, 7, or 1 day away. It reads that date from `googleCivic`; without the key, the job reports the missing key instead of guessing a date. To look ahead yourself, ask the agent to call `politiclaw_check_upcoming_votes`.

## API keys

Paste keys into chat and ask the agent to call `politiclaw_configure`. The same call can save a key later without repeating setup: pass `apiDataGov`, or pass `geocodio` / `googleCivic` in `optionalApiKeys`. Either way the plugin writes `plugins.entries.politiclaw.config.apiKeys` in `~/.openclaw/openclaw.json` and the gateway restarts. You can edit that file by hand instead.

`apiDataGov` is required. The other two keys are optional.

| Key | Need | Unlocks |
| --- | --- | --- |
| `apiDataGov` | Required | Federal bills, House votes, committees, FEC |
| `geocodio` | Optional | Faster reps-by-address |
| `googleCivic` | Ballot tools | Ballot contents and election dates |

`apiDataGov` is one free key for Congress and OpenFEC. [Sign up](https://api.data.gov/signup/). Senate roll-call votes come from voteview.com and need no key. Without `geocodio`, reps lookup uses a local shapefile cache. `googleCivic` is a Google Civic Information API key, separate from api.data.gov, and it is what `politiclaw_get_my_ballot` and `politiclaw_election_brief` read.

Run `/politiclaw-doctor` after saving. It reports which of these keys are set and what a missing key blocks.

### Roadmap

State bills, state vote positions, and state campaign finance are not available yet. These names are not wired keys: `openStates` (state bills and member votes), `legiscan` (an alternate state-bill source), and `followTheMoney` (state campaign finance). The runtime ignores them. `politiclaw_configure` and `politiclaw_set_api_keys` will not save them. An unknown extra string under `apiKeys` can still validate so an older config file keeps loading.

## Override recipes

Skills are plain markdown. They set the plugin's voice, guardrails, and section order. To change one, copy it to `~/.agents/skills/<name>/SKILL.md` (or `~/.openclaw/skills/<name>/SKILL.md`) and edit the copy. Reload the gateway. A skill override does not need `npm run build`.

On a `--link` install you can edit `skills/<name>/SKILL.md` in the checkout instead. That lasts until a published package replaces the link.

Current skills:

- `politiclaw-onboarding` — drives `politiclaw_configure` through address, stances, monitoring mode, and accountability.
- `politiclaw-monitoring` — how the agent reads change-detection results, alignment scores, and election alerts.
- `politiclaw-ballot` — how the agent explains ballot items, without prescribing a vote.
- `politiclaw-outreach` — how the agent drafts letters. You send them; the plugin never does.
- `politiclaw-summary` — format and scope of the weekly digest.

`/politiclaw-doctor` reports overrides in `~/.agents/skills` and `~/.openclaw/skills`. Workspace copies are invisible to that check.

## Dashboard

The plugin serves a local dashboard at `/politiclaw` on the gateway. It shows preferences, reps and alignment scores, monitoring jobs, the next election, recent alerts, drafted letters, and recent bill-linked roll-call votes, all from the plugin's private database.

You can also edit from the page:

- **Preferences** — save address, ZIP, state, district, or monitoring mode without the agent.
- **Pause all / Resume all** — pause or resume every PolitiClaw cron job.
- **Quick vote** — record agree, disagree, or skip on a recent bill-linked vote. Agree and disagree are stored as stance signals and used the next time alignment is scored. Skip is stored and left out of the score.
- **Request re-draft** — flag a past letter. The next agent session drafts a new version. The page does not call tools itself.

The route is registered with `auth: "plugin"`, so the gateway adds no login of its own. POST requests need a double-submit CSRF token (`pc_csrf` cookie plus an `X-PolitiClaw-CSRF` header), and bodies are limited to 256 KB. Keep the gateway on your own machine. If you expose it beyond localhost, put your own auth in front of this page.

## Troubleshooting

Run `/politiclaw-doctor` first. It only reads state. Each check is `ok`, `warn`, or `fail`, and a non-ok check includes a hint. In one pass it checks:

- Schema migrations.
- SQLite integrity.
- Preferences, including state and ZIP.
- Monitoring mode and accountability.
- `apiDataGov`, `geocodio`, and `googleCivic`, and what a missing key blocks.
- Whether the reps cache has any rows.
- Which PolitiClaw cron jobs are installed or paused.
- Skill overrides in `~/.agents/skills` and `~/.openclaw/skills`.

The doctor runs inside the gateway process. If the gateway is on another machine, fix a missing cron adapter or an unreadable state directory on that host.

### Plugin installed but tool unavailable

If the package installed but the agent cannot call `politiclaw_configure`, restart the gateway, confirm PolitiClaw is enabled, then run `/politiclaw-version`. If the version command works and the tool still does not, run `/politiclaw-doctor`.

### Gateway restarted during key save

A key save restarts the gateway on purpose. Reconnect, run `/politiclaw-setup`, and give the agent the prompt it prints. Setup continues from saved state.

## Development

### Install from a local checkout

From the workspace root:

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
```

The `--link` install reads from the source path, so edits land without reinstalling.

### Build and test

From this package directory:

```bash
npm run build
npm run typecheck
npm run test
```

From the workspace root:

```bash
npm run dev:plugin
```

## License

PolitiClaw is released under the [MIT License](LICENSE).
