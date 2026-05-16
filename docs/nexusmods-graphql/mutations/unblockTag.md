# unblockTag

## Description

Unblocks a specific tag for the current user.

## Response

Returns an [UnblockTagMutationPayload](../types/UnblockTagMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `tagId` - [ID!](../types/ID.md) | The database ID for this tag. |

#### Example

## Query

```gql
mutation unblockTag($tagId: ID!) {
  unblockTag(tagId: $tagId) {
    success
  }
}
```

## Variables

```json
{"tagId": 4}
```

## Response

```json
{"data": {"unblockTag": {"success": true}}}
```
