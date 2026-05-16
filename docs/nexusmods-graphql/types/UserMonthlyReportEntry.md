# UserMonthlyReportEntry

## Description

A more detailed entry for UserMonthlyReport, with a breakdown for a specific month for each mod

## Fields

| Field Name | Description |
| --- | --- |
| `author` - [User](../types/User.md) | A Nexus Mods user |
| `authorCount` - [Int](../types/Int.md) | Number of authors that give this user DP |
| `authorId` - [Int](../types/Int.md) | The database ID for this user. |
| `authorValue` - [Int](../types/Int.md) | Total DP value from all authors this user gets DP from, including DP not shared with this user. |
| `game` - [Game](../types/Game.md) | A Game |
| `gameId` - [Int](../types/Int.md) | The database ID for this game. |
| `mod` - [Mod](../types/Mod.md) | A mod |
| `modCount` - [Int](../types/Int.md) | Number of mods that this user appears in |
| `modId` - [Int](../types/Int.md) | The database ID for this mod. |
| `modValue` - [Int](../types/Int.md) | Total DP value from all mods this user appears in, including DP not shared with this user. |
| `month` - [Int!](../types/Int.md) | Month that this entry is for |
| `ratio` - [Float!](../types/Float.md) | Ratio of how much of the DP earned for a mod or author is given to this user |
| `reportId` - [Int!](../types/Int.md) | The database ID for this donation report. |
| `status` - [Int!](../types/Int.md) | Opt-in status of this mod |
| `value` - [Int!](../types/Int.md) | Total DP granted to this user in this entry |
| `year` - [Int!](../types/Int.md) | Year that this entry is for |

## Example

```json
{
  "author": User,
  "authorCount": 123,
  "authorId": 123,
  "authorValue": 123,
  "game": Game,
  "gameId": 123,
  "mod": Mod,
  "modCount": 987,
  "modId": 987,
  "modValue": 123,
  "month": 123,
  "ratio": 123.45,
  "reportId": 123,
  "status": 987,
  "value": 987,
  "year": 123
}
```
