# addTileImageToCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Adds a new tile image to a collection

## Response

Returns an [AddTileImageToCollectionMutationPayload](../types/AddTileImageToCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `image` - [UploadImageInput!](../types/UploadImageInput.md) | Image to be added |
| `collectionId` - [ID!](../types/ID.md) | ID of collection to add image to |

#### Example

## Query

```gql
mutation addTileImageToCollection(
  $image: UploadImageInput!,
  $collectionId: ID!
) {
  addTileImageToCollection(
    image: $image,
    collectionId: $collectionId
  ) {
    image {
      ...CollectionImageFragment
    }
  }
}
```

## Variables

```json
{"image": UploadImageInput, "collectionId": 4}
```

## Response

```json
{
  "data": {
    "addTileImageToCollection": {"image": CollectionImage}
  }
}
```
