# amendModeration

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Updates existing Moderation entity. Used to update details about the moderation or to unlock it.

## Response

Returns an [AmendModerationMutationPayload](../types/AmendModerationMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | ID of the Moderation entity |
| `userNote` - [String](../types/String.md) | Note displayed to the end user. |
| `staffNote` - [String](../types/String.md) | Note displayed to internally to staff members. |
| `editable` - [Boolean](../types/Boolean.md) | Enable or disable editing of the entity. |
| `unlocked` - [Boolean](../types/Boolean.md) | When TRUE, the entity will no longer be moderated. |
| `unlockedNote` - [String](../types/String.md) | Note for the end user when moderation is unlocked |
| `collectionStatus` - [CollectionStatus](../types/CollectionStatus.md) | Change collection status upon amending the moderation. |
| `moderationReasonId` - [ID](../types/ID.md) | Change moderation reason. |

#### Example

## Query

```gql
mutation amendModeration(
  $id: ID!,
  $userNote: String,
  $staffNote: String,
  $editable: Boolean,
  $unlocked: Boolean,
  $unlockedNote: String,
  $collectionStatus: CollectionStatus,
  $moderationReasonId: ID
) {
  amendModeration(
    id: $id,
    userNote: $userNote,
    staffNote: $staffNote,
    editable: $editable,
    unlocked: $unlocked,
    unlockedNote: $unlockedNote,
    collectionStatus: $collectionStatus,
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
  "id": "4",
  "userNote": "xyz789",
  "staffNote": "abc123",
  "editable": false,
  "unlocked": false,
  "unlockedNote": "xyz789",
  "collectionStatus": "listed",
  "moderationReasonId": 4
}
```

## Response

```json
{
  "data": {
    "amendModeration": {
      "moderation": Moderation,
      "success": true
    }
  }
}
```
