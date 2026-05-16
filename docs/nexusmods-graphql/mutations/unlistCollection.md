# unlistCollection

## Description

Unlists a Collection Revision from the public Nexus Mods pages.

## Response

Returns an [UnlistCollectionMutationPayload](../types/UnlistCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionId` - [ID!](../types/ID.md) | Collection ID |

#### Example

## Query

```gql
mutation unlistCollection($collectionId: ID!) {
  unlistCollection(collectionId: $collectionId) {
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
{"data": {"unlistCollection": {"success": false}}}
```
