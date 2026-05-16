# CollectionsFilter

## Description

Common filter fields specific to the Collections query

## Fields

| Input Field | Description |
| --- | --- |
| `filter` - [[CollectionsFilter!]](../types/CollectionsFilter.md) | Nested filters. |
| `op` - [FilterLogicalOperator](../types/FilterLogicalOperator.md) | Logical operator for clauses. |
| `name` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Collection Name |
| `collectionRating` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Collection Rating |
| `collectionStatus` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Status of the collection. Valid values are: "unlisted", "under_moderation" (moderators/admins only), "discarded" (moderators/admins only). |
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
| `generalSearch` - [[CollectionGeneralSearchFilterValue!]](../types/CollectionGeneralSearchFilterValue.md) | Text search on name, summary and description, partial match. |

## Example

```json
{
  "filter": [CollectionsFilter],
  "op": "AND",
  "name": [BaseFilterValue],
  "collectionRating": [BaseFilterValue],
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
  "generalSearch": [CollectionGeneralSearchFilterValue]
}
```
