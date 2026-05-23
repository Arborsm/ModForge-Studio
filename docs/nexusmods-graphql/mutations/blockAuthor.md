# blockAuthor

                   This mutation will be replaced with ignore_user mutation

## Description

Ignores a specific user for the current user.

## Response

Returns a [BlockUserMutationPayload](../types/BlockUserMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userName` - [String](../types/String.md) | The username of the user to block (this or user_id must be set) |
| `userId` - [ID](../types/ID.md) | The ID of the user to block (this or user_name must be set). |
| `authorName` - [String](../types/String.md) | This is an alias for userName. |
| `authorId` - [ID](../types/ID.md) | This is an alias for userId. |

#### Example

## Query

```gql
mutation blockAuthor(
  $userName: String,
  $userId: ID,
  $authorName: String,
  $authorId: ID
) {
  blockAuthor(
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
  "userName": "abc123",
  "userId": "4",
  "authorName": "abc123",
  "authorId": "4"
}
```

## Response

```json
{"data": {"blockAuthor": {"success": false}}}
```
