# Game

## Description

A Game

## Fields

| Field Name | Description |
| --- | --- |
| `approvedAt` - [DateTime](../types/DateTime.md) | Time that this game was approved, after being submitted by a community member |
| `artworkSchema` - [GameArtworkSchema](../types/GameArtworkSchema.md) | Schema for game artwork (V1 for game tile only, V2 for multiple artwork assets). |
| `availableTags` - [[Tag!]](../types/Tag.md) | Tags available for collections under this specific game, including global tags. |
| `collectionCount` - [Int](../types/Int.md) | Number of collections within this game |
| `copyrightedName` - [Boolean!](../types/Boolean.md) | True if the name of this game is a copyrighted asset |
| `domainName` - [String!](../types/String.md) | Nexus-specific domain name, used to separate games on the Nexus Mods website. |
| `downloadCount` - [BigInt](../types/BigInt.md) | Number of total downloads for mods in this game |
| `forumUrl` - [String](../types/String.md) | URL to the game's forum |
| `genre` - [String](../types/String.md) | Genre of this game |
| `id` - [Int!](../types/Int.md) | The database ID for this game. |
| `imageCount` - [Int](../types/Int.md) | Number of uploaded images within this game |
| `mediaCount` - [Int](../types/Int.md) | Number of uploaded images, supporter images, and videos within this game |
| `modCount` - [Int](../types/Int.md) | Number of mods within this game |
| `name` - [String!](../types/String.md) | Name of this game |
| `specificTags` - [[Tag!]](../types/Tag.md) | Tags only available for collections under this specific game. |
| `supporterImageCount` - [Int](../types/Int.md) | Number of uploaded supporter images within this game |
| `supportsVortex` - [Boolean!](../types/Boolean.md) | Whether this game supports Vortex mod installation |
| `trendingPeriodDays` - [Int!](../types/Int.md) | Number of days to consider for trending mods |
| `uniqueDownloadCount` - [BigInt](../types/BigInt.md) | Number of total unique downloads for mods in this game |
| `videoCount` - [Int](../types/Int.md) | Number of uploaded videos within this game |

## Example

```json
{
  "approvedAt": "2007-12-03T10:15:30Z",
  "artworkSchema": "V1",
  "availableTags": [Tag],
  "collectionCount": 123,
  "copyrightedName": true,
  "domainName": "xyz789",
  "downloadCount": {},
  "forumUrl": "xyz789",
  "genre": "abc123",
  "id": 987,
  "imageCount": 987,
  "mediaCount": 123,
  "modCount": 987,
  "name": "abc123",
  "specificTags": [Tag],
  "supporterImageCount": 123,
  "supportsVortex": false,
  "trendingPeriodDays": 987,
  "uniqueDownloadCount": {},
  "videoCount": 987
}
```
