# updateCollectionBugReport

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Updates a bug report on a collection

## Response

Returns an [UpdateCollectionBugReportMutationPayload](../types/UpdateCollectionBugReportMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `bugReportId` - [ID!](../types/ID.md) | ID of the collection bug report to update |
| `collectionRevisionNumber` - [Int](../types/Int.md) | Number of collection revision to update bug report on |
| `title` - [String!](../types/String.md) | Title of the new bug report |
| `description` - [String](../types/String.md) | Description of the new bug report |
| `attachmentIds` - [[ID!]](../types/ID.md) | Array of attachment ids |

#### Example

## Query

```gql
mutation updateCollectionBugReport(
  $bugReportId: ID!,
  $collectionRevisionNumber: Int,
  $title: String!,
  $description: String,
  $attachmentIds: [ID!]
) {
  updateCollectionBugReport(
    bugReportId: $bugReportId,
    collectionRevisionNumber: $collectionRevisionNumber,
    title: $title,
    description: $description,
    attachmentIds: $attachmentIds
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
  "bugReportId": 4,
  "collectionRevisionNumber": 987,
  "title": "abc123",
  "description": "xyz789",
  "attachmentIds": [4]
}
```

## Response

```json
{
  "data": {
    "updateCollectionBugReport": {
      "collectionBugReport": CollectionBugReport
    }
  }
}
```
