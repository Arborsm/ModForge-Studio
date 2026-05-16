# blockTag

## Description

Blocks a specific tag for the current user.

## Response

Returns a [BlockTagMutationPayload](../types/BlockTagMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `tagId` - [ID!](../types/ID.md) | The database ID for this tag. |

#### Example

## Query

```gql
mutation blockTag($tagId: ID!) {
  blockTag(tagId: $tagId) {
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
{"data": {"blockTag": {"success": false}}}
```
