# CommentsSearchFilter

## Description

Filter fields specific to the comments search query.

## Fields

| Input Field | Description |
| --- | --- |
| `filter` - [[CommentsSearchFilter!]](../types/CommentsSearchFilter.md) | Nested filters. |
| `op` - [FilterLogicalOperator](../types/FilterLogicalOperator.md) | Logical operator for clauses. |
| `query` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Full text search query. |
| `threadId` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | The ID of the comment thread to search within. |

## Example

```json
{
  "filter": [CommentsSearchFilter],
  "op": "AND",
  "query": [BaseFilterValue],
  "threadId": [BaseFilterValue]
}
```
