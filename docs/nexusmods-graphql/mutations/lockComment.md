# lockComment

## Description

Locks a comment.

## Response

Returns a [LockCommentMutationPayload](../types/LockCommentMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |

#### Example

## Query

```gql
mutation lockComment($commentId: ID!) {
  lockComment(commentId: $commentId) {
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
{"data": {"lockComment": {"comment": Comment}}}
```
