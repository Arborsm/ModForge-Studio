# clearCollectionBugReportModerationStatus

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Clears the status of an existing bug report on a collection

## Response

Returns a [ClearCollectionBugReportModerationStatusMutationPayload](../types/ClearCollectionBugReportModerationStatusMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `bugReportId` - [ID!](../types/ID.md) | ID of the collection bug report to clear status of |

#### Example

## Query

```gql
mutation clearCollectionBugReportModerationStatus($bugReportId: ID!) {
  clearCollectionBugReportModerationStatus(bugReportId: $bugReportId) {
    collectionBugReport {
      ...CollectionBugReportFragment
    }
  }
}
```

## Variables

```json
{"bugReportId": "4"}
```

## Response

```json
{
  "data": {
    "clearCollectionBugReportModerationStatus": {
      "collectionBugReport": CollectionBugReport
    }
  }
}
```
