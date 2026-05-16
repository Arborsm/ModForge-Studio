# restoreComment

## Description

Restores a discarded comment.

## Response

Returns a [RestoreCommentMutationPayload](../types/RestoreCommentMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |

#### Example

## Query

```gql
mutation restoreComment($commentId: ID!) {
  restoreComment(commentId: $commentId) {
    comment {
      ...CommentFragment
    }
  }
}
```

## Variables

```json
{"commentId": "4"}
```

## Response

```json
{"data": {"restoreComment": {"comment": Comment}}}
```
