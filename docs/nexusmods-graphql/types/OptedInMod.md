# OptedInMod

## Description

Represents a single opted in mod

## Fields

| Field Name | Description |
| --- | --- |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this OptedInMod was first created. |
| `game` - [Game](../types/Game.md) | Game |
| `gameId` - [Int!](../types/Int.md) | The ID of the game the mod belongs to |
| `id` - [Int!](../types/Int.md) | The database ID for this opted in mod. |
| `mod` - [Mod](../types/Mod.md) | Mod |
| `modId` - [Int!](../types/Int.md) | ID of the that was opted in |
| `ratio` - [Float!](../types/Float.md) | Ratio of the DP from this mod shared with this user |
| `uploader` - [User](../types/User.md) | Uploader of the mod |
| `uploaderId` - [Int!](../types/Int.md) | ID of the uploader of the mod. This might not be the current user, as mod authors can share mod DP with other users. |

## Example

```json
{
  "createdAt": "2007-12-03T10:15:30Z",
  "game": Game,
  "gameId": 987,
  "id": 123,
  "mod": Mod,
  "modId": 987,
  "ratio": 123.45,
  "uploader": User,
  "uploaderId": 123
}
```
