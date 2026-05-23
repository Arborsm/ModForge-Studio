# untrackUser

## Description

Makes the current user stop tracking another user

## Response

Returns an [UntrackUserMutationPayload](../types/UntrackUserMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `trackedUserId` - [ID](../types/ID.md) | The ID of the user to stop tracking. |

#### Example

## Query

```gql
mutation untrackUser($trackedUserId: ID) {
  untrackUser(trackedUserId: $trackedUserId) {
    success
  }
}
```

## Variables

```json
{"trackedUserId": "4"}
```

## Response

```json
{"data": {"untrackUser": {"success": false}}}
```
