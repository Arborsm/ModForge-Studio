# moderationWarnings

## Description

Get a list of moderation warnings

## Response

Returns a [ModerationWarningConnection](../types/ModerationWarningConnection.md)

## Arguments

| Name | Description |
| --- | --- |
| `category` - [[ModerationWarningCategoryEnum!]](../types/ModerationWarningCategoryEnum.md) | Filter by a specific category |
| `after` - [String](../types/String.md) | Returns the elements in the list that come after the specified cursor. |
| `before` - [String](../types/String.md) | Returns the elements in the list that come before the specified cursor. |
| `first` - [Int](../types/Int.md) | Returns the first *n* elements from the list. |
| `last` - [Int](../types/Int.md) | Returns the last *n* elements from the list. |

#### Example

## Query

```gql
query moderationWarnings(
  $category: [ModerationWarningCategoryEnum!],
  $after: String,
  $before: String,
  $first: Int,
  $last: Int
) {
  moderationWarnings(
    category: $category,
    after: $after,
    before: $before,
    first: $first,
    last: $last
  ) {
    edges {
      ...ModerationWarningEdgeFragment
    }
    nodes {
      ...ModerationWarningFragment
    }
    pageInfo {
      ...PageInfoFragment
    }
    totalCount
  }
}
```

## Variables

```json
{
  "category": ["INFORMAL_WARNING"],
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
    "moderationWarnings": {
      "edges": [ModerationWarningEdge],
      "nodes": [ModerationWarning],
      "pageInfo": PageInfo,
      "totalCount": 987
    }
  }
}
```
