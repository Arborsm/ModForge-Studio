# tagCategory

## Description

Get a tag category by ID

## Response

Returns a [TagCategory](../types/TagCategory.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | ID of Tag Category to find |

#### Example

## Query

```gql
query tagCategory($id: ID!) {
  tagCategory(id: $id) {
    createdAt
    discardedAt
    id
    name
    tags {
      ...TagFragment
    }
    updatedAt
  }
}
```

## Variables

```json
{"id": 4}
```

## Response

```json
{
  "data": {
    "tagCategory": {
      "createdAt": "2007-12-03T10:15:30Z",
      "discardedAt": "2007-12-03T10:15:30Z",
      "id": 4,
      "name": "xyz789",
      "tags": [Tag],
      "updatedAt": "2007-12-03T10:15:30Z"
    }
  }
}
```
