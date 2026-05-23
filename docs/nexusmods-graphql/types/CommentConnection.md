# CommentConnection

## Description

The connection type for Comment.

## Fields

| Field Name | Description |
| --- | --- |
| `edges` - [[CommentEdge]](../types/CommentEdge.md) | A list of edges. |
| `nodes` - [[Comment]](../types/Comment.md) | A list of nodes. |
| `pageInfo` - [PageInfo!](../types/PageInfo.md) | Information to aid in pagination. |
| `totalCount` - [Int!](../types/Int.md) | Total # of objects returned from this Plural Query |

## Example

```json
{
  "edges": [CommentEdge],
  "nodes": [Comment],
  "pageInfo": PageInfo,
  "totalCount": 123
}
```
