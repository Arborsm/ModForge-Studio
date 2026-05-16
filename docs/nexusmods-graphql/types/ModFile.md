# ModFile

## Description

Files belonging to a mod

## Fields

| Field Name | Description |
| --- | --- |
| `category` - [ModFileCategory!](../types/ModFileCategory.md) | The database ID for this File category. |
| `categoryId` - [Int!](../types/Int.md) | The database ID for this File category. |
| `changelogText` - [[String!]!](../types/String.md) | Patch notes for this mod file version |
| `count` - [Int!](../types/Int.md) | Number of downloads for this file |
| `date` - [Int!](../types/Int.md) | Unix Timestamp for when this file was uploaded |
| `description` - [String](../types/String.md) | Description for this file |
| `fileId` - [Int!](../types/Int.md) | Forms a composite key with the game_id |
| `game` - [Game!](../types/Game.md) | Game that this file relates to |
| `groupId` - [Int](../types/Int.md) | Group ID for this file |
| `id` - [ID!](../types/ID.md) | ID of the object. |
| `manager` - [Int!](../types/Int.md) | If true, this file can be downloaded by a mod manager |
| `mod` - [Mod!](../types/Mod.md) | Mod that this file belongs to |
| `modId` - [Int!](../types/Int.md) | The database ID for this mod. |
| `name` - [String!](../types/String.md) | File name |
| `owner` - [User!](../types/User.md) | User that uploaded this file |
| `primary` - [Int!](../types/Int.md) | If true, this file is the primary file for the mod |
| `reportLink` - [String!](../types/String.md) | URL for reporting this file |
| `requirementsAlert` - [Int!](../types/Int.md) | If true, popup will be displayed for showing the requirements |
| `scanned` - [Int!](../types/Int.md) | If true, this file has been virus scanned |
| `scannedV2` - [VirusScanStatus!](../types/VirusScanStatus.md) | Status of virus scanning on this file |
| `size` - [Int!](../types/Int.md) | Size of this file, in kilobytes |
| `sizeInBytes` - [BigInt](../types/BigInt.md) | Size of this file, in bytes |
| `totalDownloads` - [Int!](../types/Int.md) | Number of downloads for this file |
| `uCount` - [Int!](../types/Int.md) | Number of unique downloads for this file |
| `uid` - [ID!](../types/ID.md) | Unique ID for this file |
| `uniqueDownloads` - [Int!](../types/Int.md) | Number of unique downloads for this file |
| `uri` - [String!](../types/String.md) | URL to download this file |
| `version` - [String!](../types/String.md) | Version this file relates to |

## Example

```json
{
  "category": "MAIN",
  "categoryId": 123,
  "changelogText": ["xyz789"],
  "count": 987,
  "date": 123,
  "description": "abc123",
  "fileId": 987,
  "game": Game,
  "groupId": 987,
  "id": 4,
  "manager": 123,
  "mod": Mod,
  "modId": 987,
  "name": "xyz789",
  "owner": User,
  "primary": 123,
  "reportLink": "abc123",
  "requirementsAlert": 123,
  "scanned": 987,
  "scannedV2": "NOT_SCANNED",
  "size": 987,
  "sizeInBytes": {},
  "totalDownloads": 987,
  "uCount": 123,
  "uid": "4",
  "uniqueDownloads": 987,
  "uri": "abc123",
  "version": "abc123"
}
```
