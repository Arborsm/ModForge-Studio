# userMonthlySummary

## Description

Get monthly summary report for a specific user

## Response

Returns a [UserMonthlySummary!](../types/UserMonthlySummary.md)

## Arguments

| Name | Description |
| --- | --- |
| `accountId` - [Int!](../types/Int.md) | Account ID |

#### Example

## Query

```gql
query userMonthlySummary($accountId: Int!) {
  userMonthlySummary(accountId: $accountId) {
    entries {
      ...UserMonthlySummaryEntryFragment
    }
    user {
      ...UserFragment
    }
    userId
  }
}
```

## Variables

```json
{"accountId": 987}
```

## Response

```json
{
  "data": {
    "userMonthlySummary": {
      "entries": [UserMonthlySummaryEntry],
      "user": User,
      "userId": 123
    }
  }
}
```
