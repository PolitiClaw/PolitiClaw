# politiclaw_unmute

- Label: Unmute a bill, rep, or issue
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/mutes.ts`

## Description

Remove a previously-added mute. Future monitoring alerts will include this target again. Returns a no-op acknowledgement if nothing was muted under that (kind, ref).

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `kind` | yes | `"bill" \| "rep" \| "issue"` |  |
| `ref` | yes | `string` |  |

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
      "type": "string"
    }
  }
}
```
