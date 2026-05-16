# PublicCollectionRevision

## Description

A public collection revision type. If you need to access more fields, use CollectionRevisionType instead.

## Fields

| Field Name | Description |
| --- | --- |
| `collectionChangelog` - [PublicCollectionChangelog](../types/PublicCollectionChangelog.md) | A changelog attached to a collection revision |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this revision was first created. |
| `discardedAt` - [DateTime](../types/DateTime.md) | Time of when this revision was discarded. |
| `id` - [Int!](../types/Int.md) | The database ID for this revision. |
| `overallRating` - [String](../types/String.md) | An average taken from all ratings for this revision |
| `overallRatingCount` - [Int](../types/Int.md) | A count of all ratings for this revision |
| `rating` - [AverageRating!](../types/AverageRating.md) | Average rating for a single revision and total number of votes Deprecated in favour of 'overallRating' and 'overallRatingCount' |
| `revision` - [Int!](../types/Int.md) | The revision number Use `revision_number` instead. |
| `revisionNumber` - [Int!](../types/Int.md) | The revision number |
| `revisionStatus` - [String!](../types/String.md) | The status of this revision. Possible values are 'draft', 'published' or 'retracted' |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this revision was last updated. |

## Example

```json
{
  "collectionChangelog": PublicCollectionChangelog,
  "createdAt": "2007-12-03T10:15:30Z",
  "discardedAt": "2007-12-03T10:15:30Z",
  "id": 987,
  "overallRating": "xyz789",
  "overallRatingCount": 123,
  "rating": AverageRating,
  "revision": 123,
  "revisionNumber": 987,
  "revisionStatus": "xyz789",
  "updatedAt": "2007-12-03T10:15:30Z"
}
```
