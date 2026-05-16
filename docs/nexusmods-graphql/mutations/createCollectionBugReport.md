# createCollectionBugReport

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Creates a new bug report for a collection

## Response

Returns a [CreateCollectionBugReportMutationPayload](../types/CreateCollectionBugReportMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionId` - [ID!](../types/ID.md) | ID of collection to add bug report to |
| `collectionRevisionNumber` - [Int!](../types/Int.md) | Number of collection revision to add bug report to |
| `title` - [String!](../types/String.md) | Title of the new bug report |
| `description` - [String](../types/String.md) | Description for the new bug report |
| `attachmentIds` - [[ID!]](../types/ID.md) | Array of attachment ids of uploaded files |

#### Example

## Query

```gql
mutation createCollectionBugReport(
  $collectionId: ID!,
  $collectionRevisionNumber: Int!,
  $title: String!,
  $description: String,
  $attachmentIds: [ID!]
) {
  createCollectionBugReport(
    collectionId: $collectionId,
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
  "collectionId": "4",
  "collectionRevisionNumber": 123,
  "title": "xyz789",
  "description": "xyz789",
  "attachmentIds": ["4"]
}
```

## Response

```json
{
  "data": {
    "createCollectionBugReport": {
      "collectionBugReport": CollectionBugReport
    }
  }
}
```
