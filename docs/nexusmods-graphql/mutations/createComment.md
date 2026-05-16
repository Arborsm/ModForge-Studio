# createComment

## Description

Creates a comment.

## Response

Returns a [CreateCommentMutationPayload](../types/CreateCommentMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentThreadId` - [ID!](../types/ID.md) | The database ID for this comment thread. |
| `body` - [String!](../types/String.md) | The comment body. |
| `replyToId` - [ID](../types/ID.md) | An optional comment ID to reply to. |
| `attachmentIds` - [[ID!]](../types/ID.md) | An optional array of attachment_ids from uploaded files to attach. |

#### Example

## Query

```gql
mutation createComment(
  $commentThreadId: ID!,
  $body: String!,
  $replyToId: ID,
  $attachmentIds: [ID!]
) {
  createComment(
    commentThreadId: $commentThreadId,
    body: $body,
    replyToId: $replyToId,
    attachmentIds: $attachmentIds
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
  "commentThreadId": "4",
  "body": "abc123",
  "replyToId": 4,
  "attachmentIds": [4]
}
```

## Response

```json
{"data": {"createComment": {"comment": Comment}}}
```
