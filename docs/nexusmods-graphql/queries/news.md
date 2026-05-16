# news

## Description

retrieves all news articles.

## Response

Returns a [NewsPage!](../types/NewsPage.md)

## Arguments

| Name | Description |
| --- | --- |
| `newsCategory` - [NewsCategoryEnum](../types/NewsCategoryEnum.md) | Filters the News to a specific news category. |
| `gameId` - [Int](../types/Int.md) | Filters the News to a specific game. |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query news(
  $newsCategory: NewsCategoryEnum,
  $gameId: Int,
  $offset: Int,
  $count: Int
) {
  news(
    newsCategory: $newsCategory,
    gameId: $gameId,
    offset: $offset,
    count: $count
  ) {
    facets {
      ...NodesFacetFragment
    }
    facetsData
    nodes {
      ...NewsFragment
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
{"newsCategory": "SITE_NEWS", "gameId": 987, "offset": 987, "count": 987}
```

## Response

```json
{
  "data": {
    "news": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [News],
      "nodesCount": 987,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "abc123",
      "totalCount": 123
    }
  }
}
```
