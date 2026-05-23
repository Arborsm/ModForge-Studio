# mod

## Description

Get a single mod

## Response

Returns a [Mod!](../types/Mod.md)

## Arguments

| Name | Description |
| --- | --- |
| `modId` - [ID!](../types/ID.md) | Mod ID for retrieving a mod |
| `gameId` - [ID!](../types/ID.md) | Game ID for retrieving a mod |

#### Example

## Query

```gql
query mod(
  $modId: ID!,
  $gameId: ID!
) {
  mod(
    modId: $modId,
    gameId: $gameId
  ) {
    adult
    adultContent
    author
    category
    createdAt
    description
    directDownloadEnabled
    downloads
    endorsements
    fileSize
    game {
      ...GameFragment
    }
    gameId
    id
    isBlockedFromEarningDp
    legacyModRequirementsEnabled
    mirrors {
      ...ModMirrorFragment
    }
    modCategory {
      ...ModCategoryFragment
    }
    modId
    modRequirements {
      ...ModRequirementsFragment
    }
    name
    pictureUrl
    status
    summary
    supportsVortex
    tags {
      ...LegacyTagFragment
    }
    thumbnailBlurredUrl
    thumbnailLargeBlurredUrl
    thumbnailLargeUrl
    thumbnailUrl
    uid
    updatedAt
    uploader {
      ...UserFragment
    }
    version
    viewerBlocked
    viewerDownloaded
    viewerEndorsed
    viewerIsBlocked
    viewerTracked
    viewerUpdateAvailable
  }
}
```

## Variables

```json
{"modId": "4", "gameId": 4}
```

## Response

```json
{
  "data": {
    "mod": {
      "adult": false,
      "adultContent": false,
      "author": "abc123",
      "category": "abc123",
      "createdAt": "2007-12-03T10:15:30Z",
      "description": "abc123",
      "directDownloadEnabled": false,
      "downloads": 123,
      "endorsements": 987,
      "fileSize": 987,
      "game": Game,
      "gameId": 123,
      "id": 4,
      "isBlockedFromEarningDp": true,
      "legacyModRequirementsEnabled": false,
      "mirrors": [ModMirror],
      "modCategory": ModCategory,
      "modId": 987,
      "modRequirements": ModRequirements,
      "name": "abc123",
      "pictureUrl": "abc123",
      "status": "abc123",
      "summary": "abc123",
      "supportsVortex": true,
      "tags": [LegacyTag],
      "thumbnailBlurredUrl": "abc123",
      "thumbnailLargeBlurredUrl": "abc123",
      "thumbnailLargeUrl": "xyz789",
      "thumbnailUrl": "abc123",
      "uid": "4",
      "updatedAt": "2007-12-03T10:15:30Z",
      "uploader": User,
      "version": "xyz789",
      "viewerBlocked": false,
      "viewerDownloaded": "2007-12-03T10:15:30Z",
      "viewerEndorsed": true,
      "viewerIsBlocked": true,
      "viewerTracked": false,
      "viewerUpdateAvailable": false
    }
  }
}
```
