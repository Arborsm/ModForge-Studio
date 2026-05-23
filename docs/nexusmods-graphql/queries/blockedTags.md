# blockedTags

## Description

Get a list of the current user's blocked tags.

## Response

Returns [[LegacyTag!]](../types/LegacyTag.md)

## Arguments

| Name | Description |
| --- | --- |
| `excludeAdult` - [Boolean](../types/Boolean.md) | If true, will only return non-adult tags |

#### Example

## Query

```gql
query blockedTags($excludeAdult: Boolean) {
  blockedTags(excludeAdult: $excludeAdult) {
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
{"excludeAdult": false}
```

## Response

```json
{
  "data": {
    "blockedTags": [
      {
        "blockable": false,
        "games": GameConnection,
        "global": true,
        "id": 4,
        "name": "abc123",
        "parentId": "4",
        "searchable": false
      }
    ]
  }
}
```
