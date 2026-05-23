# News

## Description

A News article, stored and originally defined by the legacy forum

## Fields

| Field Name | Description |
| --- | --- |
| `author` - [User!](../types/User.md) | Author of this News Article |
| `commentsCount` - [Int!](../types/Int.md) | The number of comments on this article |
| `content` - [String!](../types/String.md) | Content of this news article |
| `date` - [ISO8601DateTime!](../types/ISO8601DateTime.md) | Date this news article was created |
| `games` - [[Game!]!](../types/Game.md) | Games this news article is related to |
| `header` - [String](../types/String.md) | The name of the image on the forum |
| `html` - [Boolean!](../types/Boolean.md) | Is this news article written in HTML? |
| `id` - [ID!](../types/ID.md) | The database ID for this news. |
| `image` - [String](../types/String.md) | The name of the image on the forum |
| `newsCategory` - [NewsCategory!](../types/NewsCategory.md) | Category of this news article |
| `sourceName` - [String](../types/String.md) | If the news article has a source, this is it's name |
| `sourceUrl` - [String](../types/String.md) | If the news article has a source, this is the URL |
| `summary` - [String!](../types/String.md) | Summary of this news article |
| `title` - [String!](../types/String.md) | Title of this news article |
| `uncroppedHeader` - [String](../types/String.md) | The name of the uncropped image on the forum |
| `uncroppedImage` - [String](../types/String.md) | The name of the uncropped image on the forum |

## Example

```json
{
  "author": User,
  "commentsCount": 987,
  "content": "xyz789",
  "date": ISO8601DateTime,
  "games": [Game],
  "header": "abc123",
  "html": false,
  "id": "4",
  "image": "xyz789",
  "newsCategory": NewsCategory,
  "sourceName": "abc123",
  "sourceUrl": "abc123",
  "summary": "xyz789",
  "title": "xyz789",
  "uncroppedHeader": "xyz789",
  "uncroppedImage": "xyz789"
}
```
