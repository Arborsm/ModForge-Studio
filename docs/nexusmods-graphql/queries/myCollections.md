# myCollections

                   Deprecated- Use collectionsV2.

## Description

Get a list of collections that the current user has access to view

## Response

Returns a [CollectionPage!](../types/CollectionPage.md)

## Arguments

| Name | Description |
| --- | --- |
| `facets` - [CollectionsFacet](../types/CollectionsFacet.md) | Filter and aggregate by specified facets |
| `sortBy` - [String](../types/String.md) | Alters the sorting column used for this query |
| `sortDirection` - [String](../types/String.md) | Alters the sorting direction used for this query |
| `viewAdultContent` - [Boolean](../types/Boolean.md) | Overrides adult content in user preferences |
| `viewUnlisted` - [Boolean](../types/Boolean.md) | Shows unlisted collections (permission required) |
| `viewUnderModeration` - [Boolean](../types/Boolean.md) | Shows moderated collections (permission required) |
| `filter` - [CollectionsFilter](../types/CollectionsFilter.md) | Filter which restricts results and facets. |
| `postFilter` - [CollectionsFilter](../types/CollectionsFilter.md) | Filter which restricts results but not facets. |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query myCollections(
  $facets: CollectionsFacet,
  $sortBy: String,
  $sortDirection: String,
  $viewAdultContent: Boolean,
  $viewUnlisted: Boolean,
  $viewUnderModeration: Boolean,
  $filter: CollectionsFilter,
  $postFilter: CollectionsFilter,
  $offset: Int,
  $count: Int
) {
  myCollections(
    facets: $facets,
    sortBy: $sortBy,
    sortDirection: $sortDirection,
    viewAdultContent: $viewAdultContent,
    viewUnlisted: $viewUnlisted,
    viewUnderModeration: $viewUnderModeration,
    filter: $filter,
    postFilter: $postFilter,
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
  "sortBy": "xyz789",
  "sortDirection": "abc123",
  "viewAdultContent": true,
  "viewUnlisted": false,
  "viewUnderModeration": true,
  "filter": CollectionsFilter,
  "postFilter": CollectionsFilter,
  "offset": 123,
  "count": 987
}
```

## Response

```json
{
  "data": {
    "myCollections": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [Collection],
      "nodesCount": 123,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "abc123",
      "totalCount": 123
    }
  }
}
```
