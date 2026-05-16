# CollectionsSearchFilter

## Description

Common filter fields specific to the Collections query

## Fields

| Input Field | Description |
| --- | --- |
| `filter` - [[CollectionsSearchFilter!]](../types/CollectionsSearchFilter.md) | Nested filters. |
| `op` - [FilterLogicalOperator](../types/FilterLogicalOperator.md) | Logical operator for clauses. |
| `userId` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Author ID |
| `name` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Collection Name |
| `collectionRating` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Collection Rating |
| `recentRating` - [[FloatFilterValue!]](../types/FloatFilterValue.md) | A 30 day average of all revision ratings |
| `recentRatingCount` - [[IntFilterValue!]](../types/IntFilterValue.md) | Total number of ratings given in the last 30 days |
| `createdAt` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Created at date |
| `updatedAt` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Updated at date |
| `collectionStatus` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Collection Status |
| `gameId` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Game ID |
| `gameDomain` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Game domain name E.g. skyrim |
| `gameName` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Game name E.g. Skyrim |
| `categoryId` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Category ID |
| `categoryName` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Category name |
| `gameVersion` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Filter collections for specific game versions |
| `modUid` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | The mod unique identifier. |
| `tag` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | The tag name, exact match. |
| `adultContent` - [[BooleanFilterValue!]](../types/BooleanFilterValue.md) | Whether to show adult content in search results |
| `hasDraftRevision` - [[BooleanFilterValue!]](../types/BooleanFilterValue.md) | Only show collections that have a draft revision |
| `hasPublishedRevision` - [[BooleanFilterValue!]](../types/BooleanFilterValue.md) | Only show collections that have a published revision |
| `schemaId` - [[IntFilterValue!]](../types/IntFilterValue.md) | Filter by collection schema ID (1 = Vortex, 2 = Wabbajack) |
| `badges` - [[ExistsFilter!]](../types/ExistsFilter.md) | Filter collections that have (or do not have) badges assigned |
| `generalSearch` - [[CollectionGeneralSearchFilterValue!]](../types/CollectionGeneralSearchFilterValue.md) | Text search on name, summary and description, partial match. |

## Example

```json
{
  "filter": [CollectionsSearchFilter],
  "op": "AND",
  "userId": [BaseFilterValue],
  "name": [BaseFilterValue],
  "collectionRating": [BaseFilterValue],
  "recentRating": [FloatFilterValue],
  "recentRatingCount": [IntFilterValue],
  "createdAt": [BaseFilterValue],
  "updatedAt": [BaseFilterValue],
  "collectionStatus": [BaseFilterValue],
  "gameId": [BaseFilterValue],
  "gameDomain": [BaseFilterValue],
  "gameName": [BaseFilterValue],
  "categoryId": [BaseFilterValue],
  "categoryName": [BaseFilterValue],
  "gameVersion": [BaseFilterValue],
  "modUid": [BaseFilterValue],
  "tag": [BaseFilterValue],
  "adultContent": [BooleanFilterValue],
  "hasDraftRevision": [BooleanFilterValue],
  "hasPublishedRevision": [BooleanFilterValue],
  "schemaId": [IntFilterValue],
  "badges": [ExistsFilter],
  "generalSearch": [CollectionGeneralSearchFilterValue]
}
```
