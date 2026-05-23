# ModerationWarningConnection

## Description

The connection type for ModerationWarning.

## Fields

| Field Name | Description |
| --- | --- |
| `edges` - [[ModerationWarningEdge]](../types/ModerationWarningEdge.md) | A list of edges. |
| `nodes` - [[ModerationWarning]](../types/ModerationWarning.md) | A list of nodes. |
| `pageInfo` - [PageInfo!](../types/PageInfo.md) | Information to aid in pagination. |
| `totalCount` - [Int!](../types/Int.md) | Total # of objects returned from this Plural Query |

## Example

```json
{
  "edges": [ModerationWarningEdge],
  "nodes": [ModerationWarning],
  "pageInfo": PageInfo,
  "totalCount": 987
}
```
