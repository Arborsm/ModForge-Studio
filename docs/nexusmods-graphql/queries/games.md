# games

## Description

Get a list of Games

## Response

Returns a [GamePage!](../types/GamePage.md)

## Arguments

| Name | Description |
| --- | --- |
| `facets` - [GamesFacet](../types/GamesFacet.md) | Filter and aggregate by specified facets |
| `filter` - [GamesSearchFilter](../types/GamesSearchFilter.md) | Filter which restricts results and facets. |
| `postFilter` - [GamesSearchFilter](../types/GamesSearchFilter.md) | Filter which restricts results but not facets. |
| `sort` - [[GamesSearchSort!]](../types/GamesSearchSort.md) |  |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query games(
  $facets: GamesFacet,
  $filter: GamesSearchFilter,
  $postFilter: GamesSearchFilter,
  $sort: [GamesSearchSort!],
  $offset: Int,
  $count: Int
) {
  games(
    facets: $facets,
    filter: $filter,
    postFilter: $postFilter,
    sort: $sort,
    offset: $offset,
    count: $count
  ) {
    facets {
      ...NodesFacetFragment
    }
    facetsData
    nodes {
      ...GameFragment
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
  "facets": GamesFacet,
  "filter": GamesSearchFilter,
  "postFilter": GamesSearchFilter,
  "sort": [GamesSearchSort],
  "offset": 987,
  "count": 123
}
```

## Response

```json
{
  "data": {
    "games": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [Game],
      "nodesCount": 123,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "xyz789",
      "totalCount": 123
    }
  }
}
```
