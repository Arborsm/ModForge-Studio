# commentThread

## Description

Get a comment thread by its ID.

## Response

Returns a [CommentThread!](../types/CommentThread.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentThreadId` - [ID!](../types/ID.md) | The database ID for this comment thread. |

#### Example

## Query

```gql
query commentThread($commentThreadId: ID!) {
  commentThread(commentThreadId: $commentThreadId) {
    comments {
      ...CommentConnectionFragment
    }
    id
    lockedAt
    lockedBy {
      ...UserFragment
    }
    moderatedByAdmin
    moderationStatus
    owner {
      ...UserFragment
    }
  }
}
```

## Variables

```json
{"commentThreadId": 4}
```

## Response

```json
{
  "data": {
    "commentThread": {
      "comments": CommentConnection,
      "id": 4,
      "lockedAt": "2007-12-03T10:15:30Z",
      "lockedBy": User,
      "moderatedByAdmin": false,
      "moderationStatus": "none",
      "owner": User
    }
  }
}
```
