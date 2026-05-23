# modifyImageForCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Updates an image on a collection

## Response

Returns a [ModifyImageForCollectionMutationPayload](../types/ModifyImageForCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `image` - [UpdateImageInput!](../types/UpdateImageInput.md) | Image to be updated |
| `collectionId` - [ID!](../types/ID.md) | ID of collection to update image on |

#### Example

## Query

```gql
mutation modifyImageForCollection(
  $image: UpdateImageInput!,
  $collectionId: ID!
) {
  modifyImageForCollection(
    image: $image,
    collectionId: $collectionId
  ) {
    image {
      ...CollectionImageFragment
    }
    updated
  }
}
```

## Variables

```json
{"image": UpdateImageInput, "collectionId": 4}
```

## Response

```json
{
  "data": {
    "modifyImageForCollection": {
      "image": CollectionImage,
      "updated": false
    }
  }
}
```
