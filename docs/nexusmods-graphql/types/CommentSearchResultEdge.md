# CommentSearchResultEdge

## Description

A comment search result edge.

## Fields

| Field Name | Description |
| --- | --- |
| `cursor` - [String!](../types/String.md) | A cursor for use in pagination. |
| `node` - [Comment](../types/Comment.md) | The item at the end of the edge. |
| `relevance` - [Float!](../types/Float.md) | The relevancy score of the result. Higher scores mean more relevance. |

## Example

```json
{
  "cursor": "xyz789",
  "node": Comment,
  "relevance": 987.65
}
```
