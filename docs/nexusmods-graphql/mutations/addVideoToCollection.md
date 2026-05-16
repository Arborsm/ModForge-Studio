# addVideoToCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Adds a new image to a collection

## Response

Returns an [AddVideoToCollectionMutationPayload](../types/AddVideoToCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `video` - [UploadVideoInput!](../types/UploadVideoInput.md) | Video to be added |
| `collectionId` - [ID!](../types/ID.md) | ID of collection to add video to |
| `collectionRevisionId` - [ID](../types/ID.md) | ID of collection revision to add video to |

#### Example

## Query

```gql
mutation addVideoToCollection(
  $video: UploadVideoInput!,
  $collectionId: ID!,
  $collectionRevisionId: ID
) {
  addVideoToCollection(
    video: $video,
    collectionId: $collectionId,
    collectionRevisionId: $collectionRevisionId
  ) {
    video {
      ...CollectionVideoFragment
    }
  }
}
```

## Variables

```json
{
  "video": UploadVideoInput,
  "collectionId": "4",
  "collectionRevisionId": 4
}
```

## Response

```json
{
  "data": {
    "addVideoToCollection": {"video": CollectionVideo}
  }
}
```
