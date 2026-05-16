# CollectionRevision

## Description

An immutable revision of a collection

## Fields

| Field Name | Description |
| --- | --- |
| `adultContent` - [Boolean!](../types/Boolean.md) | If true, this revision could contain adult content and needs to be treated accordingly |
| `assetsSizeBytes` - [BigInt!](../types/BigInt.md) | The size of bundled assets within the revision in bytes |
| `badges` - [[Badge!]!](../types/Badge.md) | Badges associated with this collection revision |
| `collection` - [Collection!](../types/Collection.md) | Gets the collection that this revision belongs to. This will ignore adult_content flags. |
| `collectionChangelog` - [CollectionChangelog](../types/CollectionChangelog.md) | A changelog attached to a collection revision |
| `collectionId` - [Int!](../types/Int.md) | The database ID for this collection. |
| `collectionSchema` - [CollectionSchema!](../types/CollectionSchema.md) | A model of the expected structure for a collection manifest |
| `collectionSchemaId` - [Int!](../types/Int.md) | The database ID for this collection schema. |
| `contentPreviewLink` - [String!](../types/String.md) | The link to generate a content preview for the revision |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this revision was first created. |
| `discardedAt` - [DateTime](../types/DateTime.md) | Time of when this revision was discarded. |
| `downloadLink` - [String!](../types/String.md) | The download link for the revision |
| `externalResources` - [[ExternalResource!]!](../types/ExternalResource.md) | Array of external resources referenced by this revision |
| `fileSize` - [BigInt!](../types/BigInt.md) | The total size of the revision in bytes Use "totalSize" instead. |
| `gameVersions` - [[GameVersion!]](../types/GameVersion.md) | A list of game versions for which the revision has been confirmed to work (usually the game version for which the revision was created) |
| `id` - [Int!](../types/Int.md) | The database ID for this revision. |
| `installationInfo` - [String](../types/String.md) | Additional information about the installation process of this revision |
| `latest` - [Boolean!](../types/Boolean.md) | Will be true if the revision is the latest published for the collection |
| `metadata` - [CollectionRevisionMetadata](../types/CollectionRevisionMetadata.md) | Metadata information about a collection revision |
| `modAuthors` - [UserConnection!](../types/UserConnection.md) | List of authors of the mods included in this revision ordered (DESC) by the number of mods in the revision. |
| Arguments `after` - [String](../types/String.md) Returns the elements in the list that come after the specified cursor. `before` - [String](../types/String.md) Returns the elements in the list that come before the specified cursor. `first` - [Int](../types/Int.md) Returns the first *n* elements from the list. `last` - [Int](../types/Int.md) Returns the last *n* elements from the list. |  |
| `modCount` - [Int!](../types/Int.md) | The number of mods and external resources in this collection |
| `modFiles` - [[CollectionRevisionMod!]!](../types/CollectionRevisionMod.md) | A list of mod files included in the revision |
| `overallRating` - [String](../types/String.md) | An average taken from all ratings for this revision |
| `overallRatingCount` - [Int](../types/Int.md) | A count of all ratings for this revision |
| `rating` - [AverageRating!](../types/AverageRating.md) | Average rating for a single revision and total number of votes Deprecated in favour of 'overallRating' and 'overallRatingCount' |
| `retractionReason` - [RetractionReason](../types/RetractionReason.md) | A reason for which a revision has been retracted. |
| `revision` - [Int!](../types/Int.md) | The revision number Use "revisionNumber" instead. |
| `revisionNumber` - [Int!](../types/Int.md) | The revision number |
| `revisionStatus` - [String!](../types/String.md) | The status of this revision. Possible values are 'draft', 'published' or 'retracted' |
| `status` - [String!](../types/String.md) | The status of this revision. Possible values are 'draft', 'published' or 'retracted' |
| `totalDownloads` - [Int!](../types/Int.md) | The total number of times the revision has been downloaded |
| `totalSize` - [BigInt!](../types/BigInt.md) | The total size of the revision in bytes |
| `uniqueDownloads` - [Int!](../types/Int.md) | The number of unique users who have download the revision |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this revision was last updated. |

## Example

```json
{
  "adultContent": true,
  "assetsSizeBytes": {},
  "badges": [Badge],
  "collection": Collection,
  "collectionChangelog": CollectionChangelog,
  "collectionId": 987,
  "collectionSchema": CollectionSchema,
  "collectionSchemaId": 123,
  "contentPreviewLink": "abc123",
  "createdAt": "2007-12-03T10:15:30Z",
  "discardedAt": "2007-12-03T10:15:30Z",
  "downloadLink": "xyz789",
  "externalResources": [ExternalResource],
  "fileSize": {},
  "gameVersions": [GameVersion],
  "id": 123,
  "installationInfo": "xyz789",
  "latest": true,
  "metadata": CollectionRevisionMetadata,
  "modAuthors": UserConnection,
  "modCount": 123,
  "modFiles": [CollectionRevisionMod],
  "overallRating": "xyz789",
  "overallRatingCount": 123,
  "rating": AverageRating,
  "retractionReason": RetractionReason,
  "revision": 123,
  "revisionNumber": 123,
  "revisionStatus": "abc123",
  "status": "abc123",
  "totalDownloads": 987,
  "totalSize": {},
  "uniqueDownloads": 123,
  "updatedAt": "2007-12-03T10:15:30Z"
}
```
