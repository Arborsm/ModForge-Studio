# Mod

## Description

A mod

## Fields

| Field Name | Description |
| --- | --- |
| `adult` - [Boolean](../types/Boolean.md) | If true, this mod contains adult content Deprecated in favour of `adult_content`. |
| `adultContent` - [Boolean](../types/Boolean.md) | If true, this mod contains adult content |
| `author` - [String](../types/String.md) | Author of this mod |
| `category` - [String!](../types/String.md) | Category name of this mod |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this mod was first created. |
| `description` - [String!](../types/String.md) | A detailed description of this mod |
| `directDownloadEnabled` - [Boolean!](../types/Boolean.md) | If true, this mod can be downloaded without first visiting the Nexus site |
| `downloads` - [Int!](../types/Int.md) | Download count of this mod |
| `endorsements` - [Int!](../types/Int.md) | Endorsement count of this mod |
| `fileSize` - [Int](../types/Int.md) | Size of the primary mod file in kilobytes |
| `game` - [Game!](../types/Game.md) | Game changed by this mod |
| `gameId` - [Int!](../types/Int.md) | The database ID for this game. |
| `id` - [ID!](../types/ID.md) | The database ID for this mod. |
| `isBlockedFromEarningDp` - [Boolean](../types/Boolean.md) | If true, this mod is blocked from earning DP |
| `legacyModRequirementsEnabled` - [Boolean!](../types/Boolean.md) | If true, this mod uses the legacy mod requirements model |
| `mirrors` - [[ModMirror!]](../types/ModMirror.md) | Mirrors for this mod |
| `modCategory` - [ModCategory](../types/ModCategory.md) | A mod category |
| `modId` - [Int!](../types/Int.md) | The database ID for this mod. |
| `modRequirements` - [ModRequirements!](../types/ModRequirements.md) | Requirements of this mod |
| `name` - [String!](../types/String.md) | Name of this mod |
| `pictureUrl` - [String](../types/String.md) | URL for the main mod image |
| `status` - [String!](../types/String.md) | Status of this mod |
| `summary` - [String!](../types/String.md) | A brief summary of this mod |
| `supportsVortex` - [Boolean!](../types/Boolean.md) | If true, this mod can be installed using Vortex |
| `tags` - [[LegacyTag!]!](../types/LegacyTag.md) | Tags associated with this mod |
| `thumbnailBlurredUrl` - [String](../types/String.md) | URL for the blurred thumbnail mod image |
| `thumbnailLargeBlurredUrl` - [String](../types/String.md) | URL for the large blurred thumbnail mod image |
| `thumbnailLargeUrl` - [String](../types/String.md) | URL for the large thumbnail mod image |
| `thumbnailUrl` - [String](../types/String.md) | URL for the thumbnail mod image |
| `uid` - [ID!](../types/ID.md) | The database ID for this mod. |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this mod was last updated. |
| `uploader` - [User!](../types/User.md) | Uploader of this mod |
| `version` - [String!](../types/String.md) | Version of this mod |
| `viewerBlocked` - [Boolean!](../types/Boolean.md) | True if the viewer (current user) has blocked this mod |
| `viewerDownloaded` - [DateTime](../types/DateTime.md) | A timestamp indicating the last time the user downloaded this mod |
| `viewerEndorsed` - [Boolean](../types/Boolean.md) | True indicates endorsement, false for abstention. Will be null if the user has not endorsed the mod |
| `viewerIsBlocked` - [Boolean](../types/Boolean.md) | True if the viewer (current user) is blocked from interacting with this mod |
| `viewerTracked` - [Boolean!](../types/Boolean.md) | If true, the viewer (current user) is tracking this mod. |
| `viewerUpdateAvailable` - [Boolean](../types/Boolean.md) | True if the mod has been updated since the viewer (current user) downloaded it |

## Example

```json
{
  "adult": true,
  "adultContent": false,
  "author": "xyz789",
  "category": "abc123",
  "createdAt": "2007-12-03T10:15:30Z",
  "description": "abc123",
  "directDownloadEnabled": true,
  "downloads": 123,
  "endorsements": 987,
  "fileSize": 123,
  "game": Game,
  "gameId": 123,
  "id": 4,
  "isBlockedFromEarningDp": true,
  "legacyModRequirementsEnabled": false,
  "mirrors": [ModMirror],
  "modCategory": ModCategory,
  "modId": 987,
  "modRequirements": ModRequirements,
  "name": "abc123",
  "pictureUrl": "abc123",
  "status": "abc123",
  "summary": "abc123",
  "supportsVortex": true,
  "tags": [LegacyTag],
  "thumbnailBlurredUrl": "xyz789",
  "thumbnailLargeBlurredUrl": "abc123",
  "thumbnailLargeUrl": "xyz789",
  "thumbnailUrl": "abc123",
  "uid": "4",
  "updatedAt": "2007-12-03T10:15:30Z",
  "uploader": User,
  "version": "abc123",
  "viewerBlocked": true,
  "viewerDownloaded": "2007-12-03T10:15:30Z",
  "viewerEndorsed": true,
  "viewerIsBlocked": false,
  "viewerTracked": false,
  "viewerUpdateAvailable": false
}
```
