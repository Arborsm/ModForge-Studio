# userMonthlyReportById

## Description

Get a specific report for a specific user

## Response

Returns a [UserMonthlyReport!](../types/UserMonthlyReport.md)

## Arguments

| Name | Description |
| --- | --- |
| `accountId` - [Int!](../types/Int.md) | Account ID |
| `reportId` - [Int!](../types/Int.md) | Donation Report ID |

#### Example

## Query

```gql
query userMonthlyReportById(
  $accountId: Int!,
  $reportId: Int!
) {
  userMonthlyReportById(
    accountId: $accountId,
    reportId: $reportId
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
{"accountId": 987, "reportId": 123}
```

## Response

```json
{
  "data": {
    "userMonthlyReportById": {
      "entries": [UserMonthlyReportEntry],
      "reportType": "UNIQUE_DOWNLOADS",
      "user": User,
      "userId": 123
    }
  }
}
```
