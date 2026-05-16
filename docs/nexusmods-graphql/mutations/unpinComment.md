# unpinComment

## Description

Unpins a comment. User must have the `comment:unpin?` permission

## Response

Returns an [UnpinCommentMutationPayload](../types/UnpinCommentMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |

#### Example

## Query

```gql
mutation unpinComment($commentId: ID!) {
  unpinComment(commentId: $commentId) {
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
{"data": {"unpinComment": {"comment": Comment}}}
```
