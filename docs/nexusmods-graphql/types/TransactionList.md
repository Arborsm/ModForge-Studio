# TransactionList

## Description

A list of transactions

## Fields

| Field Name | Description |
| --- | --- |
| `filteredCount` - [Int!](../types/Int.md) | Number of transactions being filtered |
| `totalCount` - [Int!](../types/Int.md) | Total number of transactions in the system |
| `transactions` - [[Transaction!]](../types/Transaction.md) | List of Transactions |

## Example

```json
{
  "filteredCount": 987,
  "totalCount": 987,
  "transactions": [Transaction]
}
```
