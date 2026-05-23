# ApiApplication

## Description

A modding application (or "integration") accessed with an API key

## Fields

| Field Name | Description |
| --- | --- |
| `active` - [Boolean!](../types/Boolean.md) | If true, this application is active |
| `id` - [ID!](../types/ID.md) | Application ID |
| `image` - [String!](../types/String.md) | Application image URL |
| `key` - [String](../types/String.md) | The API key for the logged in user, if one exists |
| `name` - [String!](../types/String.md) | Application name |
| `slug` - [String!](../types/String.md) | Machine-readable application name |
| `summary` - [String!](../types/String.md) | Application summary |

## Example

```json
{
  "active": true,
  "id": "4",
  "image": "xyz789",
  "key": "abc123",
  "name": "abc123",
  "slug": "abc123",
  "summary": "xyz789"
}
```
