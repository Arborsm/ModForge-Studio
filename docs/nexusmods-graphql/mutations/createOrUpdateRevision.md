# createOrUpdateRevision

## Description

Creates a new Collection Revision, or updates an existing Collection Revision (if a draft already exists )

## Response

Returns a [CreateOrUpdateRevisionMutationPayload](../types/CreateOrUpdateRevisionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionData` - [CollectionPayload!](../types/CollectionPayload.md) | The data payload used to create a collection revision |
| `collectionId` - [Int!](../types/Int.md) | The database ID for this collection. |
| `uuid` - [String!](../types/String.md) | TODO |

#### Example

## Query

```gql
mutation createOrUpdateRevision(
  $collectionData: CollectionPayload!,
  $collectionId: Int!,
  $uuid: String!
) {
  createOrUpdateRevision(
    collectionData: $collectionData,
    collectionId: $collectionId,
    uuid: $uuid
  ) {
    collection {
      ...CollectionFragment
    }
    collectionId
    revision {
      ...CollectionRevisionFragment
    }
    revisionId
    revisionNumber
    success
  }
}
```

## Variables

```json
{
  "collectionData": CollectionPayload,
  "collectionId": 123,
  "uuid": "abc123"
}
```

## Response

```json
{
  "data": {
    "createOrUpdateRevision": {
      "collection": Collection,
      "collectionId": 987,
      "revision": CollectionRevision,
      "revisionId": 123,
      "revisionNumber": 987,
      "success": true
    }
  }
}
```
