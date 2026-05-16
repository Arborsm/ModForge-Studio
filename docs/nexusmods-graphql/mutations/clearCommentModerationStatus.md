# clearCommentModerationStatus

## Description

Clears the moderation status of a comment.

## Response

Returns a [ClearCommentModerationStatusMutationPayload](../types/ClearCommentModerationStatusMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |

#### Example

## Query

```gql
mutation clearCommentModerationStatus($commentId: ID!) {
  clearCommentModerationStatus(commentId: $commentId) {
    comment {
      ...CommentFragment
    }
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
    "clearCommentModerationStatus": {"comment": Comment}
  }
}
```
