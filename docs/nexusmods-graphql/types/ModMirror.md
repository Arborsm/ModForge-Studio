# ModMirror

## Description

A download mirror for a mod

## Fields

| Field Name | Description |
| --- | --- |
| `count` - [Int](../types/Int.md) | Download count for this mirror |
| `gameId` - [Int!](../types/Int.md) | The database ID for this game. |
| `id` - [ID!](../types/ID.md) | The database ID for this mod mirror. |
| `modId` - [Int!](../types/Int.md) | The database ID for this mod. |
| `name` - [String!](../types/String.md) | Name of this mirror |
| `totalDownloads` - [Int](../types/Int.md) | Download count for this mirror |
| `uri` - [String](../types/String.md) | URI for this mirror |

## Example

```json
{
  "count": 123,
  "gameId": 123,
  "id": "4",
  "modId": 123,
  "name": "xyz789",
  "totalDownloads": 123,
  "uri": "abc123"
}
```
