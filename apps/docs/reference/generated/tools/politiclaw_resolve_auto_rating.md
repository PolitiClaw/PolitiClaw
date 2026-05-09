# politiclaw_resolve_auto_rating

- Label: Resolve an AI-rated bill (promote / override / skip)
- Group: Bills and votes
- Source file: `packages/politiclaw-plugin/src/tools/review.ts`

## Description

Apply human judgment to a bill the AI classifier surfaced for review. promote: accept the AI's call (advances → agree, obstructs → disagree); errors on mixed/unclear. override: record your own agree/disagree on the bill (requires direction). skip: record a 'skip' signal so the bill is excluded from rep scoring.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `billId` | yes | `string` | Bill id to resolve. |
| `action` | yes | `"promote" \| "override" \| "skip"` |  |
| `direction` | no | `"agree" \| "disagree"` |  |

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
    }
  }
}
```
