# discardCollection

## Description

Discards an entire Collection and its associated entities

## Response

Returns a [DiscardCollectionMutationPayload](../types/DiscardCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionId` - [ID!](../types/ID.md) | Collection ID |
| `reason` - [String!](../types/String.md) | Discard reason |

#### Example

## Query

```gql
mutation discardCollection(
  $collectionId: ID!,
  $reason: String!
) {
  discardCollection(
    collectionId: $collectionId,
    reason: $reason
  ) {
    success
  }
}
```

## Variables

```json
{
  "collectionId": "4",
  "reason": "xyz789"
}
```

## Response

```json
{"data": {"discardCollection": {"success": false}}}
```
