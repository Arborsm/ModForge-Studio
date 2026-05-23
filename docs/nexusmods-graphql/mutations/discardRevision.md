# discardRevision

## Description

Discards a Collection Revision. Revision can only be discarded if it is a DRAFT or is not older than 24 hours and has no more than a 100 unique downloads.

## Response

Returns a [DiscardRevisionMutationPayload](../types/DiscardRevisionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionId` - [ID!](../types/ID.md) | Collection ID |
| `revisionNumber` - [Int!](../types/Int.md) | Revision number |
| `reason` - [String](../types/String.md) | Discard Reason |

#### Example

## Query

```gql
mutation discardRevision(
  $collectionId: ID!,
  $revisionNumber: Int!,
  $reason: String
) {
  discardRevision(
    collectionId: $collectionId,
    revisionNumber: $revisionNumber,
    reason: $reason
  ) {
    success
  }
}
```

## Variables

```json
{
  "collectionId": "4",
  "revisionNumber": 987,
  "reason": "abc123"
}
```

## Response

```json
{"data": {"discardRevision": {"success": true}}}
```
