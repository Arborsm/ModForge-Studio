# legacyTags

## Description

Fetches Mod Tags.

## Response

Returns [[LegacyTag!]](../types/LegacyTag.md)

## Arguments

| Name | Description |
| --- | --- |
| `gameId` - [ID](../types/ID.md) | If set, will show tags for a specific game ID. If nil, will only show global tags. Global tags are always included. |
| `onlyAdult` - [Boolean](../types/Boolean.md) | If true, will only return adult tags |
| `excludeAdult` - [Boolean](../types/Boolean.md) | If true, will only return non-adult tags |

#### Example

## Query

```gql
query legacyTags(
  $gameId: ID,
  $onlyAdult: Boolean,
  $excludeAdult: Boolean
) {
  legacyTags(
    gameId: $gameId,
    onlyAdult: $onlyAdult,
    excludeAdult: $excludeAdult
  ) {
    blockable
    games {
      ...GameConnectionFragment
    }
    global
    id
    name
    parentId
    searchable
  }
}
```

## Variables

```json
{
  "gameId": "4",
  "onlyAdult": true,
  "excludeAdult": false
}
```

## Response

```json
{
  "data": {
    "legacyTags": [
      {
        "blockable": false,
        "games": GameConnection,
        "global": false,
        "id": "4",
        "name": "xyz789",
        "parentId": 4,
        "searchable": true
      }
    ]
  }
}
```
