# Generated Config Schema

This page is generated from `openclaw.plugin.json` plus the explicit runtime source coverage catalog.

| Key | Required | Status | Wired Today | Summary |
| --- | --- | --- | --- | --- |
| `apiKeys.apiDataGov` | yes | `implemented` | yes | REQUIRED. Shared api.data.gov key used by both api.congress.gov and FEC OpenFEC. One key covers both. Free, instant signup at https://api.data.gov/signup/. |
| `apiKeys.geocodio` | no | `optional_upgrade` | yes | OPTIONAL UPGRADE. Reps-by-address via API. Default path uses the zero-key local shapefile pipeline; Geocodio trades disk footprint for API simplicity. Free tier 2500 lookups/day. |
| `apiKeys.googleCivic` | no | `optional_upgrade` | yes | OPTIONAL but required for politiclaw_get_my_ballot. Google Cloud API key with the Civic Information API enabled for voterInfoQuery. Distinct from api.data.gov; create it in the Google Cloud console. |

## apiKeys.apiDataGov

REQUIRED. Shared api.data.gov key used by both api.congress.gov and FEC OpenFEC. One key covers both. Free, instant signup at https://api.data.gov/signup/.

- Runtime status: `implemented`
- Required: yes
- Wired today: yes
- Unlocks: `politiclaw_search_bills`, `politiclaw_get_bill_details`, `politiclaw_score_bill`, `politiclaw_check_upcoming_votes`, `politiclaw_ingest_votes`, `politiclaw_research_finance`
- Runtime files: `packages/politiclaw-plugin/src/sources/bills/index.ts`, `packages/politiclaw-plugin/src/sources/votes/index.ts`, `packages/politiclaw-plugin/src/sources/upcomingVotes/index.ts`, `packages/politiclaw-plugin/src/sources/finance/index.ts`
- Notes: One key powers api.congress.gov-backed sources and FEC OpenFEC. Senate roll-call ingest runs through a separate zero-key source (voteview.com).

## apiKeys.geocodio

OPTIONAL UPGRADE. Reps-by-address via API. Default path uses the zero-key local shapefile pipeline; Geocodio trades disk footprint for API simplicity. Free tier 2500 lookups/day.

- Runtime status: `optional_upgrade`
- Required: no
- Wired today: yes
- Unlocks: `politiclaw_get_my_reps`
- Runtime files: `packages/politiclaw-plugin/src/sources/reps/index.ts`, `packages/politiclaw-plugin/src/sources/reps/geocodio.ts`
- Notes: Used ahead of the local shapefile resolver when a key is configured.

## apiKeys.googleCivic

OPTIONAL but required for politiclaw_get_my_ballot. Google Cloud API key with the Civic Information API enabled for voterInfoQuery. Distinct from api.data.gov; create it in the Google Cloud console.

- Runtime status: `optional_upgrade`
- Required: no
- Wired today: yes
- Unlocks: `politiclaw_get_my_ballot`, `politiclaw_election_brief`
- Runtime files: `packages/politiclaw-plugin/src/sources/ballot/index.ts`, `packages/politiclaw-plugin/src/sources/ballot/googleCivic.ts`
- Notes: Required for every ballot tool. Per-state SoS adapters were scoped out in v1 after an audit found none of the six candidate states publishes a public address-to-ballot JSON feed. Judicial retention detail and ballot-measure plain-language enrichment are not wired.
