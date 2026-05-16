# lockCommentThread

## Description

Locks a comment thread.

## Response

Returns a [LockThreadMutationPayload](../types/LockThreadMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentThreadId` - [ID!](../types/ID.md) | The database ID for this comment thread. |

#### Example

## Query

```gql
mutation lockCommentThread($commentThreadId: ID!) {
  lockCommentThread(commentThreadId: $commentThreadId) {
    commentThread {
      ...CommentThreadFragment
    }
  }
}
```

## Variables

```json
{"commentThreadId": "4"}
```

## Response

```json
{
  "data": {
    "lockCommentThread": {"commentThread": CommentThread}
  }
}
```
