# rejectModerationFix

## Description

Marks the moderation fix as rejected. The collection status is not changed. Only collection moderators can call this mutation

## Response

Returns a [RejectModerationFixMutationPayload](../types/RejectModerationFixMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `moderationFixId` - [ID!](../types/ID.md) | The database ID for this moderation fix. |

#### Example

## Query

```gql
mutation rejectModerationFix($moderationFixId: ID!) {
  rejectModerationFix(moderationFixId: $moderationFixId) {
    moderationFix {
      ...ModerationFixFragment
    }
    success
  }
}
```

## Variables

```json
{"moderationFixId": "4"}
```

## Response

```json
{
  "data": {
    "rejectModerationFix": {
      "moderationFix": ModerationFix,
      "success": false
    }
  }
}
```
