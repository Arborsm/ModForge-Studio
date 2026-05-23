# reorderPinnedComments

## Description

Reorders pinned comments. User must have the `comment:pin?` permission

## Response

Returns a [ReorderPinnedCommentsMutationPayload](../types/ReorderPinnedCommentsMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `commentIds` - [[ID!]!](../types/ID.md) | The database ID for this comment. |

#### Example

## Query

```gql
mutation reorderPinnedComments($commentIds: [ID!]!) {
  reorderPinnedComments(commentIds: $commentIds) {
    comments {
      ...CommentFragment
    }
  }
}
```

## Variables

```json
{"commentIds": ["4"]}
```

## Response

```json
{
  "data": {
    "reorderPinnedComments": {"comments": [Comment]}
  }
}
```
