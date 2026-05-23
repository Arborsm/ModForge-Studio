# CollectionImage

## Description

Images related to a collection

## Fields

| Field Name | Description |
| --- | --- |
| `altText` - [String](../types/String.md) | The alt text describing the image for screen readers |
| `collection` - [Collection!](../types/Collection.md) | The collection for which the image was uploaded |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this collection image was first created. |
| `discardedAt` - [DateTime](../types/DateTime.md) | Time of when this collection image was discarded. |
| `globalId` - [ID](../types/ID.md) | The global ID for this entity. |
| `id` - [ID!](../types/ID.md) | The database ID for this collection image. |
| `imageType` - [ImageTypes!](../types/ImageTypes.md) | Determines where the image is displayed |
| `order` - [String!](../types/String.md) | The order of this entity in the list. |
| `revision` - [CollectionRevision](../types/CollectionRevision.md) | The collection revision for which the image was uploaded |
| `thumbnailUrl` - [String!](../types/String.md) | Can be used to select a scaled down/compressed version of the image |
| Arguments `size` - [ThumbnailSize!](../types/ThumbnailSize.md) The thumbnail size |  |
| `title` - [String](../types/String.md) | The image title |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this collection image was last updated. |
| `url` - [String!](../types/String.md) | The image resource url |
| `user` - [User!](../types/User.md) | The user who uploaded the image |

## Example

```json
{
  "altText": "abc123",
  "collection": Collection,
  "createdAt": "2007-12-03T10:15:30Z",
  "discardedAt": "2007-12-03T10:15:30Z",
  "globalId": 4,
  "id": "4",
  "imageType": "gallery",
  "order": "abc123",
  "revision": CollectionRevision,
  "thumbnailUrl": "abc123",
  "title": "xyz789",
  "updatedAt": "2007-12-03T10:15:30Z",
  "url": "abc123",
  "user": User
}
```
