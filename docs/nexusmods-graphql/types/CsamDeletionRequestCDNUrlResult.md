# CsamDeletionRequestCDNUrlResult

## Description

A CSAM Deletion Request status update for a url from a CDN

## Fields

| Input Field | Description |
| --- | --- |
| `url` - [String!](../types/String.md) | The URL that was processed by the CDN |
| `success` - [Boolean!](../types/Boolean.md) | Whether the URL was successfully processed |
| `message` - [String!](../types/String.md) | A message from the CDN about the processing of the URL |
| `filePaths` - [[CsamDeletionRequestCDNFilePathResult!]!](../types/CsamDeletionRequestCDNFilePathResult.md) | List of file paths that were processed for this URL |
| `foundCount` - [Int!](../types/Int.md) | Number of file paths found for this URL |
| `deletedCount` - [Int!](../types/Int.md) | Number of file paths successfully deleted for this URL |
| `failedCount` - [Int!](../types/Int.md) | Number of file paths that failed to be deleted for this URL |

## Example

```json
{
  "url": "abc123",
  "success": false,
  "message": "xyz789",
  "filePaths": [CsamDeletionRequestCDNFilePathResult],
  "foundCount": 987,
  "deletedCount": 987,
  "failedCount": 123
}
```
