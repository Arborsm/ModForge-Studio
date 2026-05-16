# Image

## Description

An image

## Fields

| Field Name | Description |
| --- | --- |
| `adult` - [Boolean](../types/Boolean.md) | If true, this image contains adult content |
| `allowComments` - [Boolean](../types/Boolean.md) | Whether comments are allowed on the image. |
| `allowRating` - [Boolean](../types/Boolean.md) | Whether ratings are allowed on the image. |
| `caption` - [String!](../types/String.md) | A caption for this image |
| `category` - [ImageCategory!](../types/ImageCategory.md) | An image category |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this image was first created. |
| `description` - [String!](../types/String.md) | A detailed description of this image |
| `game` - [Game!](../types/Game.md) | Game this image belongs to |
| `id` - [ID!](../types/ID.md) | ID of the object. |
| `mediaStatus` - [MediaStatus!](../types/MediaStatus.md) | Status of this image |
| `name` - [String!](../types/String.md) | Name of the image file |
| `owner` - [User!](../types/User.md) | Uploader of this image |
| `rating` - [Int!](../types/Int.md) | Rating of this image |
| `siteUrl` - [String!](../types/String.md) | URL of the site this image is hosted on |
| `thumbnailUrl` - [String!](../types/String.md) | URL of the thumbnail of this image |
| `title` - [String](../types/String.md) | A title for this image |
| `url` - [String!](../types/String.md) | URL of this image |
| `viewerBlocked` - [Boolean!](../types/Boolean.md) | True if the viewer (current user) has ignored this image's author |
| `views` - [Int!](../types/Int.md) | View count of this image |

## Example

```json
{
  "adult": true,
  "allowComments": true,
  "allowRating": false,
  "caption": "abc123",
  "category": ImageCategory,
  "createdAt": "2007-12-03T10:15:30Z",
  "description": "abc123",
  "game": Game,
  "id": 4,
  "mediaStatus": "published",
  "name": "abc123",
  "owner": User,
  "rating": 123,
  "siteUrl": "abc123",
  "thumbnailUrl": "abc123",
  "title": "abc123",
  "url": "abc123",
  "viewerBlocked": false,
  "views": 987
}
```
