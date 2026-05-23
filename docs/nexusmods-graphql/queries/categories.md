# categories

## Description

Get a list of categories

## Response

Returns [[Category!]](../types/Category.md)

## Arguments

| Name | Description |
| --- | --- |
| `gameId` - [Int](../types/Int.md) | Game ID |
| `global` - [Boolean](../types/Boolean.md) | If true, include all global categories |

#### Example

## Query

```gql
query categories(
  $gameId: Int,
  $global: Boolean
) {
  categories(
    gameId: $gameId,
    global: $global
  ) {
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
{"gameId": 123, "global": false}
```

## Response

```json
{
  "data": {
    "categories": [
      {
        "approved": true,
        "approvedBy": 987,
        "categoryGames": [Game],
        "createdAt": "2007-12-03T10:15:30Z",
        "description": "abc123",
        "discardedAt": "2007-12-03T10:15:30Z",
        "id": 123,
        "name": "xyz789",
        "parentId": 987,
        "suggestedBy": 123,
        "updatedAt": "2007-12-03T10:15:30Z"
      }
    ]
  }
}
```
