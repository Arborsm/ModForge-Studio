# createCollection

## Description

Create a new Collection. Must be passed the collection data from the manifest containing the manifest schema.

## Response

Returns a [CreateCollectionMutationPayload](../types/CreateCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionData` - [CollectionPayload!](../types/CollectionPayload.md) | Collection payload required for the collection creation. |
| `uuid` - [String!](../types/String.md) | UUID of the temporary collection file. Once the creation process is completed, the file will be moved to a permanent storage space. |

#### Example

## Query

```gql
mutation createCollection(
  $collectionData: CollectionPayload!,
  $uuid: String!
) {
  createCollection(
    collectionData: $collectionData,
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
    success
  }
}
```

## Variables

```json
{
  "collectionData": CollectionPayload,
  "uuid": "xyz789"
}
```

## Response

```json
{
  "data": {
    "createCollection": {
      "collection": Collection,
      "collectionId": 987,
      "revision": CollectionRevision,
      "revisionId": 123,
      "success": false
    }
  }
}
```
