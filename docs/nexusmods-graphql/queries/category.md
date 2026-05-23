# category

## Description

Get a category by ID

## Response

Returns a [Category](../types/Category.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | Category ID |

#### Example

## Query

```gql
query category($id: ID!) {
  category(id: $id) {
    approved
    approvedBy
    categoryGames {
      ...GameFragment
    }
    createdAt
    description
    discardedAt
    id
    name
    parentId
    suggestedBy
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
    "category": {
      "approved": true,
      "approvedBy": 123,
      "categoryGames": [Game],
      "createdAt": "2007-12-03T10:15:30Z",
      "description": "xyz789",
      "discardedAt": "2007-12-03T10:15:30Z",
      "id": 987,
      "name": "abc123",
      "parentId": 987,
      "suggestedBy": 123,
      "updatedAt": "2007-12-03T10:15:30Z"
    }
  }
}
```
