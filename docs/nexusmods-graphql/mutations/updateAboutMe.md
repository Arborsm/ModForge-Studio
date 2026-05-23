# updateAboutMe

## Description

Updates a user's bio (About Me) on their profile

## Response

Returns an [UpdateAboutMeMutationPayload](../types/UpdateAboutMeMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userId` - [ID](../types/ID.md) | The user whose bio we are updating (or current user if nil). |
| `about` - [String!](../types/String.md) | The new text for the about me section in bio. |

#### Example

## Query

```gql
mutation updateAboutMe(
  $userId: ID,
  $about: String!
) {
  updateAboutMe(
    userId: $userId,
    about: $about
  ) {
    success
  }
}
```

## Variables

```json
{"userId": 4, "about": "xyz789"}
```

## Response

```json
{"data": {"updateAboutMe": {"success": false}}}
```
