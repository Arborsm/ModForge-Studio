# Tag

## Description

The definition of a Tag Object. Deprecated. Will be removed in a future release in favour of domain specific tag queries/mutations

## Fields

| Field Name | Description |
| --- | --- |
| `adult` - [Boolean!](../types/Boolean.md) | If true, this Tag is intended for adult content |
| `category` - [TagCategory](../types/TagCategory.md) | Category that this tag belongs to |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this tag was first created. |
| `discardedAt` - [DateTime](../types/DateTime.md) | Time of when this tag was discarded. |
| `games` - [[Game!]](../types/Game.md) | List of games that this tag is for |
| `global` - [Boolean!](../types/Boolean.md) | If true, this Tag is global and not intended for a specific game |
| `id` - [ID!](../types/ID.md) | The database ID for this tag. |
| `name` - [String!](../types/String.md) | Name of this tag |
| `taggablesCount` - [Int!](../types/Int.md) | Number of tagged entities for this tag |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this tag was last updated. |

## Example

```json
{
  "adult": false,
  "category": TagCategory,
  "createdAt": "2007-12-03T10:15:30Z",
  "discardedAt": "2007-12-03T10:15:30Z",
  "games": [Game],
  "global": true,
  "id": 4,
  "name": "abc123",
  "taggablesCount": 123,
  "updatedAt": "2007-12-03T10:15:30Z"
}
```
