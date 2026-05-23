# tagCategories

## Description

Get all tag categories

## Response

Returns [[TagCategory!]](../types/TagCategory.md)

#### Example

## Query

```gql
query tagCategories {
  tagCategories {
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

## Response

```json
{
  "data": {
    "tagCategories": [
      {
        "createdAt": "2007-12-03T10:15:30Z",
        "discardedAt": "2007-12-03T10:15:30Z",
        "id": 4,
        "name": "abc123",
        "tags": [Tag],
        "updatedAt": "2007-12-03T10:15:30Z"
      }
    ]
  }
}
```
