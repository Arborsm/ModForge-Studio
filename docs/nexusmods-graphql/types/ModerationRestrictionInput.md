# ModerationRestrictionInput

## Description

A moderation restriction

## Fields

| Input Field | Description |
| --- | --- |
| `restriction` - [ModerationRestrictions!](../types/ModerationRestrictions.md) | Reason |
| `timeframe` - [Int!](../types/Int.md) | Timeframe in days |
| `modId` - [ID](../types/ID.md) | Mod ID |
| `gameId` - [ID](../types/ID.md) | Game ID |

## Example

```json
{
  "restriction": "FILE_UPLOAD",
  "timeframe": 987,
  "modId": "4",
  "gameId": "4"
}
```
