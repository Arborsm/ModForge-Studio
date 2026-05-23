# searchComments

## Description

Search comments by filter and sort criteria

## Response

Returns a [CommentSearchResultConnection!](../types/CommentSearchResultConnection.md)

## Arguments

| Name | Description |
| --- | --- |
| `filter` - [CommentsSearchFilter](../types/CommentsSearchFilter.md) |  |
| `sort` - [[CommentsSearchSort!]](../types/CommentsSearchSort.md) |  |
| `after` - [String](../types/String.md) | Returns the elements in the list that come after the specified cursor. |
| `before` - [String](../types/String.md) | Returns the elements in the list that come before the specified cursor. |
| `first` - [Int](../types/Int.md) | Returns the first *n* elements from the list. |
| `last` - [Int](../types/Int.md) | Returns the last *n* elements from the list. |

#### Example

## Query

```gql
query searchComments(
  $filter: CommentsSearchFilter,
  $sort: [CommentsSearchSort!],
  $after: String,
  $before: String,
  $first: Int,
  $last: Int
) {
  searchComments(
    filter: $filter,
    sort: $sort,
    after: $after,
    before: $before,
    first: $first,
    last: $last
  ) {
    edges {
      ...CommentSearchResultEdgeFragment
    }
    nodes {
      ...CommentFragment
    }
    pageInfo {
      ...PageInfoFragment
    }
    timeTaken
    totalCount
  }
}
```

## Variables

```json
{
  "filter": CommentsSearchFilter,
  "sort": [CommentsSearchSort],
  "after": "xyz789",
  "before": "abc123",
  "first": 987,
  "last": 123
}
```

## Response

```json
{
  "data": {
    "searchComments": {
      "edges": [CommentSearchResultEdge],
      "nodes": [Comment],
      "pageInfo": PageInfo,
      "timeTaken": 123,
      "totalCount": 987
    }
  }
}
```
