# removeTileImageFromCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Removes a tile image from a Collection

## Response

Returns a [RemoveTileImageFromCollectionMutationPayload](../types/RemoveTileImageFromCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionId` - [ID!](../types/ID.md) | The database ID for this collection. |

#### Example

## Query

```gql
mutation removeTileImageFromCollection($collectionId: ID!) {
  removeTileImageFromCollection(collectionId: $collectionId) {
    success
  }
}
```

## Variables

```json
{"collectionId": 4}
```

## Response

```json
{"data": {"removeTileImageFromCollection": {"success": true}}}
```
