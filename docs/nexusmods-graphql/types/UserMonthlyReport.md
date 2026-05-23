# UserMonthlyReport

## Description

Monthly detailed report for for a particular user/account on how much DP/downloads they have received for which mod/game

## Fields

| Field Name | Description |
| --- | --- |
| `entries` - [[UserMonthlyReportEntry!]!](../types/UserMonthlyReportEntry.md) | List of entries in this report |
| `reportType` - [DonationReport!](../types/DonationReport.md) | Type of report |
| `user` - [User](../types/User.md) | A Nexus Mods user |
| `userId` - [Int!](../types/Int.md) | The database ID for this user. |

## Example

```json
{
  "entries": [UserMonthlyReportEntry],
  "reportType": "UNIQUE_DOWNLOADS",
  "user": User,
  "userId": 123
}
```
