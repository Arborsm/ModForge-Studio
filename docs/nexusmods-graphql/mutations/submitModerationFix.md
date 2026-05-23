# submitModerationFix

## Description

Submits a moderation fix against a moderation that is pending acceptance

## Response

Returns a [SubmitModerationFixMutationPayload](../types/SubmitModerationFixMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `moderationId` - [ID!](../types/ID.md) | The database ID for this moderation fix. |
| `description` - [String](../types/String.md) | Additional information from the curation for this fix |

#### Example

## Query

```gql
mutation submitModerationFix(
  $moderationId: ID!,
  $description: String
) {
  submitModerationFix(
    moderationId: $moderationId,
    description: $description
  ) {
    moderationFix {
      ...ModerationFixFragment
    }
    success
  }
}
```

## Variables

```json
{"moderationId": 4, "description": "xyz789"}
```

## Response

```json
{
  "data": {
    "submitModerationFix": {
      "moderationFix": ModerationFix,
      "success": true
    }
  }
}
```
