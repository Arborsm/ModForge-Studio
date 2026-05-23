# CollectionRevisionMod

## Description

A mod file included in a collection

## Fields

| Field Name | Description |
| --- | --- |
| `collectionRevisionId` - [Int!](../types/Int.md) | The id of the collection revision including the mod file |
| `file` - [ModFile](../types/ModFile.md) | The mod file |
| `fileId` - [Int!](../types/Int.md) | The mod file's id |
| `gameId` - [Int!](../types/Int.md) | The game id for the mod file |
| `id` - [ID!](../types/ID.md) | The database ID for this collection revision mod. |
| `optional` - [Boolean!](../types/Boolean.md) | Whether the mod file is required for the collection |
| `updatePolicy` - [String!](../types/String.md) | Indicates to mod managers how they should handle automatic updates |
| `version` - [String!](../types/String.md) | The mod file version |

## Example

```json
{
  "collectionRevisionId": 123,
  "file": ModFile,
  "fileId": 123,
  "gameId": 987,
  "id": "4",
  "optional": false,
  "updatePolicy": "xyz789",
  "version": "xyz789"
}
```
