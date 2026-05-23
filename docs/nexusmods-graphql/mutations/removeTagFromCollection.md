# removeTagFromCollection

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Removes tags from a collection

## Response

Returns a [RemoveTagFromCollectionMutationPayload](../types/RemoveTagFromCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `tagIds` - [[ID!]!](../types/ID.md) | Array containing Tag IDs |
| `collectionId` - [ID!](../types/ID.md) | Collection ID |

#### Example

## Query

```gql
mutation removeTagFromCollection(
  $tagIds: [ID!]!,
  $collectionId: ID!
) {
  removeTagFromCollection(
    tagIds: $tagIds,
    collectionId: $collectionId
  ) {
    success
  }
}
```

## Variables

```json
{
  "tagIds": ["4"],
  "collectionId": "4"
}
```

## Response

```json
{"data": {"removeTagFromCollection": {"success": true}}}
```
