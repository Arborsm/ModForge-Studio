# CsamDeletionRequestCDNResult

## Description

A CSAM Deletion Request status update from a CDN

## Fields

| Input Field | Description |
| --- | --- |
| `hostname` - [String!](../types/String.md) | CDN hostname |
| `processedAt` - [DateTime!](../types/DateTime.md) | Timestamp when the CDN processed the request |
| `summary` - [CsamDeletionRequestCDNSummary!](../types/CsamDeletionRequestCDNSummary.md) | A summary of the results from a CSAM Deletion Request processed by a CDN |
| `results` - [[CsamDeletionRequestCDNUrlResult!]!](../types/CsamDeletionRequestCDNUrlResult.md) | List of individual URL deletion results |

## Example

```json
{
  "hostname": "xyz789",
  "processedAt": "2007-12-03T10:15:30Z",
  "summary": CsamDeletionRequestCDNSummary,
  "results": [CsamDeletionRequestCDNUrlResult]
}
```
