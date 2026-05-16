# favouriteGames

## Description

Gets a user's favourite games

## Response

Returns [[Game!]](../types/Game.md)

#### Example

## Query

```gql
query favouriteGames {
  favouriteGames {
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
    "favouriteGames": [
      {
        "approvedAt": "2007-12-03T10:15:30Z",
        "artworkSchema": "V1",
        "availableTags": [Tag],
        "collectionCount": 987,
        "copyrightedName": false,
        "domainName": "xyz789",
        "downloadCount": {},
        "forumUrl": "xyz789",
        "genre": "xyz789",
        "id": 123,
        "imageCount": 123,
        "mediaCount": 123,
        "modCount": 123,
        "name": "abc123",
        "specificTags": [Tag],
        "supporterImageCount": 987,
        "supportsVortex": false,
        "trendingPeriodDays": 123,
        "uniqueDownloadCount": {},
        "videoCount": 987
      }
    ]
  }
}
```
