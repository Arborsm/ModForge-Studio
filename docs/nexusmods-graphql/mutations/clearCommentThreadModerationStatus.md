# clearCommentThreadModerationStatus

## Description

Clears the moderation status of a comment thread.

## Response

Returns a [ClearThreadModerationStatusMutationPayload](../types/ClearThreadModerationStatusMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentThreadId` - [ID!](../types/ID.md) | The database ID for this comment thread. |

#### Example

## Query

```gql
mutation clearCommentThreadModerationStatus($commentThreadId: ID!) {
  clearCommentThreadModerationStatus(commentThreadId: $commentThreadId) {
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
    "clearCommentThreadModerationStatus": {
      "commentThread": CommentThread
    }
  }
}
```
