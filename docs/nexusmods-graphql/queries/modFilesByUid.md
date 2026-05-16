# modFilesByUid

## Description

Get a list of mod files by uid

## Response

Returns a [ModFilePage!](../types/ModFilePage.md)

## Arguments

| Name | Description |
| --- | --- |
| `uids` - [[ID!]!](../types/ID.md) | List of Mod File UIDs (Not IDs) for retreiving mods in bulk |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query modFilesByUid(
  $uids: [ID!]!,
  $offset: Int,
  $count: Int
) {
  modFilesByUid(
    uids: $uids,
    offset: $offset,
    count: $count
  ) {
    facets {
      ...NodesFacetFragment
    }
    facetsData
    nodes {
      ...ModFileFragment
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
{"uids": ["4"], "offset": 987, "count": 987}
```

## Response

```json
{
  "data": {
    "modFilesByUid": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [ModFile],
      "nodesCount": 987,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "abc123",
      "totalCount": 123
    }
  }
}
```
