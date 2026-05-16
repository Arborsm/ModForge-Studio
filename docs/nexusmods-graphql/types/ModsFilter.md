# ModsFilter

## Description

Filter fields specific to a Mods query

## Fields

| Input Field | Description |
| --- | --- |
| `filter` - [[ModsFilter!]](../types/ModsFilter.md) | Nested filters. |
| `op` - [FilterLogicalOperator](../types/FilterLogicalOperator.md) | Logical operator for clauses. |
| `name` - [[BaseFilterValueEqualsWildcard!]](../types/BaseFilterValueEqualsWildcard.md) | Mod name suitable for use with op:wildcard, but not op:matches. Punctuation matched. |
| `nameStemmed` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Stemmed name, suitable for token matching (op:wildcard and op:matches). Punctuation not matched. |
| `modId` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Filter mods by mod ID |
| `id` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Filter mods by unique identifier (UID) |
| `gameId` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Filter mods by Game ID |
| `gameDomainName` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Filter mods by Game domain name |
| `createdAt` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Date created, in unix timestamp |
| `updatedAt` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Date updated, in unix timestamp |
| `hasUpdated` - [[BooleanFilterValue!]](../types/BooleanFilterValue.md) | Filter mods by whether they have been updated since they were created |
| `uploaderId` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Filter mods by uploader id |
| `adultContent` - [[BooleanFilterValue!]](../types/BooleanFilterValue.md) | Filter mods by adult content |
| `fileSize` - [[IntFilterValue!]](../types/IntFilterValue.md) | Filter mods by file size |
| `downloads` - [[IntFilterValue!]](../types/IntFilterValue.md) | Filter mods by download count |
| `endorsements` - [[IntFilterValue!]](../types/IntFilterValue.md) | Filter mods by endorsement count |
| `tag` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | The tag name, exact match. |
| `description` - [[BaseFilterValueEqualsMatches!]](../types/BaseFilterValueEqualsMatches.md) | The description of the mod |
| `author` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | The name of the author |
| `uploader` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | The name of the uploader |
| `supportsVortex` - [[BooleanFilterValue!]](../types/BooleanFilterValue.md) | Filter mods by whether they support Vortex |
| `languageName` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | The language of the mod |
| `categoryName` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | The mod category |
| `status` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | The mod status |
| `gameName` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | The name of the game this mod is for |
| `primaryImage` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Filter mods by image, as returned by pictureUrl and thumbnailUrl. |
| `directDownloadEnabled` - [[BooleanFilterValue!]](../types/BooleanFilterValue.md) | Filter mods by if they can be downloaded directly without visiting the Nexus site |

## Example

```json
{
  "filter": [ModsFilter],
  "op": "AND",
  "name": [BaseFilterValueEqualsWildcard],
  "nameStemmed": [BaseFilterValue],
  "modId": [BaseFilterValue],
  "id": [BaseFilterValue],
  "gameId": [BaseFilterValue],
  "gameDomainName": [BaseFilterValue],
  "createdAt": [BaseFilterValue],
  "updatedAt": [BaseFilterValue],
  "hasUpdated": [BooleanFilterValue],
  "uploaderId": [BaseFilterValue],
  "adultContent": [BooleanFilterValue],
  "fileSize": [IntFilterValue],
  "downloads": [IntFilterValue],
  "endorsements": [IntFilterValue],
  "tag": [BaseFilterValue],
  "description": [BaseFilterValueEqualsMatches],
  "author": [BaseFilterValue],
  "uploader": [BaseFilterValue],
  "supportsVortex": [BooleanFilterValue],
  "languageName": [BaseFilterValue],
  "categoryName": [BaseFilterValue],
  "status": [BaseFilterValue],
  "gameName": [BaseFilterValue],
  "primaryImage": [BaseFilterValue],
  "directDownloadEnabled": [BooleanFilterValue]
}
```
