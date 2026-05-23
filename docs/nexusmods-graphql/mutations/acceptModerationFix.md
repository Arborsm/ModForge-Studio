# acceptModerationFix

## Description

Marks the fix as accepted and takes the collection out of moderation. Only collection moderators can call this mutation

## Response

Returns an [AcceptModerationFixMutationPayload](../types/AcceptModerationFixMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `moderationFixId` - [ID!](../types/ID.md) | The database ID for this moderation fix. |

#### Example

## Query

```gql
mutation acceptModerationFix($moderationFixId: ID!) {
  acceptModerationFix(moderationFixId: $moderationFixId) {
    moderationFix {
      ...ModerationFixFragment
    }
    success
  }
}
```

## Variables

```json
{"moderationFixId": 4}
```

## Response

```json
{
  "data": {
    "acceptModerationFix": {
      "moderationFix": ModerationFix,
      "success": false
    }
  }
}
```
