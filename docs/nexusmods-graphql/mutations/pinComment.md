# pinComment

## Description

Pins a comment. User must have the `comment:pin?` permission

## Response

Returns a [PinCommentMutationPayload](../types/PinCommentMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |

#### Example

## Query

```gql
mutation pinComment($commentId: ID!) {
  pinComment(commentId: $commentId) {
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
{"data": {"pinComment": {"comment": Comment}}}
```
