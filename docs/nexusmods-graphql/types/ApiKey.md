# ApiKey

## Description

An API key for a modding application (or "integration")

## Fields

| Field Name | Description |
| --- | --- |
| `applicationId` - [ID](../types/ID.md) | The application which this key is for |
| `id` - [ID!](../types/ID.md) | ID of the object. |
| `key` - [String!](../types/String.md) | The API key itself |
| `userId` - [Int!](../types/Int.md) | The user whose key this is |

## Example

```json
{
  "applicationId": "4",
  "id": "4",
  "key": "abc123",
  "userId": 123
}
```
