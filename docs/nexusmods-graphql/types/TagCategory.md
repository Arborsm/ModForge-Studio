# TagCategory

## Description

The definition of a Tag Category Object. Deprecated. Will be removed in a future release in favour of domain specific tag queries/mutations

## Fields

| Field Name | Description |
| --- | --- |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this tag category was first created. |
| `discardedAt` - [DateTime](../types/DateTime.md) | Time of when this tag category was discarded. |
| `id` - [ID!](../types/ID.md) | The database ID for this tag category. |
| `name` - [String!](../types/String.md) | Name of this Tag Category |
| `tags` - [[Tag!]](../types/Tag.md) | List of tags in this catgeory |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this tag category was last updated. |

## Example

```json
{
  "createdAt": "2007-12-03T10:15:30Z",
  "discardedAt": "2007-12-03T10:15:30Z",
  "id": 4,
  "name": "xyz789",
  "tags": [Tag],
  "updatedAt": "2007-12-03T10:15:30Z"
}
```
