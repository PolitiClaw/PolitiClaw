# politiclaw_resolve_auto_rating

- Label: Resolve an AI-rated bill (promote / override / skip)
- Group: Bills and votes
- Source file: `packages/politiclaw-plugin/src/tools/review.ts`

## Description

Apply human judgment to a bill the AI classifier surfaced for review. promote: accept the AI's call for a single stance (advances → agree, obstructs → disagree); requires stanceSlug; errors on mixed/unclear. override: record your own agree/disagree; pass stanceSlug to scope to one stance, omit it to apply to every stance the bill matches. skip: record a bill-level 'skip' signal so the bill is excluded from rep scoring across all stances.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `billId` | yes | `string` | Bill id to resolve. |
| `action` | yes | `"promote" \| "override" \| "skip"` |  |
| `direction` | no | `"agree" \| "disagree"` |  |
| `stanceSlug` | no | `string` | Required for action='promote' (the AI call is per-stance, so promotion needs to know which stance you're accepting). Optional for action='override': when present the override only applies to that stance; when absent it applies to every stance the bill matches. Ignored for action='skip' (skip is bill-level by design). |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "billId",
    "action"
  ],
  "properties": {
    "billId": {
      "minLength": 1,
      "description": "Bill id to resolve.",
      "type": "string"
    },
    "action": {
      "anyOf": [
        {
          "const": "promote",
          "type": "string"
        },
        {
          "const": "override",
          "type": "string"
        },
        {
          "const": "skip",
          "type": "string"
        }
      ]
    },
    "direction": {
      "anyOf": [
        {
          "const": "agree",
          "type": "string"
        },
        {
          "const": "disagree",
          "type": "string"
        }
      ]
    },
    "stanceSlug": {
      "minLength": 1,
      "description": "Required for action='promote' (the AI call is per-stance, so promotion needs to know which stance you're accepting). Optional for action='override': when present the override only applies to that stance; when absent it applies to every stance the bill matches. Ignored for action='skip' (skip is bill-level by design).",
      "type": "string"
    }
  }
}
```
