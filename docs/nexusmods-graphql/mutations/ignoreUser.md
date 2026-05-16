# ignoreUser

## Description

Ignores a specific user for the current user.

## Response

Returns an [IgnoreUserMutationPayload](../types/IgnoreUserMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userName` - [String](../types/String.md) | The username of the user to block (this or user_id must be set) |
| `userId` - [ID](../types/ID.md) | The ID of the user to block (this or user_name must be set). |

#### Example

## Query

```gql
mutation ignoreUser(
  $userName: String,
  $userId: ID
) {
  ignoreUser(
    userName: $userName,
    userId: $userId
  ) {
    success
  }
}
```

## Variables

```json
{"userName": "xyz789", "userId": 4}
```

## Response

```json
{"data": {"ignoreUser": {"success": true}}}
```
