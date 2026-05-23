# updateRevision

## Description

Updates a specific Collection Revision with new installation information and adult content flags

## Response

Returns an [UpdateRevisionMutationPayload](../types/UpdateRevisionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `revisionId` - [Int!](../types/Int.md) | ID of the collection revision to update |
| `installationInfo` - [String](../types/String.md) | User-provided installation information |
| `adultContent` - [Boolean](../types/Boolean.md) | Whether this revision has adult content |

#### Example

## Query

```gql
mutation updateRevision(
  $revisionId: Int!,
  $installationInfo: String,
  $adultContent: Boolean
) {
  updateRevision(
    revisionId: $revisionId,
    installationInfo: $installationInfo,
    adultContent: $adultContent
  ) {
    revisionId
    success
  }
}
```

## Variables

```json
{
  "revisionId": 987,
  "installationInfo": "abc123",
  "adultContent": true
}
```

## Response

```json
{"data": {"updateRevision": {"revisionId": 987, "success": true}}}
```
