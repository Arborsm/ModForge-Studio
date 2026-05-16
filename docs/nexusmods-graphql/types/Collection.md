# Collection

## Description

A curated collection of mods

## Fields

| Field Name | Description |
| --- | --- |
| `adultContent` - [Boolean](../types/Boolean.md) | Indicates whether the collection contains adult content Adult content is now indicated at the revision level |
| `allowUserMedia` - [Boolean](../types/Boolean.md) | Whether to allow non-curator users to upload media |
| `badges` - [[Badge!]](../types/Badge.md) | Badges on the collection and latest published revision |
| `bugReport` - [CollectionBugReport!](../types/CollectionBugReport.md) | Fetch a bug report for this collection by its id |
| Arguments `bugReportId` - [ID!](../types/ID.md) The database ID for this bug report. |  |
| `bugReports` - [CollectionBugReportConnection!](../types/CollectionBugReportConnection.md) | A list of bug reports raised for the collection |
| Arguments `status` - [BugReportStatus!](../types/BugReportStatus.md) Filter bug reports by status. Possible opens are "Open" or "Closed" `sortBy` - [String](../types/String.md) Column for sorting bug reports `sortDirection` - [String](../types/String.md) Direction for sorting bug reports `after` - [String](../types/String.md) Returns the elements in the list that come after the specified cursor. `before` - [String](../types/String.md) Returns the elements in the list that come before the specified cursor. `first` - [Int](../types/Int.md) Returns the first *n* elements from the list. `last` - [Int](../types/Int.md) Returns the last *n* elements from the list. |  |
| `category` - [Category](../types/Category.md) | A category into which related entities may fall |
| `collectionChangelogs` - [[CollectionChangelog!]](../types/CollectionChangelog.md) | A list of changelogs created for the revisions of this collection |
| `collectionSchemaId` - [Int](../types/Int.md) | The schema ID for the latest published revision of this collection (1 = Vortex, 2 = Wabbajack) |
| `collectionStatus` - [CollectionStatus](../types/CollectionStatus.md) | Available collection statuses |
| `commentLink` - [String](../types/String.md) | A link to the forum thread containing comments |
| `commentThread` - [CommentThread!](../types/CommentThread.md) | The comment thread for this collection. |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this collection was first created. |
| `currentRevision` - [CollectionRevision!](../types/CollectionRevision.md) | Latest published revision Deprecated in favour of using a 'collectionRevision' query |
| Arguments `revision` - [Int](../types/Int.md) Revision number |  |
| `description` - [String!](../types/String.md) | A description of the collection in Markdown format |
| `discardReason` - [CollectionDiscardReason](../types/CollectionDiscardReason.md) | A reason why the collection was discarded |
| `discardedAt` - [DateTime](../types/DateTime.md) | Time of when this collection was discarded. |
| `draftRevisionNumber` - [Int](../types/Int.md) | If there is a draft revision in this collection, this will return the revisionNumber for that revision. If there are no draft revisions, this will simply be null |
| `editors` - [[User!]](../types/User.md) | Users who have permission to edit this collection. |
| `endorsements` - [Int!](../types/Int.md) | The number of endorsements given to the collection |
| `firstPublishedAt` - [DateTime](../types/DateTime.md) | Time of when the first of this collection's revisions was first published |
| `forumTopic` - [ForumTopic](../types/ForumTopic.md) | The forum topic created to hold comments for this collection Use `commentThread` instead. |
| `game` - [Game!](../types/Game.md) | The game for which the collection was created |
| `gameId` - [Int!](../types/Int.md) | The id of the game for which the collection was created |
| `headerImage` - [CollectionImage](../types/CollectionImage.md) | The image used as the background of the header on the collection's page |
| `id` - [Int!](../types/Int.md) | The database ID for this collection. |
| `lastPublishedAt` - [DateTime](../types/DateTime.md) | Time of when one of this collection's revisions was last published |
| `latestPublishedRevision` - [CollectionRevision](../types/CollectionRevision.md) | The latest published revision for this collection. This will be null for collections with no published revisions |
| `latestPublishedRevisionRating` - [String](../types/String.md) | Rating of the latest published revision |
| `listedAt` - [DateTime](../types/DateTime.md) | Time of when this collection was first listed |
| `manuallyVerifyMedia` - [Boolean](../types/Boolean.md) | Whether uploaded media requires verification before being displayed |
| `media` - [[CollectionMediaUnion!]!](../types/CollectionMediaUnion.md) | A list of media uploaded to the collection, including images and videos |
| `metadata` - [CollectionMetadata](../types/CollectionMetadata.md) | Metadata information about a collection |
| `moderationJwt` - [String!](../types/String.md) | JWT token for submitting moderation reports |
| `moderations` - [[Moderation!]](../types/Moderation.md) | A list of moderation actions taken against this collection |
| `name` - [String!](../types/String.md) | The collection name |
| `overallRating` - [String](../types/String.md) | An average taken from all revision ratings |
| `overallRatingCount` - [Int](../types/Int.md) | Total number of ratings given across all revisions |
| `permissions` - [[Permission!]](../types/Permission.md) | The list of permissions granted to the requesting user against this collection. |
| `publicRevisions` - [[PublicCollectionRevision!]](../types/PublicCollectionRevision.md) | Returns "sanitized" collection revisions. Safe to use with discarded revisions. |
| `publishedAt` - [DateTime](../types/DateTime.md) | Time of when one of this collection's revisions was last published Use `last_published_at` instead. |
| `recentRating` - [String](../types/String.md) | A 30 day average of all revision ratings |
| `recentRatingCount` - [Int](../types/Int.md) | Total number of ratings given in the last 30 days |
| `revisions` - [[CollectionRevision!]!](../types/CollectionRevision.md) | A list of revisions for the collection |
| `slug` - [String!](../types/String.md) | A random string of characters identifying the collection. This is the identifier used in a collection page url. |
| `summary` - [String!](../types/String.md) | A brief summary of the collection |
| `tags` - [[Tag!]!](../types/Tag.md) | A list of tags attached to the collection, used to surface the collection in search results |
| `tileImage` - [CollectionImage](../types/CollectionImage.md) | The image used to identify the collection in list views |
| `totalDownloads` - [Int!](../types/Int.md) | The total number of times this collection has been downloaded |
| `uniqueDownloads` - [Int!](../types/Int.md) | The total number of unique users who have downloaded this collection |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this collection was last updated. |
| `user` - [User!](../types/User.md) | The curating user |
| `userId` - [Int!](../types/Int.md) | The id of the collection curator |
| `viewerBlocked` - [Boolean!](../types/Boolean.md) | Whether the viewer has ignored the content owner. Use `viewerHasIgnored` instead. |
| `viewerHasIgnored` - [Boolean!](../types/Boolean.md) | Whether the viewer has ignored the content owner. |
| `viewerIsBlocked` - [Boolean](../types/Boolean.md) | Whether the viewer is blocked by the content owner. |

