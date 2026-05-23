# legacyModsByDomain

## Description

Get a list of mods by domain_name and id, with paging

## Response

Returns a [ModPage!](../types/ModPage.md)

## Arguments

| Name | Description |
| --- | --- |
| `ids` - [[CompositeDomainWithIdInput!]!](../types/CompositeDomainWithIdInput.md) | Get mod by legacy ID format |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query legacyModsByDomain(
  $ids: [CompositeDomainWithIdInput!]!,
  $offset: Int,
  $count: Int
) {
  legacyModsByDomain(
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
{
  "ids": [CompositeDomainWithIdInput],
  "offset": 123,
  "count": 123
}
```

## Response

```json
{
  "data": {
    "legacyModsByDomain": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [Mod],
      "nodesCount": 123,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "xyz789",
      "totalCount": 987
    }
  }
}
```
