# Rating

## Description

A Rating

## Fields

| Field Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | ID of the object. |
| `modelId` - [Int!](../types/Int.md) | Polymorphic ID of the entity being rated |
| `modelType` - [String!](../types/String.md) | Polymorphic type of the entity being rated |
| `rating` - [String!](../types/String.md) | Rating value |
| `userId` - [Int!](../types/Int.md) | ID of the user that created this rating |

## Example

```json
{
  "id": 4,
  "modelId": 987,
  "modelType": "abc123",
  "rating": "abc123",
  "userId": 123
}
```
