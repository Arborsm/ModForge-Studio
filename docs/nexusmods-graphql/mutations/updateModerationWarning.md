# updateModerationWarning

## Description

Updates a users moderation warning

## Response

Returns a [LegacyUpdateModerationWarningMutationPayload](../types/LegacyUpdateModerationWarningMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `moderationWarningId` - [ID!](../types/ID.md) | The database ID for this moderation warning. |
| `isRead` - [Boolean!](../types/Boolean.md) | Whether the moderation warning has been read / acknowledged |

#### Example

## Query

```gql
mutation updateModerationWarning(
  $moderationWarningId: ID!,
  $isRead: Boolean!
) {
  updateModerationWarning(
    moderationWarningId: $moderationWarningId,
    isRead: $isRead
  ) {
    success
  }
}
```

## Variables

```json
{"moderationWarningId": 4, "isRead": false}
```

## Response

```json
{"data": {"updateModerationWarning": {"success": true}}}
```
