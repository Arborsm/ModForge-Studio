# UserMonthlySummaryEntry

## Description

An entry for UserMonthlySummary, with a breakdown for a specific month

## Fields

| Field Name | Description |
| --- | --- |
| `modCount` - [Int!](../types/Int.md) | Number of mods that this user appears in |
| `modValue` - [Int!](../types/Int.md) | Total DP value from all mods this user appears in, including DP not shared with this user. |
| `month` - [Int!](../types/Int.md) | Month that this entry is for |
| `reportType` - [DonationReport!](../types/DonationReport.md) | Type of report |
| `value` - [Int!](../types/Int.md) | Total DP granted to this user in this entry |
| `year` - [Int!](../types/Int.md) | Year that this entry is for |

## Example

```json
{
  "modCount": 987,
  "modValue": 987,
  "month": 987,
  "reportType": "UNIQUE_DOWNLOADS",
  "value": 123,
  "year": 987
}
```
