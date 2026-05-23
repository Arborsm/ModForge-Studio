# game

## Description

Get a Game by ID or domain name

## Response

Returns a [Game](../types/Game.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID](../types/ID.md) | Game ID to retrieve game for |
| `domainName` - [String](../types/String.md) | Game domain name to retrieve game for |

#### Example

## Query

```gql
query game(
  $id: ID,
  $domainName: String
) {
  game(
    id: $id,
    domainName: $domainName
  ) {
    approvedAt
    artworkSchema
    availableTags {
      ...TagFragment
    }
    collectionCount
    copyrightedName
    domainName
    downloadCount
    forumUrl
    genre
    id
    imageCount
    mediaCount
    modCount
    name
    specificTags {
      ...TagFragment
    }
    supporterImageCount
    supportsVortex
    trendingPeriodDays
    uniqueDownloadCount
    videoCount
  }
}
```

## Variables

```json
{"id": 4, "domainName": "xyz789"}
```

## Response

```json
{
  "data": {
    "game": {
      "approvedAt": "2007-12-03T10:15:30Z",
      "artworkSchema": "V1",
      "availableTags": [Tag],
      "collectionCount": 123,
      "copyrightedName": true,
      "domainName": "xyz789",
      "downloadCount": {},
      "forumUrl": "abc123",
      "genre": "abc123",
      "id": 987,
      "imageCount": 123,
      "mediaCount": 123,
      "modCount": 987,
      "name": "xyz789",
      "specificTags": [Tag],
      "supporterImageCount": 987,
      "supportsVortex": false,
      "trendingPeriodDays": 987,
      "uniqueDownloadCount": {},
      "videoCount": 123
    }
  }
}
```
