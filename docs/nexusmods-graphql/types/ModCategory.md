# ModCategory

## Description

A mod category

## Fields

| Field Name | Description |
| --- | --- |
| `categoryId` - [Int!](../types/Int.md) | The database ID for this mod category. |
| `date` - [Int](../types/Int.md) | Unix timestamp of category creation |
| `gameId` - [Int!](../types/Int.md) | The database ID for this game. |
| `id` - [ID!](../types/ID.md) | Comma separated mod category id and game id |
| `name` - [String!](../types/String.md) | Name of this category |
| `tags` - [String](../types/String.md) | Comma separated list of legacy tag IDs These tag identifiers are no longer used |

## Example

```json
{
  "categoryId": 987,
  "date": 987,
  "gameId": 123,
  "id": 4,
  "name": "xyz789",
  "tags": "xyz789"
}
```
