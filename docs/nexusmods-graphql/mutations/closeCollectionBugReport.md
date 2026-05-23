# closeCollectionBugReport

## Description

Marks a collection bug report as closed. Can be called by the reporter or the collection curator, but only the curator can specify a closure_reason

## Response

Returns a [CloseCollectionBugReportMutationPayload](../types/CloseCollectionBugReportMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `bugReportId` - [ID!](../types/ID.md) | ID of the collection bug report to close |
| `closureReason` - [BugReportClosureReason!](../types/BugReportClosureReason.md) | The status of the bug report, e.g. Resolved, Won't fix |

#### Example

## Query

```gql
mutation closeCollectionBugReport(
  $bugReportId: ID!,
  $closureReason: BugReportClosureReason!
) {
  closeCollectionBugReport(
    bugReportId: $bugReportId,
    closureReason: $closureReason
  ) {
    collectionBugReport {
      ...CollectionBugReportFragment
    }
  }
}
```

## Variables

```json
{"bugReportId": 4, "closureReason": "none"}
```

## Response

```json
{
  "data": {
    "closeCollectionBugReport": {
      "collectionBugReport": CollectionBugReport
    }
  }
}
```
