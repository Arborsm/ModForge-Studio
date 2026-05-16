# PublicCollectionChangelog

## Description

A public changelog attached to a collection revision. If you need to access more fields, use CollectionChangelogType instead.

## Fields

| Field Name | Description |
| --- | --- |
| `collectionRevisionId` - [Int!](../types/Int.md) | The id of the collection revision for which this changelog was created |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this collection changelog was first created. |
| `description` - [String!](../types/String.md) | The content of the collection changelog, in Markdown format |
| `id` - [Int!](../types/Int.md) | The database ID for this collection changelog. |
| `revisionNumber` - [Int!](../types/Int.md) | The revision number of the collection revision for which this changelog was created |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this collection changelog was last updated. |

## Example

```json
{
  "collectionRevisionId": 987,
  "createdAt": "2007-12-03T10:15:30Z",
  "description": "abc123",
  "id": 987,
  "revisionNumber": 123,
  "updatedAt": "2007-12-03T10:15:30Z"
}
```
