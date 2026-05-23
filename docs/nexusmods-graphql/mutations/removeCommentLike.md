# removeCommentLike

## Description

Removes the current user's like from a comment.

## Response

Returns a [RemoveCommentLikeMutationPayload](../types/RemoveCommentLikeMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |

#### Example

## Query

```gql
mutation removeCommentLike($commentId: ID!) {
  removeCommentLike(commentId: $commentId) {
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
{"data": {"removeCommentLike": {"comment": Comment}}}
```
