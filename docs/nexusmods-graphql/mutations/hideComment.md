# hideComment

## Description

Hides a comment.

## Response

Returns a [HideCommentMutationPayload](../types/HideCommentMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |
| `reason` - [String!](../types/String.md) | The reason for hiding the comment. |
| `internalReason` - [String](../types/String.md) | The internal reason for hiding the comment. Only visible to admins and moderators. |

#### Example

## Query

```gql
mutation hideComment(
  $commentId: ID!,
  $reason: String!,
  $internalReason: String
) {
  hideComment(
    commentId: $commentId,
    reason: $reason,
    internalReason: $internalReason
  ) {
    comment {
      ...CommentFragment
    }
  }
}
```

## Variables

```json
{
  "commentId": 4,
  "reason": "xyz789",
  "internalReason": "abc123"
}
```

## Response

```json
{"data": {"hideComment": {"comment": Comment}}}
```
