# CsamDeletionRequestCDNSummary

## Description

A summary of the results from a CSAM Deletion Request processed by a CDN

## Fields

| Input Field | Description |
| --- | --- |
| `total` - [Int!](../types/Int.md) | Total number of URLs processed by the CDN |
| `succeeded` - [Int!](../types/Int.md) | Number of URLs successfully |
| `failed` - [Int!](../types/Int.md) | Number of URLs that failed to be deleted by the CDN |

## Example

```json
{"total": 987, "succeeded": 987, "failed": 123}
```
