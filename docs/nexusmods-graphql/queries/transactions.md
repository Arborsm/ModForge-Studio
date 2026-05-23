# transactions

## Description

Get a list of transactions, with paging and filtering

## Response

Returns a [TransactionList!](../types/TransactionList.md)

## Arguments

| Name | Description |
| --- | --- |
| `start` - [Int](../types/Int.md) | Offset for pagination |
| `perPage` - [Int](../types/Int.md) | Number of elements to return per page |
| `orderDir` - [String](../types/String.md) | Direction for sorting. 'asc' or 'desc' are the only valid options |
| `orderColumn` - [String](../types/String.md) | Column used for sorting |
| `accountId` - [Int](../types/Int.md) | Includes transactions involving this Account's ID |
| `bankId` - [Int](../types/Int.md) | Includes transactions involving this Bank's ID |
| `search` - [String](../types/String.md) | Filter transactions to return |

#### Example

## Query

```gql
query transactions(
  $start: Int,
  $perPage: Int,
  $orderDir: String,
  $orderColumn: String,
  $accountId: Int,
  $bankId: Int,
  $search: String
) {
  transactions(
    start: $start,
    perPage: $perPage,
    orderDir: $orderDir,
    orderColumn: $orderColumn,
    accountId: $accountId,
    bankId: $bankId,
    search: $search
  ) {
    filteredCount
    totalCount
    transactions {
      ...TransactionFragment
    }
  }
}
```

## Variables

```json
{
  "start": 123,
  "perPage": 123,
  "orderDir": "xyz789",
  "orderColumn": "xyz789",
  "accountId": 123,
  "bankId": 987,
  "search": "abc123"
}
```

## Response

```json
{
  "data": {
    "transactions": {
      "filteredCount": 123,
      "totalCount": 987,
      "transactions": [Transaction]
    }
  }
}
```
