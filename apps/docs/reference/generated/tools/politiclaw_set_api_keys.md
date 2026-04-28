# politiclaw_set_api_keys

- Label: Save PolitiClaw API keys
- Group: Configuration and preferences
- Source file: `packages/politiclaw-plugin/src/tools/setApiKeys.ts`

## Description

Persist one or more PolitiClaw API keys into the user's OpenClaw config (`plugins.entries.politiclaw.config.apiKeys.*`). Pass only the keys the user actually has — unsupplied fields are left untouched. Writes go through the gateway's `config.patch` method (validated, audited, optimistic concurrency); the gateway schedules its own restart so the new values become live. The required key is `apiDataGov` (one free key from api.data.gov covers federal bills, House roll-call votes, committee schedules, and FEC finance). All other keys are optional upgrades. Prefer one call with every key the user has, since each call triggers exactly one gateway restart.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `apiDataGov` | no | `string` | REQUIRED in practice. Free api.data.gov key — covers api.congress.gov (federal bills, House roll-call votes, committee schedules) and FEC OpenFEC. Sign up at https://api.data.gov/signup/. |
| `geocodio` | no | `string` | OPTIONAL. Geocodio key — reps-by-address via API. Free tier 2,500 lookups/day. |
| `openStates` | no | `string` | OPTIONAL. Open States key — state bills and votes with member positions. |
| `legiscan` | no | `string` | OPTIONAL. LegiScan key — alternative state-bills source. Free tier 30k queries/month. |
| `openSecrets` | no | `string` | OPTIONAL. OpenSecrets key — federal campaign-finance derived analytics. Non-commercial use only. |
| `followTheMoney` | no | `string` | OPTIONAL. FollowTheMoney key — state-level campaign finance. |
| `voteSmart` | no | `string` | OPTIONAL. Vote Smart key — structured candidate bios. |
| `democracyWorks` | no | `string` | OPTIONAL. Democracy Works key — ballot logistics upgrade. Partner-gated. |
| `cicero` | no | `string` | OPTIONAL (paid). Cicero key — local municipal/county/school-board representatives. |
| `ballotReady` | no | `string` | OPTIONAL (commercial). BallotReady key — fuller down-ballot coverage. |
| `googleCivic` | no | `string` | OPTIONAL. Google Civic key — required for politiclaw_get_my_ballot. Create in Google Cloud console with the Civic Information API enabled. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "apiDataGov": {
      "description": "REQUIRED in practice. Free api.data.gov key — covers api.congress.gov (federal bills, House roll-call votes, committee schedules) and FEC OpenFEC. Sign up at https://api.data.gov/signup/.",
      "type": "string"
    },
    "geocodio": {
      "description": "OPTIONAL. Geocodio key — reps-by-address via API. Free tier 2,500 lookups/day.",
      "type": "string"
    },
    "openStates": {
      "description": "OPTIONAL. Open States key — state bills and votes with member positions.",
      "type": "string"
    },
    "legiscan": {
      "description": "OPTIONAL. LegiScan key — alternative state-bills source. Free tier 30k queries/month.",
      "type": "string"
    },
    "openSecrets": {
      "description": "OPTIONAL. OpenSecrets key — federal campaign-finance derived analytics. Non-commercial use only.",
      "type": "string"
    },
    "followTheMoney": {
      "description": "OPTIONAL. FollowTheMoney key — state-level campaign finance.",
      "type": "string"
    },
    "voteSmart": {
      "description": "OPTIONAL. Vote Smart key — structured candidate bios.",
      "type": "string"
    },
    "democracyWorks": {
      "description": "OPTIONAL. Democracy Works key — ballot logistics upgrade. Partner-gated.",
      "type": "string"
    },
    "cicero": {
      "description": "OPTIONAL (paid). Cicero key — local municipal/county/school-board representatives.",
      "type": "string"
    },
    "ballotReady": {
      "description": "OPTIONAL (commercial). BallotReady key — fuller down-ballot coverage.",
      "type": "string"
    },
    "googleCivic": {
      "description": "OPTIONAL. Google Civic key — required for politiclaw_get_my_ballot. Create in Google Cloud console with the Civic Information API enabled.",
      "type": "string"
    }
  }
}
```
