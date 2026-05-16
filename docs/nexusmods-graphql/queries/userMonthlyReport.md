# userMonthlyReport

## Description

Get monthly summary report for a specific user

## Response

Returns a [UserMonthlyReport!](../types/UserMonthlyReport.md)

## Arguments

| Name | Description |
| --- | --- |
| `accountId` - [Int!](../types/Int.md) | Account ID |
| `year` - [Int!](../types/Int.md) | Year report was generated |
| `month` - [Int!](../types/Int.md) | Month report was generated |

#### Example

## Query

```gql
query userMonthlyReport(
  $accountId: Int!,
  $year: Int!,
  $month: Int!
) {
  userMonthlyReport(
    accountId: $accountId,
    year: $year,
    month: $month
  ) {
    entries {
      ...UserMonthlyReportEntryFragment
    }
    reportType
    user {
      ...UserFragment
    }
    userId
  }
}
```

## Variables

```json
{"accountId": 123, "year": 123, "month": 987}
```

## Response

```json
{
  "data": {
    "userMonthlyReport": {
      "entries": [UserMonthlyReportEntry],
      "reportType": "UNIQUE_DOWNLOADS",
      "user": User,
      "userId": 123
    }
  }
}
```
