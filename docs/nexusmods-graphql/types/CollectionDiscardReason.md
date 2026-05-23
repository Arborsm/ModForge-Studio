# CollectionDiscardReason

## Description

A reason for which a revision has been retracted.

## Fields

| Field Name | Description |
| --- | --- |
| `collectionId` - [Int!](../types/Int.md) | The id of the collection which was discarded |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this collection discard reason was first created. |
| `id` - [Int!](../types/Int.md) | The database ID for this collection discard reason. |
| `reason` - [String!](../types/String.md) | The reason why the collection was discarded |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this collection discard reason was last updated. |

## Example

```json
{
  "collectionId": 123,
  "createdAt": "2007-12-03T10:15:30Z",
  "id": 987,
  "reason": "abc123",
  "updatedAt": "2007-12-03T10:15:30Z"
}
```
