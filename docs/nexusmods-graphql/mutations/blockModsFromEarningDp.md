# blockModsFromEarningDp

## Description

Allows the current user to block all of a user's existing mods from earning DP.

## Response

Returns a [BlockModsFromEarningDpMutationPayload](../types/BlockModsFromEarningDpMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userId` - [ID](../types/ID.md) | The ID of the user for whom to block mods. |

#### Example

## Query

```gql
mutation blockModsFromEarningDp($userId: ID) {
  blockModsFromEarningDp(userId: $userId) {
    success
  }
}
```

## Variables

```json
{"userId": "4"}
```

## Response

```json
{"data": {"blockModsFromEarningDp": {"success": false}}}
```
