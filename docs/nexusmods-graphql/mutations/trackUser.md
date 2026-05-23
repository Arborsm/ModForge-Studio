# trackUser

## Description

Allows the current user to track another user

## Response

Returns a [TrackUserMutationPayload](../types/TrackUserMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `trackedUserId` - [ID](../types/ID.md) | The ID of the user to be tracked. |

#### Example

## Query

```gql
mutation trackUser($trackedUserId: ID) {
  trackUser(trackedUserId: $trackedUserId) {
    success
  }
}
```

## Variables

```json
{"trackedUserId": 4}
```

## Response

```json
{"data": {"trackUser": {"success": true}}}
```
