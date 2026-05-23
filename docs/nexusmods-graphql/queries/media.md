# media

## Description

Get a list of media items (Images or Videos)

## Response

Returns a [MediaUnionPage!](../types/MediaUnionPage.md)

## Arguments

| Name | Description |
| --- | --- |
| `facets` - [MediaFacet](../types/MediaFacet.md) | Filter and aggregate by specified facets |
| `viewUserBlockedContent` - [Boolean](../types/Boolean.md) | View media items which you have blocked (e.g. via blocking authors) |
| `filter` - [MediaSearchFilter](../types/MediaSearchFilter.md) |  |
| `postFilter` - [MediaSearchFilter](../types/MediaSearchFilter.md) |  |
| `sort` - [[MediaSearchSort!]](../types/MediaSearchSort.md) |  |
| `offset` - [Int](../types/Int.md) |  |
| `count` - [Int](../types/Int.md) |  |

#### Example

## Query

```gql
query media(
  $facets: MediaFacet,
  $viewUserBlockedContent: Boolean,
  $filter: MediaSearchFilter,
  $postFilter: MediaSearchFilter,
  $sort: [MediaSearchSort!],
  $offset: Int,
  $count: Int
) {
  media(
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
      ... on Image {
        ...ImageFragment
      }
      ... on SupporterImage {
        ...SupporterImageFragment
      }
      ... on Video {
        ...VideoFragment
      }
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
  "facets": MediaFacet,
  "viewUserBlockedContent": true,
  "filter": MediaSearchFilter,
  "postFilter": MediaSearchFilter,
  "sort": [MediaSearchSort],
  "offset": 123,
  "count": 987
}
```

## Response

```json
{
  "data": {
    "media": {
      "facets": [NodesFacet],
      "facetsData": {},
      "nodes": [Image],
      "nodesCount": 987,
      "nodesFacets": [NodesFacet],
      "nodesFilter": "abc123",
      "totalCount": 987
    }
  }
}
```
