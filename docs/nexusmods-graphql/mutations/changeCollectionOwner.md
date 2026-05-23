# changeCollectionOwner

## Description

Changes a collection owner.

## Response

Returns a [ChangeCollectionOwnerPayload](../types/ChangeCollectionOwnerPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionId` - [ID!](../types/ID.md) | Collection ID |
| `ownerId` - [ID!](../types/ID.md) | New owner ID |

#### Example

## Query

```gql
mutation changeCollectionOwner(
  $collectionId: ID!,
  $ownerId: ID!
) {
  changeCollectionOwner(
    collectionId: $collectionId,
    ownerId: $ownerId
  ) {
    collection {
      ...CollectionFragment
    }
    success
  }
}
```

## Variables

```json
{"collectionId": "4", "ownerId": 4}
```

## Response

```json
{
  "data": {
    "changeCollectionOwner": {
      "collection": Collection,
      "success": true
    }
  }
}
```
