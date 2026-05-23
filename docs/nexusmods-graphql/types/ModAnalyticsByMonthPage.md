# ModAnalyticsByMonthPage

## Description

A page of mod analytics grouped by month

## Fields

| Field Name | Description |
| --- | --- |
| `nodes` - [[ModAnalyticsByMonthNode!]!](../types/ModAnalyticsByMonthNode.md) | A list of mod analytics by month nodes |
| `pageInfo` - [OffsetBasedPageInfo!](../types/OffsetBasedPageInfo.md) | Information about the page |
| `totalDownloads` - [BigInt!](../types/BigInt.md) | The total number of downloads for mods with which this user is affiliated |
| `totalUniqueDownloads` - [BigInt!](../types/BigInt.md) | The total number of unique downloads for mods with which this user is affiliated |

## Example

```json
{
  "nodes": [ModAnalyticsByMonthNode],
  "pageInfo": OffsetBasedPageInfo,
  "totalDownloads": {},
  "totalUniqueDownloads": {}
}
```
