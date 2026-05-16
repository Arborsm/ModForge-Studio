# writeFullPageNotificationToUser

## Description

Writes a full page notification to a user

## Response

Returns a [WriteFullPageNotificationToUserMutationPayload](../types/WriteFullPageNotificationToUserMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userId` - [ID!](../types/ID.md) | The database ID for this user. |
| `title` - [String!](../types/String.md) | The full page notification title |
| `message` - [String!](../types/String.md) | The full page notification message |
| `referenceLinks` - [[String!]](../types/String.md) | The full page notification reference links |

#### Example

## Query

```gql
mutation writeFullPageNotificationToUser(
  $userId: ID!,
  $title: String!,
  $message: String!,
  $referenceLinks: [String!]
) {
  writeFullPageNotificationToUser(
    userId: $userId,
    title: $title,
    message: $message,
    referenceLinks: $referenceLinks
  ) {
    success
  }
}
```

## Variables

```json
{
  "userId": "4",
  "title": "abc123",
  "message": "xyz789",
  "referenceLinks": ["xyz789"]
}
```

## Response

```json
{"data": {"writeFullPageNotificationToUser": {"success": false}}}
```
