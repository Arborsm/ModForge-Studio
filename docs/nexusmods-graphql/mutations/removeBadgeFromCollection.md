# removeBadgeFromCollection

## Description

Removes a badge from a collection.

## Response

Returns a [RemoveBadgeFromCollectionMutationPayload](../types/RemoveBadgeFromCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `badgeId` - [ID!](../types/ID.md) | ID of badge to remove from the collection |
| `collectionId` - [Int!](../types/Int.md) | ID of collection to have badge removed from |

#### Example

## Query

```gql
mutation removeBadgeFromCollection(
  $badgeId: ID!,
  $collectionId: Int!
) {
  removeBadgeFromCollection(
    badgeId: $badgeId,
    collectionId: $collectionId
  ) {
    success
  }
}
```

## Variables

```json
{"badgeId": "4", "collectionId": 123}
```

## Response

```json
{"data": {"removeBadgeFromCollection": {"success": true}}}
```
