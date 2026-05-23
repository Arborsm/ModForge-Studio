# issueWarningToUser

## Description

Issues a moderation warning to a user

## Response

Returns an [IssueWarningToUserMutationPayload](../types/IssueWarningToUserMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userId` - [ID!](../types/ID.md) | The database ID for this user. |
| `warning` - [FormalOrInformalWarning!](../types/FormalOrInformalWarning.md) | Whether the warning is informal or formal |
| `reason` - [String!](../types/String.md) | The reason for the warning |
| `publicReason` - [String](../types/String.md) | The public reason for the warning |
| `referenceLinks` - [[String!]](../types/String.md) | Reference links for the warning |
| `commentId` - [ID](../types/ID.md) | The database ID for this comment. |
| `restrictions` - [[ModerationRestrictionInput!]](../types/ModerationRestrictionInput.md) | Restrictions to apply to the user |

#### Example

## Query

```gql
mutation issueWarningToUser(
  $userId: ID!,
  $warning: FormalOrInformalWarning!,
  $reason: String!,
  $publicReason: String,
  $referenceLinks: [String!],
  $commentId: ID,
  $restrictions: [ModerationRestrictionInput!]
) {
  issueWarningToUser(
    userId: $userId,
    warning: $warning,
    reason: $reason,
    publicReason: $publicReason,
    referenceLinks: $referenceLinks,
    commentId: $commentId,
    restrictions: $restrictions
  ) {
    success
  }
}
```

## Variables

```json
{
  "userId": 4,
  "warning": "INFORMAL_WARNING",
  "reason": "abc123",
  "publicReason": "abc123",
  "referenceLinks": ["xyz789"],
  "commentId": 4,
  "restrictions": [ModerationRestrictionInput]
}
```

## Response

```json
{"data": {"issueWarningToUser": {"success": true}}}
```