## Example

```json
{
  "adultContent": true,
  "allowUserMedia": true,
  "badges": [Badge],
  "bugReport": CollectionBugReport,
  "bugReports": CollectionBugReportConnection,
  "category": Category,
  "collectionChangelogs": [CollectionChangelog],
  "collectionSchemaId": 987,
  "collectionStatus": "listed",
  "commentLink": "xyz789",
  "commentThread": CommentThread,
  "createdAt": "2007-12-03T10:15:30Z",
  "currentRevision": CollectionRevision,
  "description": "xyz789",
  "discardReason": CollectionDiscardReason,
  "discardedAt": "2007-12-03T10:15:30Z",
  "draftRevisionNumber": 123,
  "editors": [User],
  "endorsements": 987,
  "firstPublishedAt": "2007-12-03T10:15:30Z",
  "forumTopic": ForumTopic,
  "game": Game,
  "gameId": 987,
  "headerImage": CollectionImage,
  "id": 987,
  "lastPublishedAt": "2007-12-03T10:15:30Z",
  "latestPublishedRevision": CollectionRevision,
  "latestPublishedRevisionRating": "xyz789",
  "listedAt": "2007-12-03T10:15:30Z",
  "manuallyVerifyMedia": false,
  "media": [CollectionImage],
  "metadata": CollectionMetadata,
  "moderationJwt": "xyz789",
  "moderations": [Moderation],
  "name": "abc123",
  "overallRating": "xyz789",
  "overallRatingCount": 987,
  "permissions": [Permission],
  "publicRevisions": [PublicCollectionRevision],
  "publishedAt": "2007-12-03T10:15:30Z",
  "recentRating": "xyz789",
  "recentRatingCount": 123,
  "revisions": [CollectionRevision],
  "slug": "xyz789",
  "summary": "abc123",
  "tags": [Tag],
  "tileImage": CollectionImage,
  "totalDownloads": 987,
  "uniqueDownloads": 987,
  "updatedAt": "2007-12-03T10:15:30Z",
  "user": User,
  "userId": 123,
  "viewerBlocked": true,
  "viewerHasIgnored": true,
  "viewerIsBlocked": true
}
```
