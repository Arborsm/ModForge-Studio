# updateComment

## Description

Updates a comment.

## Response

Returns an [UpdateCommentMutationPayload](../types/UpdateCommentMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentId` - [ID!](../types/ID.md) | The database ID for this comment. |
| `body` - [String!](../types/String.md) | The comment body. |
| `attachmentIds` - [[ID!]](../types/ID.md) | An array of attachment_ids of uploaded files to attach to the new revision.Include all the previous ids or they won't be present on the updated revision.If you don't send an array the previous revisions attachments will be maintained |

#### Example

## Query

```gql
mutation updateComment(
  $commentId: ID!,
  $body: String!,
  $attachmentIds: [ID!]
) {
  updateComment(
    commentId: $commentId,
    body: $body,
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
  "commentId": "4",
  "body": "xyz789",
  "attachmentIds": [4]
}
```

## Response

```json
{"data": {"updateComment": {"comment": Comment}}}
```
