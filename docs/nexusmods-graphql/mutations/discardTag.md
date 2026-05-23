# discardTag

## Description

Removed an existing tag. User must have the `tag:discard` permission

## Response

Returns a [DiscardTagMutationPayload](../types/DiscardTagMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | The database ID for this category. |

#### Example

## Query

```gql
mutation discardTag($id: ID!) {
  discardTag(id: $id) {
    success
  }
}
```

## Variables

```json
{"id": 4}
```

## Response

```json
{"data": {"discardTag": {"success": false}}}
```
