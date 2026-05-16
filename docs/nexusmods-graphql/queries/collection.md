# collection

## Description

Get a collection by slug

## Response

Returns a [Collection!](../types/Collection.md)

## Arguments

| Name | Description |
| --- | --- |
| `slug` - [String](../types/String.md) | Unique slug for a collection |
| `viewAdultContent` - [Boolean](../types/Boolean.md) | Overrides adult content in user preferences |
| `domainName` - [String](../types/String.md) | Specifies game domain. Will return a NOT_FOUND response if invalid domain is passed. |

#### Example

## Query

```gql
query collection(
  $slug: String,
  $viewAdultContent: Boolean,
  $domainName: String
) {
  collection(
    slug: $slug,
    viewAdultContent: $viewAdultContent,
    domainName: $domainName
  ) {
    adultContent
    allowUserMedia
    badges {
      ...BadgeFragment
    }
    bugReport {
      ...CollectionBugReportFragment
    }
    bugReports {
      ...CollectionBugReportConnectionFragment
    }
    category {
      ...CategoryFragment
    }
    collectionChangelogs {
      ...CollectionChangelogFragment
    }
    collectionSchemaId
    collectionStatus
    commentLink
    commentThread {
      ...CommentThreadFragment
    }
    createdAt
    currentRevision {
      ...CollectionRevisionFragment
    }
    description
    discardReason {
      ...CollectionDiscardReasonFragment
    }
    discardedAt
    draftRevisionNumber
    editors {
      ...UserFragment
    }
    endorsements
    firstPublishedAt
    forumTopic {
      ...ForumTopicFragment
    }
    game {
      ...GameFragment
    }
    gameId
    headerImage {
      ...CollectionImageFragment
    }
    id
    lastPublishedAt
    latestPublishedRevision {
      ...CollectionRevisionFragment
    }
    latestPublishedRevisionRating
    listedAt
    manuallyVerifyMedia
    media {
      ... on CollectionImage {
        ...CollectionImageFragment
      }
      ... on CollectionVideo {
        ...CollectionVideoFragment
      }
    }
    metadata {
      ...CollectionMetadataFragment
    }
    moderationJwt
    moderations {
      ...ModerationFragment
    }
    name
    overallRating
    overallRatingCount
    permissions {
      ...PermissionFragment
    }
    publicRevisions {
      ...PublicCollectionRevisionFragment
    }
    publishedAt
    recentRating
    recentRatingCount
    revisions {
      ...CollectionRevisionFragment
    }
    slug
    summary
    tags {
      ...TagFragment
    }
    tileImage {
      ...CollectionImageFragment
    }
    totalDownloads
    uniqueDownloads
    updatedAt
    user {
      ...UserFragment
    }
    userId
    viewerBlocked
    viewerHasIgnored
    viewerIsBlocked
  }
}
```

## Variables

```json
{
  "slug": "abc123",
  "viewAdultContent": false,
  "domainName": "xyz789"
}
```

## Response

```json
{
  "data": {
    "collection": {
      "adultContent": true,
      "allowUserMedia": true,
      "badges": [Badge],
      "bugReport": CollectionBugReport,
      "bugReports": CollectionBugReportConnection,
      "category": Category,
      "collectionChangelogs": [CollectionChangelog],
      "collectionSchemaId": 123,
      "collectionStatus": "listed",
      "commentLink": "xyz789",
      "commentThread": CommentThread,
      "createdAt": "2007-12-03T10:15:30Z",
      "currentRevision": CollectionRevision,
      "description": "abc123",
      "discardReason": CollectionDiscardReason,
      "discardedAt": "2007-12-03T10:15:30Z",
      "draftRevisionNumber": 987,
      "editors": [User],
      "endorsements": 987,
      "firstPublishedAt": "2007-12-03T10:15:30Z",
      "forumTopic": ForumTopic,
      "game": Game,
      "gameId": 123,
      "headerImage": CollectionImage,
      "id": 123,
      "lastPublishedAt": "2007-12-03T10:15:30Z",
      "latestPublishedRevision": CollectionRevision,
      "latestPublishedRevisionRating": "xyz789",
      "listedAt": "2007-12-03T10:15:30Z",
      "manuallyVerifyMedia": true,
      "media": [CollectionImage],
      "metadata": CollectionMetadata,
      "moderationJwt": "abc123",
      "moderations": [Moderation],
      "name": "xyz789",
      "overallRating": "xyz789",
      "overallRatingCount": 987,
      "permissions": [Permission],
      "publicRevisions": [PublicCollectionRevision],
      "publishedAt": "2007-12-03T10:15:30Z",
      "recentRating": "abc123",
      "recentRatingCount": 987,
      "revisions": [CollectionRevision],
      "slug": "xyz789",
      "summary": "xyz789",
      "tags": [Tag],
      "tileImage": CollectionImage,
      "totalDownloads": 987,
      "uniqueDownloads": 123,
      "updatedAt": "2007-12-03T10:15:30Z",
      "user": User,
      "userId": 987,
      "viewerBlocked": false,
      "viewerHasIgnored": true,
      "viewerIsBlocked": true
    }
  }
}
```
