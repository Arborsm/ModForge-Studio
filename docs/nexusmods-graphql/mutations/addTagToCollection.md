# addTagToCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Adds a tag to a collection. User must have the `collection:add_tag` permission

## Response

Returns an [AddTagToCollectionMutationPayload](../types/AddTagToCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `tagIds` - [[ID!]!](../types/ID.md) | IDs of tags to add to the collection |
| `collectionId` - [Int!](../types/Int.md) | ID of collection to add tags to |

#### Example

## Query

```gql
mutation addTagToCollection(
  $tagIds: [ID!]!,
  $collectionId: Int!
) {
  addTagToCollection(
    tagIds: $tagIds,
    collectionId: $collectionId
  ) {
    success
  }
}
```

## Variables

```json
{"tagIds": [4], "collectionId": 123}
```

## Response

```json
{"data": {"addTagToCollection": {"success": false}}}
```
