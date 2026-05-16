# LegacyTag

## Description

A Tag

## Fields

| Field Name | Description |
| --- | --- |
| `blockable` - [Boolean!](../types/Boolean.md) | If true, this tag is blockable by the user |
| `games` - [GameConnection](../types/GameConnection.md) | Games this tag is used for. Will be nil if global is true, as this tag would apply to all games |
| Arguments `after` - [String](../types/String.md) Returns the elements in the list that come after the specified cursor. `before` - [String](../types/String.md) Returns the elements in the list that come before the specified cursor. `first` - [Int](../types/Int.md) Returns the first *n* elements from the list. `last` - [Int](../types/Int.md) Returns the last *n* elements from the list. |  |
| `global` - [Boolean!](../types/Boolean.md) | If true, this Tag is global and not intended for a specific game |
| `id` - [ID!](../types/ID.md) | ID of this tag |
| `name` - [String!](../types/String.md) | Name of this tag |
| `parentId` - [ID](../types/ID.md) | ID of the parent tag, if any |
| `searchable` - [Boolean!](../types/Boolean.md) | If true, this tag can be searched on by users |

## Example

```json
{
  "blockable": false,
  "games": GameConnection,
  "global": false,
  "id": "4",
  "name": "xyz789",
  "parentId": "4",
  "searchable": true
}
```
