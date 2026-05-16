# Moderation

## Description

A moderation entry

## Fields

| Field Name | Description |
| --- | --- |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this moderation was first created. |
| `editable` - [Boolean!](../types/Boolean.md) | If true, this moderation entry can be edited |
| `id` - [ID!](../types/ID.md) | The database ID for this moderation. |
| `moderatableId` - [ID!](../types/ID.md) | Polymorphic ID of the entity that is being moderated |
| `moderatableType` - [Moderatable!](../types/Moderatable.md) | Polymorphic Type of the entity that is being moderated |
| `moderationFixes` - [[ModerationFix!]](../types/ModerationFix.md) | Array of fixes applied for this moderation |
| `moderationReason` - [ModerationReason!](../types/ModerationReason.md) | Reason for placing this entity into moderation |
| `staffId` - [ID!](../types/ID.md) | The database ID for this staff member. |
| `staffNote` - [String](../types/String.md) | Content for the staff note |
| `unlockedAt` - [DateTime](../types/DateTime.md) | Date this entity was unlocked |
| `unlockedBy` - [ID](../types/ID.md) | User that unlocked this entity |
| `unlockedNote` - [String](../types/String.md) | Content for the message to show when unlocked |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this moderation was last updated. |
| `user` - [User!](../types/User.md) | Staff member that put this entity into moderation |
| `userNote` - [String](../types/String.md) | Content for the user note |

## Example

```json
{
  "createdAt": "2007-12-03T10:15:30Z",
  "editable": false,
  "id": "4",
  "moderatableId": 4,
  "moderatableType": "Collection",
  "moderationFixes": [ModerationFix],
  "moderationReason": ModerationReason,
  "staffId": 4,
  "staffNote": "xyz789",
  "unlockedAt": "2007-12-03T10:15:30Z",
  "unlockedBy": 4,
  "unlockedNote": "xyz789",
  "updatedAt": "2007-12-03T10:15:30Z",
  "user": User,
  "userNote": "abc123"
}
```
