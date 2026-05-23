# CollectionBugReportConnection

## Description

The connection type for CollectionBugReport.

## Fields

| Field Name | Description |
| --- | --- |
| `edges` - [[CollectionBugReportEdge]](../types/CollectionBugReportEdge.md) | A list of edges. |
| `nodes` - [[CollectionBugReport]](../types/CollectionBugReport.md) | A list of nodes. |
| `pageInfo` - [PageInfo!](../types/PageInfo.md) | Information to aid in pagination. |
| `totalCount` - [Int!](../types/Int.md) | Total # of objects returned from this Plural Query |

## Example

```json
{
  "edges": [CollectionBugReportEdge],
  "nodes": [CollectionBugReport],
  "pageInfo": PageInfo,
  "totalCount": 123
}
```
