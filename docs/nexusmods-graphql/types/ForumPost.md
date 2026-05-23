# ForumPost

## Description

A forum post

## Fields

| Field Name | Description |
| --- | --- |
| `authorId` - [Int!](../types/Int.md) | Author ID of the forum post |
| `authorName` - [String!](../types/String.md) | Author name of the forum post |
| `id` - [Int!](../types/Int.md) | The database ID for this forum post. |
| `post` - [String!](../types/String.md) | Post contents |
| `postDate` - [Int!](../types/Int.md) | Post date and time |
| `user` - [User!](../types/User.md) | Post author details |

## Example

```json
{
  "authorId": 123,
  "authorName": "abc123",
  "id": 123,
  "post": "xyz789",
  "postDate": 987,
  "user": User
}
```
