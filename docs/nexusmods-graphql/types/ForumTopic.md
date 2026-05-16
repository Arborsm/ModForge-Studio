# ForumTopic

## Description

A forum topic

## Fields

| Field Name | Description |
| --- | --- |
| `approved` - [Boolean!](../types/Boolean.md) | If true, this topic has been approved |
| `description` - [String!](../types/String.md) | Description |
| `forumId` - [Int!](../types/Int.md) | The database ID for this forum. |
| `id` - [Int!](../types/Int.md) | The database ID for this forum topic. |
| `pinned` - [Boolean!](../types/Boolean.md) | If true, this topic is pinned and should appear above all non-pinned topics |
| `posts` - [[ForumPost!]](../types/ForumPost.md) | List of all posts within this topic |
| `postsCount` - [Int!](../types/Int.md) | Number of posts in the topic |
| `state` - [String!](../types/String.md) | State of this topic, can be open or closed |
| `title` - [String!](../types/String.md) | Title for this topic |
| `titleSeo` - [String!](../types/String.md) | SEO-specific title for this topic |
| `topicUrl` - [String](../types/String.md) | URL for this topic |
| `views` - [Int!](../types/Int.md) | Number of views this topic has received |
| `visible` - [String!](../types/String.md) | TODO |

## Example

```json
{
  "approved": false,
  "description": "abc123",
  "forumId": 123,
  "id": 123,
  "pinned": true,
  "posts": [ForumPost],
  "postsCount": 123,
  "state": "xyz789",
  "title": "xyz789",
  "titleSeo": "abc123",
  "topicUrl": "xyz789",
  "views": 987,
  "visible": "xyz789"
}
```
