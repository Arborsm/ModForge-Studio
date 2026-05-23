# Transaction

## Description

A transaction

## Fields

| Field Name | Description |
| --- | --- |
| `amount` - [Int!](../types/Int.md) | Amount of DP in this transaction |
| `createdAt` - [String!](../types/String.md) | Time of when this transaction was first created. |
| `creditor` - [String](../types/String.md) | Account/Bank that DP is being sent to Use 'creditorEntity' instead |
| `creditorEntity` - [PaymentEntity](../types/PaymentEntity.md) | Account/Bank that DP is being sent to |
| `debitor` - [String](../types/String.md) | Account/Bank that DP is being taken from Use 'debitorEntity' instead |
| `debitorEntity` - [PaymentEntity](../types/PaymentEntity.md) | Account/Bank that DP is being taken from |
| `id` - [Int!](../types/Int.md) | The database ID for this transaction. |
| `label` - [String!](../types/String.md) | Descriptive label for this transaction |
| `type` - [String!](../types/String.md) | Type of transaction E.g. 'refund', 'purchase' etc |

## Example

```json
{
  "amount": 123,
  "createdAt": "abc123",
  "creditor": "xyz789",
  "creditorEntity": PaymentEntity,
  "debitor": "xyz789",
  "debitorEntity": PaymentEntity,
  "id": 987,
  "label": "xyz789",
  "type": "abc123"
}
```
