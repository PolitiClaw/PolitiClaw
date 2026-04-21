# politiclaw_mute

- Label: Mute a bill, rep, or issue
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/mutes.ts`

## Description

Suppress future monitoring alerts for a specific bill, representative, or issue. Muting is idempotent — re-muting the same target refreshes the optional reason and timestamp. Use when the user says they have seen enough about a topic; they can always unmute later.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `kind` | yes | `"bill" \| "rep" \| "issue"` | What to mute: 'bill' (by bill id like '119-hr-1234'), 'rep' (by bioguide id), or 'issue' (by issue slug). |
| `ref` | yes | `string` | The bill id, bioguide id, or issue slug to mute. Issue refs are normalized to lowercase kebab-case. |
| `reason` | no | `string` | Optional short note about why this is muted (e.g. 'followup-2026-05'). Stored for your own reference; not rendered in alerts. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "kind",
    "ref"
  ],
  "properties": {
    "kind": {
      "description": "What to mute: 'bill' (by bill id like '119-hr-1234'), 'rep' (by bioguide id), or 'issue' (by issue slug).",
      "anyOf": [
        {
          "const": "bill",
          "type": "string"
        },
        {
          "const": "rep",
          "type": "string"
        },
        {
          "const": "issue",
          "type": "string"
        }
      ]
    },
    "ref": {
      "description": "The bill id, bioguide id, or issue slug to mute. Issue refs are normalized to lowercase kebab-case.",
      "type": "string"
    },
    "reason": {
      "description": "Optional short note about why this is muted (e.g. 'followup-2026-05'). Stored for your own reference; not rendered in alerts.",
      "type": "string"
    }
  }
}
```
