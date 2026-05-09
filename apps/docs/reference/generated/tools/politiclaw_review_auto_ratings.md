# politiclaw_review_auto_ratings

- Label: Review AI-rated bills that need your judgment
- Group: Bills and votes
- Source file: `packages/politiclaw-plugin/src/tools/review.ts`

## Description

List bills the LLM directional classifier flagged as borderline, mixed, or unclassifiable for the current stance snapshot. These are bills relevant to your declared stances where the AI's call wasn't strong enough to count automatically toward rep scoring. Use politiclaw_resolve_auto_rating to promote, override, or skip individual rows.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `tier` | no | `"borderline" \| "mixed" \| "unclassifiable" \| "all"` |  |
| `stanceSlug` | no | `string` | Filter to a single declared stance (issue slug). Omit to include all your stances. |
| `limit` | no | `integer` |  |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "tier": {
      "anyOf": [
        {
          "const": "borderline",
          "type": "string"
        },
        {
          "const": "mixed",
          "type": "string"
        },
        {
          "const": "unclassifiable",
          "type": "string"
        },
        {
          "const": "all",
          "type": "string"
        }
      ]
    },
    "stanceSlug": {
      "description": "Filter to a single declared stance (issue slug). Omit to include all your stances.",
      "type": "string"
    },
    "limit": {
      "minimum": 1,
      "maximum": 200,
      "default": 25,
      "type": "integer"
    }
  }
}
```
