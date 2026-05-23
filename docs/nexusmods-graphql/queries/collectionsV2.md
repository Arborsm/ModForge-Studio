# collectionsV2

## Description

Get a list of collections

## Response

Returns a [CollectionPage!](../types/CollectionPage.md)

## Arguments

| Name | Description |
| --- | --- |
| `facets` - [CollectionsFacet](../types/CollectionsFacet.md) | Filter and aggregate by specified facets. |
| `viewUserBlockedContent` - [Boolean](../types/Boolean.md) | View collections which you have blocked (e.g. via blocking authors) |
| `filter` - [CollectionsSearchFilter](../types/CollectionsSearchFilter.md) | Filter which restricts results and facets. |
| `postFilter` - [CollectionsSearchFilter](../types/CollectionsSearchFilter.md) | Filter which restricts results but not facets. |
| `sort` - [[CollectionsSearchSort!]](../types/CollectionsSearchSort.md) |  |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query collectionsV2(
  $facets: CollectionsFacet,
  $viewUserBlockedContent: Boolean,
  $filter: CollectionsSearchFilter,
  $postFilter: CollectionsSearchFilter,
  $sort: [CollectionsSearchSort!],
  $offset: Int,
  $count: Int
) {
  collectionsV2(
    facets: $facets,
    viewUserBlockedContent: $viewUserBlockedContent,
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
      ...CollectionFragment
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
  "facets": CollectionsFacet,
  "viewUserBlockedContent": true,
  "filter": CollectionsSearchFilter,
  "postFilter": CollectionsSearchFilter,
  "sort": [CollectionsSearchSort],
  "offset": 987,
  "count": 123
}
```

## Response

```json
{
  "data": {
    "collectionsV2": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [Collection],
      "nodesCount": 123,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "xyz789",
      "totalCount": 123
    }
  }
}
```
