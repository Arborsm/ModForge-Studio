# legacyMods

## Description

Get a list of mod using composite ids, with paging

## Response

Returns a [ModPage!](../types/ModPage.md)

## Arguments

| Name | Description |
| --- | --- |
| `ids` - [[CompositeIdInput!]!](../types/CompositeIdInput.md) | Mod ID (Legacy format) |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query legacyMods(
  $ids: [CompositeIdInput!]!,
  $offset: Int,
  $count: Int
) {
  legacyMods(
    ids: $ids,
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
{"ids": [CompositeIdInput], "offset": 123, "count": 123}
```

## Response

```json
{
  "data": {
    "legacyMods": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [Mod],
      "nodesCount": 123,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "abc123",
      "totalCount": 987
    }
  }
}
```
