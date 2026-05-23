# modFileContents

## Response

Returns a [ModFileContentPage!](../types/ModFileContentPage.md)

## Arguments

| Name | Description |
| --- | --- |
| `filter` - [ModFileContentSearchFilter](../types/ModFileContentSearchFilter.md) |  |
| `sort` - [[ModFileContentSearchSort!]](../types/ModFileContentSearchSort.md) |  |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query modFileContents(
  $filter: ModFileContentSearchFilter,
  $sort: [ModFileContentSearchSort!],
  $offset: Int,
  $count: Int
) {
  modFileContents(
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
      ...ModFileContentFragment
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
  "filter": ModFileContentSearchFilter,
  "sort": [ModFileContentSearchSort],
  "offset": 987,
  "count": 123
}
```

## Response

```json
{
  "data": {
    "modFileContents": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [ModFileContent],
      "nodesCount": 123,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "abc123",
      "totalCount": 987
    }
  }
}
```
