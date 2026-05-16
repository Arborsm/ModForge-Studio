# PageInfo

## Description

Information about pagination in a connection.

## Fields

| Field Name | Description |
| --- | --- |
| `endCursor` - [String](../types/String.md) | When paginating forwards, the cursor to continue. |
| `hasNextPage` - [Boolean!](../types/Boolean.md) | When paginating forwards, are there more items? |
| `hasPreviousPage` - [Boolean!](../types/Boolean.md) | When paginating backwards, are there more items? |
| `startCursor` - [String](../types/String.md) | When paginating backwards, the cursor to continue. |

## Example

```json
{
  "endCursor": "xyz789",
  "hasNextPage": false,
  "hasPreviousPage": false,
  "startCursor": "xyz789"
}
```
