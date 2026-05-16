# publishRevision

## Description

Publishes a Collection Revision

## Response

Returns a [PublishRevisionMutationPayload](../types/PublishRevisionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `revisionId` - [ID!](../types/ID.md) | Collection Revision ID |
| `collectionStatus` - [CollectionStatus](../types/CollectionStatus.md) | Allows a curator to set the collection status when this revision is published |
| `hasAdultResources` - [Boolean](../types/Boolean.md) | Does this revision contain adult content resources |

#### Example

## Query

```gql
mutation publishRevision(
  $revisionId: ID!,
  $collectionStatus: CollectionStatus,
  $hasAdultResources: Boolean
) {
  publishRevision(
    revisionId: $revisionId,
    collectionStatus: $collectionStatus,
    hasAdultResources: $hasAdultResources
  ) {
    success
  }
}
```

## Variables

```json
{"revisionId": 4, "collectionStatus": "listed", "hasAdultResources": true}
```

## Response

```json
{"data": {"publishRevision": {"success": false}}}
```
