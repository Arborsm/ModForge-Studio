# CollectionVideo

## Description

Videos related to a collection

## Fields

| Field Name | Description |
| --- | --- |
| `collection` - [Collection!](../types/Collection.md) | Collection that this video belongs to |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this collection video was first created. |
| `discardedAt` - [DateTime](../types/DateTime.md) | Time of when this collection video was discarded. |
| `globalId` - [ID](../types/ID.md) | The global ID for this entity. |
| `id` - [ID!](../types/ID.md) | The database ID for this collection video. |
| `order` - [String!](../types/String.md) | The order of this entity in the list. |
| `revision` - [CollectionRevision](../types/CollectionRevision.md) | Revision that this video belongs to |
| `thumbnailUrl` - [String!](../types/String.md) | The thumbnail URL for the video. |
| `title` - [String!](../types/String.md) | The title of the video. |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this collection video was last updated. |
| `url` - [String!](../types/String.md) | URL of this video |
| `user` - [User!](../types/User.md) | Uploader of this video |

## Example

```json
{
  "collection": Collection,
  "createdAt": "2007-12-03T10:15:30Z",
  "discardedAt": "2007-12-03T10:15:30Z",
  "globalId": 4,
  "id": 4,
  "order": "abc123",
  "revision": CollectionRevision,
  "thumbnailUrl": "xyz789",
  "title": "xyz789",
  "updatedAt": "2007-12-03T10:15:30Z",
  "url": "xyz789",
  "user": User
}
```
