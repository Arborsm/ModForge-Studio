# MediaSearchFilter

## Description

Filter fields specific to the legacy media search query.

## Fields

| Input Field | Description |
| --- | --- |
| `filter` - [[MediaSearchFilter!]](../types/MediaSearchFilter.md) | Nested filters. |
| `op` - [FilterLogicalOperator](../types/FilterLogicalOperator.md) | Logical operator for clauses. |
| `gameId` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Filter media by Game ID |
| `gameName` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Filter media by Game name |
| `createdAt` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Date created, in unix timestamp |
| `adultContent` - [[BooleanFilterValue!]](../types/BooleanFilterValue.md) | Filter media by adult content |
| `type` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Type of media item ("image", "supporter_image" or "video") |
| `owner` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Filter media by ID of the uploader |
| `mediaStatus` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Media status. Valid values are "published", "under_moderation" (moderators/admins only), "hidden" (for images moderator/admin only) |
| `generalSearch` - [[MediaGeneralSearchFilterValue!]](../types/MediaGeneralSearchFilterValue.md) | Text search on title and description, partial match. |

## Example

```json
{
  "filter": [MediaSearchFilter],
  "op": "AND",
  "gameId": [BaseFilterValue],
  "gameName": [BaseFilterValue],
  "createdAt": [BaseFilterValue],
  "adultContent": [BooleanFilterValue],
  "type": [BaseFilterValue],
  "owner": [BaseFilterValue],
  "mediaStatus": [BaseFilterValue],
  "generalSearch": [MediaGeneralSearchFilterValue]
}
```
