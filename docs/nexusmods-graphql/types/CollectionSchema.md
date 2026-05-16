# CollectionSchema

## Description

A model of the expected structure for a collection manifest

## Fields

| Field Name | Description |
| --- | --- |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this collection schema was first created. |
| `id` - [Int!](../types/Int.md) | The database ID for this collection schema. |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this collection schema was last updated. |
| `version` - [String!](../types/String.md) | Schema version for the collection manifest format |

## Example

```json
{
  "createdAt": "2007-12-03T10:15:30Z",
  "id": 987,
  "updatedAt": "2007-12-03T10:15:30Z",
  "version": "xyz789"
}
```
