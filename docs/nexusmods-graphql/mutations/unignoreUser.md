# unignoreUser

## Description

Unignore a specific author for the current user.

## Response

Returns a [UnignoreUserMutationPayload](../types/UnignoreUserMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userName` - [String](../types/String.md) | The username of the user to unignore (this or user_id must be set). |
| `userId` - [ID](../types/ID.md) | The ID of the author to unignore (this or user_name must be set). |

#### Example

## Query

```gql
mutation unignoreUser(
  $userName: String,
  $userId: ID
) {
  unignoreUser(
    userName: $userName,
    userId: $userId
  ) {
    success
  }
}
```

## Variables

```json
{"userName": "abc123", "userId": 4}
```

## Response

```json
{"data": {"unignoreUser": {"success": false}}}
```
