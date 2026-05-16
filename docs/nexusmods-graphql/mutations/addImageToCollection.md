# addImageToCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Adds a new image to a collection

## Response

Returns an [AddImageToCollectionMutationPayload](../types/AddImageToCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `image` - [UploadImageInput!](../types/UploadImageInput.md) | Image to be added |
| `collectionId` - [ID!](../types/ID.md) | ID of collection to add image to |
| `collectionRevisionId` - [ID](../types/ID.md) | ID of collection revision to add image to |

#### Example

## Query

```gql
mutation addImageToCollection(
  $image: UploadImageInput!,
  $collectionId: ID!,
  $collectionRevisionId: ID
) {
  addImageToCollection(
    image: $image,
    collectionId: $collectionId,
    collectionRevisionId: $collectionRevisionId
  ) {
    image {
      ...CollectionImageFragment
    }
  }
}
```

## Variables

```json
{
  "image": UploadImageInput,
  "collectionId": "4",
  "collectionRevisionId": 4
}
```

## Response

```json
{
  "data": {
    "addImageToCollection": {"image": CollectionImage}
  }
}
```
