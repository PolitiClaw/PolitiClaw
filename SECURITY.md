# Security Policy

## Reporting a vulnerability

If you believe you have found a security issue in PolitiClaw — the `@politiclaw/politiclaw` npm package, the plugin's local HTTP dashboard, or anything else in this repository — please report it privately rather than opening a public issue.

**Email:** [arippberger@gmail.com](mailto:arippberger@gmail.com) with the subject line `politiclaw security`.

Include, if you can:

- A description of the issue and the impact you believe it has.
- Reproduction steps or a proof-of-concept.
- The plugin version (`politiclaw-version` slash command output) and the OpenClaw gateway version you tested against.
- Whether you intend to disclose the issue publicly, and on what timeline.

We will acknowledge receipt within **5 business days** and aim to triage and respond with a remediation plan within **14 days** of acknowledgement. Fixes for confirmed vulnerabilities are released as patch versions on npm and republished to ClawHub. Reporters are credited in the changelog unless they prefer to remain anonymous.

## Scope

In scope:

- The `@politiclaw/politiclaw` plugin source under `packages/politiclaw-plugin/`.
- The local HTTP dashboard served by the plugin (`src/http/`).
- The plugin's SQLite storage and migrations under `src/storage/`.
- API-key handling and the gateway `config.patch` integration in `src/config/`.
- The release/publish workflows under `.github/workflows/`.

Out of scope:

- Vulnerabilities in upstream services (api.congress.gov, FEC, Google Civic, OpenStates, etc.) — please report those to the upstream maintainers.
- The OpenClaw gateway itself — report to the OpenClaw project.
- Vulnerabilities in third-party npm dependencies — please report upstream, and we will pull in the fix as soon as a patched version lands.
- Issues that depend on a malicious local user already having shell access to the host running the gateway.

## What we consider a vulnerability

- Bypasses of the dashboard's CSRF protection or unauthenticated access from non-localhost origins.
- API keys being written to logs, agent memory, transcripts, or other surfaces outside `plugins.entries.politiclaw.config.apiKeys.*`.
- Path traversal, SQL injection, or arbitrary code execution via tool input or stored data.
- Prompt-injection vectors via upstream API responses that cause the agent to perform actions outside the plugin's documented surface.
- Cron jobs or tools executing shell commands or arbitrary code.

## What is not a vulnerability

- The plugin makes outbound HTTPS calls to declared public-data APIs. This is intentional and documented in the plugin README and the ClawHub disclosure note.
- The plugin drafts letters to elected officials. It never sends them — the user copies the draft to their own email client. This is by design.
- LLM-derived bill ratings are disclosed inline on every output and are reviewable / reversible via the `politiclaw_review_auto_ratings` and `politiclaw_resolve_auto_rating` tools. Disagreement with a rating is feedback, not a vulnerability.

Thank you for helping keep PolitiClaw and its users safe.
