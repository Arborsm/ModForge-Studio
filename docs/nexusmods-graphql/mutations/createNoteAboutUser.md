# createNoteAboutUser

## Description

Creates a moderation note about a user

## Response

Returns a [CreateNoteAboutUserMutationPayload](../types/CreateNoteAboutUserMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userId` - [ID!](../types/ID.md) | The database ID for this user. |
| `note` - [String!](../types/String.md) | The moderation note |

#### Example

## Query

```gql
mutation createNoteAboutUser(
  $userId: ID!,
  $note: String!
) {
  createNoteAboutUser(
    userId: $userId,
    note: $note
  ) {
    success
  }
}
```

## Variables

```json
{"userId": 4, "note": "xyz789"}
```

## Response

```json
{"data": {"createNoteAboutUser": {"success": true}}}
```
