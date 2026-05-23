# CollectionsFacet

## Description

Facet fields specific to the Collections query.

## Fields

| Input Field | Description |
| --- | --- |
| `adultContent` - [[String!]](../types/String.md) | Facet on adult content. |
| `categoryName` - [[String!]](../types/String.md) | Facet on category. |
| `collectionRating` - [[String!]](../types/String.md) | Facet on ratings. |
| `collectionStatus` - [[String!]](../types/String.md) | Facet on status. |
| `gameName` - [[String!]](../types/String.md) | Facet on game name. |
| `gameIds` - [[String!]](../types/String.md) | Facet on game ID. |
| `gameVersion` - [[String!]](../types/String.md) | Facet on game versions. |
| `tag` - [[String!]](../types/String.md) | Facet on collection tags. |
| `badges` - [[String!]](../types/String.md) | Facet on collection badges. |
| `schemaId` - [[String!]](../types/String.md) | Facet on collection schema (1 = Vortex, 2 = Wabbajack). |

## Example

```json
{
  "adultContent": ["xyz789"],
  "categoryName": ["abc123"],
  "collectionRating": ["abc123"],
  "collectionStatus": ["abc123"],
  "gameName": ["abc123"],
  "gameIds": ["xyz789"],
  "gameVersion": ["abc123"],
  "tag": ["xyz789"],
  "badges": ["abc123"],
  "schemaId": ["xyz789"]
}
```
