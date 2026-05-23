# discardComment

## Description

Discards a comment.

## Response

Returns a [DiscardCommentMutationPayload](../types/DiscardCommentMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |

#### Example

## Query

```gql
mutation discardComment($commentId: ID!) {
  discardComment(commentId: $commentId) {
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
{"data": {"discardComment": {"comment": Comment}}}
```
