# CommentThread

## Description

A comment thread.

## Fields

| Field Name | Description |
| --- | --- |
| `comments` - [CommentConnection!](../types/CommentConnection.md) | Look up comments. |
| Arguments `sortBy` - [String](../types/String.md) Sort results by `sortDirection` - [String](../types/String.md) Sort direction `after` - [String](../types/String.md) Returns the elements in the list that come after the specified cursor. `before` - [String](../types/String.md) Returns the elements in the list that come before the specified cursor. `first` - [Int](../types/Int.md) Returns the first *n* elements from the list. `last` - [Int](../types/Int.md) Returns the last *n* elements from the list. |  |
| `id` - [ID!](../types/ID.md) | The database ID for this comment thread. |
| `lockedAt` - [DateTime](../types/DateTime.md) | Time of when this comment thread was locked. |
| `lockedBy` - [User](../types/User.md) | The user that locked this comment thread. |
| `moderatedByAdmin` - [Boolean!](../types/Boolean.md) | Returns a boolean indicating whether this comment thread was moderated by an admin. |
| `moderationStatus` - [CommentThreadModerationStatus!](../types/CommentThreadModerationStatus.md) | The moderation status of this comment thread. |
| `owner` - [User!](../types/User.md) | The thread owner |

## Example

```json
{
  "comments": CommentConnection,
  "id": "4",
  "lockedAt": "2007-12-03T10:15:30Z",
  "lockedBy": User,
  "moderatedByAdmin": false,
  "moderationStatus": "none",
  "owner": User
}
```
