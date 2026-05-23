# Comment

## Description

A comment.

## Fields

| Field Name | Description |
| --- | --- |
| `attachments` - [[Attachment!]](../types/Attachment.md) | The attachment filename and IDs |
| `body` - [String!](../types/String.md) | The content of the latest revision for this comment. |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this comment was first created. |
| `creator` - [User!](../types/User.md) | The user that created this comment. |
| `cursor` - [String!](../types/String.md) | The pagination cursor for this comment. |
| `discardedAt` - [DateTime](../types/DateTime.md) | Time of when this comment was discarded. |
| `discardedBy` - [User](../types/User.md) | The user that discarded this comment. |
| `hiddenAt` - [DateTime](../types/DateTime.md) | Time of when this comment was hidden. |
| `hiddenBy` - [User](../types/User.md) | The user that hid this comment. |
| `hiddenInternalReason` - [String](../types/String.md) | The internal reason why this comment was hidden. Only accessible to admins and moderators. |
| `hiddenReason` - [String](../types/String.md) | The public reason why this comment was hidden. |
| `id` - [ID!](../types/ID.md) | The database ID for this comment. |
| `isDiscarded` - [Boolean!](../types/Boolean.md) | Returns a boolean indicating whether this comment is discarded. |
| `isPinned` - [Boolean!](../types/Boolean.md) | Is this a pinned comment |
| `likesCount` - [Int!](../types/Int.md) | Comment likes count. |
| `lockedAt` - [DateTime](../types/DateTime.md) | Time of when this comment was locked. |
| `lockedBy` - [User](../types/User.md) | The user that locked this comment. |
| `moderatedByAdmin` - [Boolean!](../types/Boolean.md) | Returns a boolean indicating whether this comment was moderated by an admin. |
| `moderationJwt` - [String!](../types/String.md) | JWT token for submitting moderation reports |
| `moderationStatus` - [CommentModerationStatus!](../types/CommentModerationStatus.md) | The moderation status of this comment. |
| `parent` - [Comment](../types/Comment.md) | The parent comment. |
| `pinPriority` - [Int](../types/Int.md) | The user that pinned this comment. |
| `pinnedBy` - [User](../types/User.md) | User which pinned the comment |
| `pinnedByAdmin` - [Boolean!](../types/Boolean.md) | Returns a boolean indicating whether this comment was pinned by an admin. |
| `replies` - [CommentConnection!](../types/CommentConnection.md) | A list of replies to this comment. |
| Arguments `after` - [String](../types/String.md) Returns the elements in the list that come after the specified cursor. `before` - [String](../types/String.md) Returns the elements in the list that come before the specified cursor. `first` - [Int](../types/Int.md) Returns the first *n* elements from the list. `last` - [Int](../types/Int.md) Returns the last *n* elements from the list. |  |
| `revisions` - [[CommentRevision!]!](../types/CommentRevision.md) | The revisions of this comment. |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this comment was last updated. |
| `viewerHasIgnored` - [Boolean!](../types/Boolean.md) | Whether the viewer has ignored the content owner. |
| `viewerHasLiked` - [Boolean!](../types/Boolean.md) | Returns a boolean indicating whether the viewing user has liked this comment. |

## Example

```json
{
  "attachments": [Attachment],
  "body": "abc123",
  "createdAt": "2007-12-03T10:15:30Z",
  "creator": User,
  "cursor": "abc123",
  "discardedAt": "2007-12-03T10:15:30Z",
  "discardedBy": User,
  "hiddenAt": "2007-12-03T10:15:30Z",
  "hiddenBy": User,
  "hiddenInternalReason": "xyz789",
  "hiddenReason": "abc123",
  "id": "4",
  "isDiscarded": false,
  "isPinned": true,
  "likesCount": 987,
  "lockedAt": "2007-12-03T10:15:30Z",
  "lockedBy": User,
  "moderatedByAdmin": false,
  "moderationJwt": "abc123",
  "moderationStatus": "none",
  "parent": Comment,
  "pinPriority": 123,
  "pinnedBy": User,
  "pinnedByAdmin": false,
  "replies": CommentConnection,
  "revisions": [CommentRevision],
  "updatedAt": "2007-12-03T10:15:30Z",
  "viewerHasIgnored": false,
  "viewerHasLiked": false
}
```
