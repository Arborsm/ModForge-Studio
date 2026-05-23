# wallets

                   Legacy Query. This endpoint may change or become unstable in future updates.

## Description

Get a list of wallets, with paging and filtering

## Response

Returns a [WalletList!](../types/WalletList.md)

## Arguments

| Name | Description |
| --- | --- |
| `start` - [Int](../types/Int.md) | For offset-based pagination. Indicates the first element to start returning values from |
| `perPage` - [Int](../types/Int.md) | Number of elements to return per page |
| `orderDir` - [String](../types/String.md) | Direction for sorting. 'asc' or 'desc' are the only valid options |
| `orderColumn` - [String](../types/String.md) | Column used for sorting |
| `search` - [String](../types/String.md) | Used to filter specific accounts |

#### Example

## Query

```gql
query wallets(
  $start: Int,
  $perPage: Int,
  $orderDir: String,
  $orderColumn: String,
  $search: String
) {
  wallets(
    start: $start,
    perPage: $perPage,
    orderDir: $orderDir,
    orderColumn: $orderColumn,
    search: $search
  ) {
    filteredCount
    totalCount
  }
}
```

## Variables

```json
{
  "start": 987,
  "perPage": 123,
  "orderDir": "abc123",
  "orderColumn": "xyz789",
  "search": "abc123"
}
```

## Response

```json
{"data": {"wallets": {"filteredCount": 123, "totalCount": 123}}}
```
