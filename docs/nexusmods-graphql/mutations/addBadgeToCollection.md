# addBadgeToCollection

## Description

Adds a badge to a collection.

## Response

Returns an [AddBadgeToCollectionMutationPayload](../types/AddBadgeToCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `badgeId` - [ID!](../types/ID.md) | ID of badge to apply to the collection |
| `collectionId` - [Int!](../types/Int.md) | ID of collection to have badge applied to |

#### Example

## Query

```gql
mutation addBadgeToCollection(
  $badgeId: ID!,
  $collectionId: Int!
) {
  addBadgeToCollection(
    badgeId: $badgeId,
    collectionId: $collectionId
  ) {
    success
  }
}
```

## Variables

```json
{"badgeId": 4, "collectionId": 123}
```

## Response

```json
{"data": {"addBadgeToCollection": {"success": true}}}
```
