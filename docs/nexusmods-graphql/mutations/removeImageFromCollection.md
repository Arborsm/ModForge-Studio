# removeImageFromCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Removes an image from a Collection

## Response

Returns a [RemoveImageFromCollectionMutationPayload](../types/RemoveImageFromCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `imageId` - [ID!](../types/ID.md) | The database ID for this image. |
| `collectionId` - [ID!](../types/ID.md) | The database ID for this collection. |

#### Example

## Query

```gql
mutation removeImageFromCollection(
  $imageId: ID!,
  $collectionId: ID!
) {
  removeImageFromCollection(
    imageId: $imageId,
    collectionId: $collectionId
  ) {
    success
  }
}
```

## Variables

```json
{"imageId": 4, "collectionId": "4"}
```

## Response

```json
{"data": {"removeImageFromCollection": {"success": true}}}
```
