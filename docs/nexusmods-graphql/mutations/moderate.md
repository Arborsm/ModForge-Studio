# moderate

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Sets a collection as `under_moderation`, allowing the user to provide a reason and the ability to 'lock' the collection against future editing. User must have the `collection:moderate` permission.

## Response

Returns a [ModerateMutationPayload](../types/ModerateMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | Moderatable ID - ID of the object intended to be moderated |
| `type` - [Moderatable!](../types/Moderatable.md) | Moderatable type |
| `userNote` - [String](../types/String.md) | Moderation note visible to the user |
| `staffNote` - [String](../types/String.md) | Moderation note only visible to staff |
| `editable` - [Boolean](../types/Boolean.md) | If true, this entity cannot be edited by the author |
| `moderationReasonId` - [ID!](../types/ID.md) | The database ID for this moderation reason. |

#### Example

## Query

```gql
mutation moderate(
  $id: ID!,
  $type: Moderatable!,
  $userNote: String,
  $staffNote: String,
  $editable: Boolean,
  $moderationReasonId: ID!
) {
  moderate(
    id: $id,
    type: $type,
    userNote: $userNote,
    staffNote: $staffNote,
    editable: $editable,
    moderationReasonId: $moderationReasonId
  ) {
    moderation {
      ...ModerationFragment
    }
    success
  }
}
```

## Variables

```json
{
  "id": 4,
  "type": "Collection",
  "userNote": "abc123",
  "staffNote": "xyz789",
  "editable": true,
  "moderationReasonId": "4"
}
```

## Response

```json
{
  "data": {
    "moderate": {
      "moderation": Moderation,
      "success": true
    }
  }
}
```
