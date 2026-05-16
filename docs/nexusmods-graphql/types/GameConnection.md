# GameConnection

## Description

The connection type for Game.

## Fields

| Field Name | Description |
| --- | --- |
| `edges` - [[GameEdge]](../types/GameEdge.md) | A list of edges. |
| `nodes` - [[Game]](../types/Game.md) | A list of nodes. |
| `pageInfo` - [PageInfo!](../types/PageInfo.md) | Information to aid in pagination. |
| `totalCount` - [Int!](../types/Int.md) | Total # of objects returned from this Plural Query |

## Example

```json
{
  "edges": [GameEdge],
  "nodes": [Game],
  "pageInfo": PageInfo,
  "totalCount": 123
}
```
