# removeVideoFromCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Removes a video from a Collection

## Response

Returns a [RemoveVideoFromCollectionMutationPayload](../types/RemoveVideoFromCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `videoId` - [ID!](../types/ID.md) | The database ID for this video. |
| `collectionId` - [ID!](../types/ID.md) | The database ID for this collection. |

#### Example

## Query

```gql
mutation removeVideoFromCollection(
  $videoId: ID!,
  $collectionId: ID!
) {
  removeVideoFromCollection(
    videoId: $videoId,
    collectionId: $collectionId
  ) {
    success
  }
}
```

## Variables

```json
{"videoId": 4, "collectionId": 4}
```

## Response

```json
{"data": {"removeVideoFromCollection": {"success": false}}}
```
