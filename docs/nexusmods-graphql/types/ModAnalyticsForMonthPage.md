# ModAnalyticsForMonthPage

## Description

A page of mod analytics grouped by month

## Fields

| Field Name | Description |
| --- | --- |
| `nodes` - [[ModAnalyticsForMonthNode!]!](../types/ModAnalyticsForMonthNode.md) | A list of mod analytics for month nodes |
| `pageInfo` - [OffsetBasedPageInfo!](../types/OffsetBasedPageInfo.md) | Information about the current page |
| `totalDownloads` - [BigInt!](../types/BigInt.md) | The total number of downloads for the month |
| `totalUniqueDownloads` - [BigInt!](../types/BigInt.md) | The total number of unique downloads for the month |

## Example

```json
{
  "nodes": [ModAnalyticsForMonthNode],
  "pageInfo": OffsetBasedPageInfo,
  "totalDownloads": {},
  "totalUniqueDownloads": {}
}
```
