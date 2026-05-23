# Video

## Description

A video

## Fields

| Field Name | Description |
| --- | --- |
| `allowComments` - [Boolean](../types/Boolean.md) | Whether comments are allowed on the video. |
| `allowRating` - [Boolean](../types/Boolean.md) | Whether ratings are allowed on the video. |
| `category` - [VideoCategory!](../types/VideoCategory.md) | An video category |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this video was first created. |
| `description` - [String](../types/String.md) | The description of the video. |
| `game` - [Game!](../types/Game.md) | Game this video belongs to |
| `id` - [ID!](../types/ID.md) | ID of the object. |
| `link` - [String!](../types/String.md) | The URL of the video. |
| `mediaStatus` - [MediaStatus!](../types/MediaStatus.md) | Status of this video |
| `owner` - [User!](../types/User.md) | Uploader of this video |
| `rating` - [Int!](../types/Int.md) | The rating of the video. |
| `siteUrl` - [String!](../types/String.md) | URL of the site this video is hosted on |
| `thumbnailUrl` - [String!](../types/String.md) | The URL of the video thumbnail. |
| `title` - [String](../types/String.md) | The title of the video. |
| `viewerBlocked` - [Boolean!](../types/Boolean.md) | True if the viewer (current user) has ignored this video's author |
| `views` - [Int!](../types/Int.md) | The number of views the video has. |

## Example

```json
{
  "allowComments": true,
  "allowRating": true,
  "category": VideoCategory,
  "createdAt": "2007-12-03T10:15:30Z",
  "description": "abc123",
  "game": Game,
  "id": "4",
  "link": "xyz789",
  "mediaStatus": "published",
  "owner": User,
  "rating": 987,
  "siteUrl": "abc123",
  "thumbnailUrl": "abc123",
  "title": "xyz789",
  "viewerBlocked": false,
  "views": 123
}
```
