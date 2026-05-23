# likeComment

## Description

Likes a comment.

## Response

Returns a [LikeCommentMutationPayload](../types/LikeCommentMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |

#### Example

## Query

```gql
mutation likeComment($commentId: ID!) {
  likeComment(commentId: $commentId) {
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
{"data": {"likeComment": {"comment": Comment}}}
```
