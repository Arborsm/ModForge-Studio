# unpublishRevision

                   Legacy Field - this will be removed in a future update.

## Description

Retracts a Collection Revision. This keeps the revision listed and downloadable but marks it as a revision that should not be used anymore.

## Response

Returns a [RetractRevisionMutationPayload](../types/RetractRevisionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `revisionId` - [ID!](../types/ID.md) | Collection Revision ID |
| `reason` - [String!](../types/String.md) | Retraction Reason |

#### Example

## Query

```gql
mutation unpublishRevision(
  $revisionId: ID!,
  $reason: String!
) {
  unpublishRevision(
    revisionId: $revisionId,
    reason: $reason
  ) {
    success
  }
}
```

## Variables

```json
{
  "revisionId": "4",
  "reason": "xyz789"
}
```

## Response

```json
{"data": {"unpublishRevision": {"success": false}}}
```
