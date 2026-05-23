# optedInMods

## Description

Get a list of opted in mods for this user

## Response

Returns an [OptedInMods!](../types/OptedInMods.md)

## Arguments

| Name | Description |
| --- | --- |
| `accountId` - [Int!](../types/Int.md) | ID of account for filtering |

#### Example

## Query

```gql
query optedInMods($accountId: Int!) {
  optedInMods(accountId: $accountId) {
    count
    entries {
      ...OptedInModFragment
    }
    user {
      ...UserFragment
    }
    userId
  }
}
```

## Variables

```json
{"accountId": 123}
```

## Response

```json
{
  "data": {
    "optedInMods": {
      "count": 987,
      "entries": [OptedInMod],
      "user": User,
      "userId": 123
    }
  }
}
```
