# collectionGames

## Description

Get a list of Games containing 1 or more collections with the collection counts

## Response

Returns [[Game!]](../types/Game.md)

#### Example

## Query

```gql
query collectionGames {
  collectionGames {
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

## Response

```json
{
  "data": {
    "collectionGames": [
      {
        "approvedAt": "2007-12-03T10:15:30Z",
        "artworkSchema": "V1",
        "availableTags": [Tag],
        "collectionCount": 987,
        "copyrightedName": false,
        "domainName": "abc123",
        "downloadCount": {},
        "forumUrl": "abc123",
        "genre": "abc123",
        "id": 987,
        "imageCount": 123,
        "mediaCount": 123,
        "modCount": 123,
        "name": "abc123",
        "specificTags": [Tag],
        "supporterImageCount": 123,
        "supportsVortex": true,
        "trendingPeriodDays": 123,
        "uniqueDownloadCount": {},
        "videoCount": 123
      }
    ]
  }
}
```
