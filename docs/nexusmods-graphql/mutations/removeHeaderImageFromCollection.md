# removeHeaderImageFromCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Removes a header image from a Collection

## Response

Returns a [RemoveHeaderImageFromCollectionMutationPayload](../types/RemoveHeaderImageFromCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionId` - [ID!](../types/ID.md) | The database ID for this collection. |

#### Example

## Query

```gql
mutation removeHeaderImageFromCollection($collectionId: ID!) {
  removeHeaderImageFromCollection(collectionId: $collectionId) {
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
{"data": {"removeHeaderImageFromCollection": {"success": true}}}
```
