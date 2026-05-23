# unblockAuthor

## Description

Unignore a specific author for the current user.

## Response

Returns an [UnblockUserMutationPayload](../types/UnblockUserMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userName` - [String](../types/String.md) | The username of the user to unignore (this or user_id must be set). |
| `userId` - [ID](../types/ID.md) | The ID of the author to unignore (this or user_name must be set). |
| `authorName` - [String](../types/String.md) | This is an alias for userName. |
| `authorId` - [ID](../types/ID.md) | This is an alias for userId. |

#### Example

## Query

```gql
mutation unblockAuthor(
  $userName: String,
  $userId: ID,
  $authorName: String,
  $authorId: ID
) {
  unblockAuthor(
    userName: $userName,
    userId: $userId,
    authorName: $authorName,
    authorId: $authorId
  ) {
    success
  }
}
```

## Variables

```json
{
  "userName": "xyz789",
  "userId": "4",
  "authorName": "xyz789",
  "authorId": 4
}
```

## Response

```json
{"data": {"unblockAuthor": {"success": false}}}
```
