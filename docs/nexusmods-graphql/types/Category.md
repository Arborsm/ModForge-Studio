# Category

## Description

A category into which related entities may fall

## Fields

| Field Name | Description |
| --- | --- |
| `approved` - [Boolean!](../types/Boolean.md) | Whether the category has been approved |
| `approvedBy` - [Int](../types/Int.md) | The id of the user who approved the category |
| `categoryGames` - [[Game!]](../types/Game.md) | A list of games for which this category is used |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this category was first created. |
| `description` - [String!](../types/String.md) | A brief description of the category's purpose |
| `discardedAt` - [DateTime](../types/DateTime.md) | Time of when this category was discarded. |
| `id` - [Int!](../types/Int.md) | The database ID for this category. |
| `name` - [String!](../types/String.md) | The name of the category |
| `parentId` - [Int!](../types/Int.md) | The id of the parent category |
| `suggestedBy` - [Int!](../types/Int.md) | The id of the user who suggested the category |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this category was last updated. |

## Example

```json
{
  "approved": false,
  "approvedBy": 123,
  "categoryGames": [Game],
  "createdAt": "2007-12-03T10:15:30Z",
  "description": "abc123",
  "discardedAt": "2007-12-03T10:15:30Z",
  "id": 987,
  "name": "xyz789",
  "parentId": 123,
  "suggestedBy": 123,
  "updatedAt": "2007-12-03T10:15:30Z"
}
```
