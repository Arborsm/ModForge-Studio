# hideCollectionBugReport

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Hides a bug report on a collection from public view

## Response

Returns a [HideCollectionBugReportMutationPayload](../types/HideCollectionBugReportMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `bugReportId` - [ID!](../types/ID.md) | ID of the collection bug report to hide |
| `reason` - [String](../types/String.md) | Public reason to hide the bug report |
| `internalReason` - [String](../types/String.md) | Company internal reason to hide the bug report |

#### Example

## Query

```gql
mutation hideCollectionBugReport(
  $bugReportId: ID!,
  $reason: String,
  $internalReason: String
) {
  hideCollectionBugReport(
    bugReportId: $bugReportId,
    reason: $reason,
    internalReason: $internalReason
  ) {
    collectionBugReport {
      ...CollectionBugReportFragment
    }
  }
}
```

## Variables

```json
{
  "bugReportId": "4",
  "reason": "xyz789",
  "internalReason": "xyz789"
}
```

## Response

```json
{
  "data": {
    "hideCollectionBugReport": {
      "collectionBugReport": CollectionBugReport
    }
  }
}
```
