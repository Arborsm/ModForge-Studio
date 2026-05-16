# tag

## Description

Get a tag by ID

## Response

Returns a [Tag](../types/Tag.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | ID of Tag Category to find |

#### Example

## Query

```gql
query tag($id: ID!) {
  tag(id: $id) {
    adult
    category {
      ...TagCategoryFragment
    }
    createdAt
    discardedAt
    games {
      ...GameFragment
    }
    global
    id
    name
    taggablesCount
    updatedAt
  }
}
```

## Variables

```json
{"id": "4"}
```

## Response

```json
{
  "data": {
    "tag": {
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
  }
}
```
