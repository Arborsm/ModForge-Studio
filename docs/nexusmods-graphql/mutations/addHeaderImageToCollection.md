# addHeaderImageToCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Adds a new header image to a collection

## Response

Returns an [AddHeaderImageToCollectionMutationPayload](../types/AddHeaderImageToCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `image` - [UploadImageInput!](../types/UploadImageInput.md) | Image to be added |
| `collectionId` - [ID!](../types/ID.md) | ID of collection to add image to |

#### Example

## Query

```gql
mutation addHeaderImageToCollection(
  $image: UploadImageInput!,
  $collectionId: ID!
) {
  addHeaderImageToCollection(
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
    "addHeaderImageToCollection": {
      "image": CollectionImage
    }
  }
}
```
