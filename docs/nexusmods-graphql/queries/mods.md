# mods

## Description

Get a list of mods, with paging

## Response

Returns a [ModPage!](../types/ModPage.md)

## Arguments

| Name | Description |
| --- | --- |
| `viewUploaderHidden` - [Boolean](../types/Boolean.md) | View hidden mods that you are the uploader for (default: true) |
| `viewUserBlockedContent` - [Boolean](../types/Boolean.md) | View mods which you have blocked (e.g. via blocking tags or authors) |
| `facets` - [ModsFacet](../types/ModsFacet.md) | Filter and aggregate by specified facets |
| `filter` - [ModsFilter](../types/ModsFilter.md) |  |
| `postFilter` - [ModsFilter](../types/ModsFilter.md) |  |
| `sort` - [[ModsSort!]](../types/ModsSort.md) |  |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query mods(
  $viewUploaderHidden: Boolean,
  $viewUserBlockedContent: Boolean,
  $facets: ModsFacet,
  $filter: ModsFilter,
  $postFilter: ModsFilter,
  $sort: [ModsSort!],
  $offset: Int,
  $count: Int
) {
  mods(
    viewUploaderHidden: $viewUploaderHidden,
    viewUserBlockedContent: $viewUserBlockedContent,
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
      ...ModFragment
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
  "viewUploaderHidden": false,
  "viewUserBlockedContent": false,
  "facets": ModsFacet,
  "filter": ModsFilter,
  "postFilter": ModsFilter,
  "sort": [ModsSort],
  "offset": 987,
  "count": 987
}
```

## Response

```json
{
  "data": {
    "mods": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [Mod],
      "nodesCount": 123,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "xyz789",
      "totalCount": 123
    }
  }
}
```
