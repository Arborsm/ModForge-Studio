# CommentSearchResultConnection

## Description

The connection type for Comment.

## Fields

| Field Name | Description |
| --- | --- |
| `edges` - [[CommentSearchResultEdge]](../types/CommentSearchResultEdge.md) | A list of edges. |
| `nodes` - [[Comment]](../types/Comment.md) | A list of nodes. |
| `pageInfo` - [PageInfo!](../types/PageInfo.md) | Information to aid in pagination. |
| `timeTaken` - [Int!](../types/Int.md) | Time taken to complete the search in milliseconds. |
| `totalCount` - [Int!](../types/Int.md) | Total number of results. |

## Example

```json
{
  "edges": [CommentSearchResultEdge],
  "nodes": [Comment],
  "pageInfo": PageInfo,
  "timeTaken": 987,
  "totalCount": 987
}
```
