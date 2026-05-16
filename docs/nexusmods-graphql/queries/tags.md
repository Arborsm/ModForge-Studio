# tags

## Description

Get a list of tags

## Response

Returns [[Tag!]](../types/Tag.md)

## Arguments

| Name | Description |
| --- | --- |
| `gameId` - [Int](../types/Int.md) | Filter tags by a specific game ID |
| `categoryId` - [Int](../types/Int.md) | Filter tags by a specific category ID |
| `includeGlobal` - [Boolean](../types/Boolean.md) | If true, will include all global tags |
| `includeDiscarded` - [Boolean](../types/Boolean.md) | If true, will includes discarded tags |

#### Example

## Query

```gql
query tags(
  $gameId: Int,
  $categoryId: Int,
  $includeGlobal: Boolean,
  $includeDiscarded: Boolean
) {
  tags(
    gameId: $gameId,
    categoryId: $categoryId,
    includeGlobal: $includeGlobal,
    includeDiscarded: $includeDiscarded
  ) {
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
{
  "gameId": 987,
  "categoryId": 123,
  "includeGlobal": false,
  "includeDiscarded": false
}
```

## Response

```json
{
  "data": {
    "tags": [
      {
        "adult": true,
        "category": TagCategory,
        "createdAt": "2007-12-03T10:15:30Z",
        "discardedAt": "2007-12-03T10:15:30Z",
        "games": [Game],
        "global": false,
        "id": 4,
        "name": "xyz789",
        "taggablesCount": 123,
        "updatedAt": "2007-12-03T10:15:30Z"
      }
    ]
  }
}
```
