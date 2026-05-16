# comment

## Description

Get a comment by its ID.

## Response

Returns a [Comment!](../types/Comment.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |

#### Example

## Query

```gql
query comment($commentId: ID!) {
  comment(commentId: $commentId) {
    attachments {
      ...AttachmentFragment
    }
    body
    createdAt
    creator {
      ...UserFragment
    }
    cursor
    discardedAt
    discardedBy {
      ...UserFragment
    }
    hiddenAt
    hiddenBy {
      ...UserFragment
    }
    hiddenInternalReason
    hiddenReason
    id
    isDiscarded
    isPinned
    likesCount
    lockedAt
    lockedBy {
      ...UserFragment
    }
    moderatedByAdmin
    moderationJwt
    moderationStatus
    parent {
      ...CommentFragment
    }
    pinPriority
    pinnedBy {
      ...UserFragment
    }
    pinnedByAdmin
    replies {
      ...CommentConnectionFragment
    }
    revisions {
      ...CommentRevisionFragment
    }
    updatedAt
    viewerHasIgnored
    viewerHasLiked
  }
}
```

## Variables

```json
{"commentId": 4}
```

## Response

```json
{
  "data": {
    "comment": {
      "attachments": [Attachment],
      "body": "abc123",
      "createdAt": "2007-12-03T10:15:30Z",
      "creator": User,
      "cursor": "abc123",
      "discardedAt": "2007-12-03T10:15:30Z",
      "discardedBy": User,
      "hiddenAt": "2007-12-03T10:15:30Z",
      "hiddenBy": User,
      "hiddenInternalReason": "abc123",
      "hiddenReason": "abc123",
      "id": 4,
      "isDiscarded": true,
      "isPinned": true,
      "likesCount": 123,
      "lockedAt": "2007-12-03T10:15:30Z",
      "lockedBy": User,
      "moderatedByAdmin": true,
      "moderationJwt": "xyz789",
      "moderationStatus": "none",
      "parent": Comment,
      "pinPriority": 123,
      "pinnedBy": User,
      "pinnedByAdmin": true,
      "replies": CommentConnection,
      "revisions": [CommentRevision],
      "updatedAt": "2007-12-03T10:15:30Z",
      "viewerHasIgnored": true,
      "viewerHasLiked": true
    }
  }
}
```
