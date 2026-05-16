# modsByUid

## Description

Get a list of mods by uid, with paging

## Response

Returns a [ModPage!](../types/ModPage.md)

## Arguments

| Name | Description |
| --- | --- |
| `uids` - [[ID!]!](../types/ID.md) | List of Mod UIDs (Not IDs) for retreiving mods in bulk |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query modsByUid(
  $uids: [ID!]!,
  $offset: Int,
  $count: Int
) {
  modsByUid(
    uids: $uids,
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
{"uids": [4], "offset": 987, "count": 123}
```

## Response

```json
{
  "data": {
    "modsByUid": {
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
