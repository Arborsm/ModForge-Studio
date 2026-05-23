# openCollectionBugReport

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Re-opens a previously closed bug report. Can be called by the report or the collection curator

## Response

Returns an [OpenCollectionBugReportMutationPayload](../types/OpenCollectionBugReportMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `bugReportId` - [ID!](../types/ID.md) | ID of the collection bug report to open |

#### Example

## Query

```gql
mutation openCollectionBugReport($bugReportId: ID!) {
  openCollectionBugReport(bugReportId: $bugReportId) {
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
    "openCollectionBugReport": {
      "collectionBugReport": CollectionBugReport
    }
  }
}
```
