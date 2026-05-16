# UserMonthlySummary

## Description

Monthly summary for for a particular user/account on how much DP/downloads they have received

## Fields

| Field Name | Description |
| --- | --- |
| `entries` - [[UserMonthlySummaryEntry!]!](../types/UserMonthlySummaryEntry.md) | List of summary report entries for this month |
| `user` - [User!](../types/User.md) | A Nexus Mods user |
| `userId` - [Int!](../types/Int.md) | The database ID for this user. |

## Example

```json
{
  "entries": [UserMonthlySummaryEntry],
  "user": User,
  "userId": 123
}
```
