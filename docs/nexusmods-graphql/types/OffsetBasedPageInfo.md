# OffsetBasedPageInfo

## Description

Information about a page of items

## Fields

| Field Name | Description |
| --- | --- |
| `hasNextPage` - [Boolean!](../types/Boolean.md) | Whether there is a next page |
| `hasPreviousPage` - [Boolean!](../types/Boolean.md) | Whether there is a previous page |
| `page` - [Int!](../types/Int.md) | The current page number |
| `pageSize` - [Int!](../types/Int.md) | The number of items per page |
| `totalCount` - [Int!](../types/Int.md) | The total number of items |

## Example

```json
{
  "hasNextPage": true,
  "hasPreviousPage": false,
  "page": 987,
  "pageSize": 123,
  "totalCount": 987
}
```
