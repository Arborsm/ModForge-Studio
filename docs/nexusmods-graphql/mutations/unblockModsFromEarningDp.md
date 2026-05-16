# unblockModsFromEarningDp

## Description

Allows the current user to unblock all of a user's existing mods from earning DP.

## Response

Returns an [UnblockModsFromEarningDpMutationPayload](../types/UnblockModsFromEarningDpMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userId` - [ID](../types/ID.md) | The ID of the user for whom to unblock mods. |

#### Example

## Query

```gql
mutation unblockModsFromEarningDp($userId: ID) {
  unblockModsFromEarningDp(userId: $userId) {
    success
  }
}
```

## Variables

```json
{"userId": 4}
```

## Response

```json
{"data": {"unblockModsFromEarningDp": {"success": false}}}
```
