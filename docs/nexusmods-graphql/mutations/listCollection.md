# listCollection

## Description

Sets a collection as `listed`. A collection can only be listed if there are published revisions. User must have the `collection:set_status` permission

## Response

Returns a [ListCollectionMutationPayload](../types/ListCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionId` - [Int!](../types/Int.md) | The database ID for this collection. |

#### Example

## Query

```gql
mutation listCollection($collectionId: Int!) {
  listCollection(collectionId: $collectionId) {
    success
  }
}
```

## Variables

```json
{"collectionId": 987}
```

## Response

```json
{"data": {"listCollection": {"success": false}}}
```
