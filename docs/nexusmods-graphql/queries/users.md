# users

## Description

Get a list of Users

## Response

Returns a [UserPage!](../types/UserPage.md)

## Arguments

| Name | Description |
| --- | --- |
| `filter` - [UsersSearchFilter](../types/UsersSearchFilter.md) | Filter which restricts results. |
| `sort` - [[UsersSearchSort!]](../types/UsersSearchSort.md) |  |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query users(
  $filter: UsersSearchFilter,
  $sort: [UsersSearchSort!],
  $offset: Int,
  $count: Int
) {
  users(
    filter: $filter,
    sort: $sort,
    offset: $offset,
    count: $count
  ) {
    facets {
      ...NodesFacetFragment
    }
    facetsData
    nodes {
      ...UserFragment
    }
    nodesCount
    nodesFacets {
      ...NodesFacetFragment
    }
    nodesFilter
    totalCount
  }
}
```

## Variables

```json
{
  "filter": UsersSearchFilter,
  "sort": [UsersSearchSort],
  "offset": 987,
  "count": 123
}
```

## Response

```json
{
  "data": {
    "users": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [User],
      "nodesCount": 987,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "xyz789",
      "totalCount": 123
    }
  }
}
```
