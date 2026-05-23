# collectionRevision

## Description

Get a revision by collection slug and revision number

## Response

Returns a [CollectionRevision!](../types/CollectionRevision.md)

## Arguments

| Name | Description |
| --- | --- |
| `slug` - [String](../types/String.md) | Unique slug for a collection |
| `revision` - [Int](../types/Int.md) | Revision number for collection. If null, will return the latest published revision for this collection |
| `viewAdultContent` - [Boolean](../types/Boolean.md) | Overrides adult content in user preferences |
| `domainName` - [String](../types/String.md) | Specifies game domain. Will return a NOT_FOUND response if invalid domain is passed. |

#### Example

## Query

```gql
query collectionRevision(
  $slug: String,
  $revision: Int,
  $viewAdultContent: Boolean,
  $domainName: String
) {
  collectionRevision(
    slug: $slug,
    revision: $revision,
    viewAdultContent: $viewAdultContent,
    domainName: $domainName
  ) {
    adultContent
    assetsSizeBytes
    badges {
      ...BadgeFragment
    }
    collection {
      ...CollectionFragment
    }
    collectionChangelog {
      ...CollectionChangelogFragment
    }
    collectionId
    collectionSchema {
      ...CollectionSchemaFragment
    }
    collectionSchemaId
    contentPreviewLink
    createdAt
    discardedAt
    downloadLink
    externalResources {
      ...ExternalResourceFragment
    }
    fileSize
    gameVersions {
      ...GameVersionFragment
    }
    id
    installationInfo
    latest
    metadata {
      ...CollectionRevisionMetadataFragment
    }
    modAuthors {
      ...UserConnectionFragment
    }
    modCount
    modFiles {
      ...CollectionRevisionModFragment
    }
    overallRating
    overallRatingCount
    rating {
      ...AverageRatingFragment
    }
    retractionReason {
      ...RetractionReasonFragment
    }
    revision
    revisionNumber
    revisionStatus
    status
    totalDownloads
    totalSize
    uniqueDownloads
    updatedAt
  }
}
```

## Variables

```json
{
  "slug": "xyz789",
  "revision": 987,
  "viewAdultContent": false,
  "domainName": "xyz789"
}
```

## Response

```json
{
  "data": {
    "collectionRevision": {
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
      "installationInfo": "abc123",
      "latest": true,
      "metadata": CollectionRevisionMetadata,
      "modAuthors": UserConnection,
      "modCount": 987,
      "modFiles": [CollectionRevisionMod],
      "overallRating": "abc123",
      "overallRatingCount": 987,
      "rating": AverageRating,
      "retractionReason": RetractionReason,
      "revision": 987,
      "revisionNumber": 987,
      "revisionStatus": "xyz789",
      "status": "xyz789",
      "totalDownloads": 123,
      "totalSize": {},
      "uniqueDownloads": 123,
      "updatedAt": "2007-12-03T10:15:30Z"
    }
  }
}
```
