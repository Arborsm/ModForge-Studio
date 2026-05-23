# ModerationFix

## Description

A moderation fix submission

## Fields

| Field Name | Description |
| --- | --- |
| `author` - [User!](../types/User.md) | User who authored this moderation fix |
| `authorId` - [ID!](../types/ID.md) | ID of the user who authored this moderation fix |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this moderation fix was first created. |
| `description` - [String](../types/String.md) | Description of this moderation fix |
| `id` - [ID!](../types/ID.md) | The database ID for this moderation fix. |
| `moderation` - [Moderation!](../types/Moderation.md) | Type of moderation fix |
| `status` - [ModerationFixStatus!](../types/ModerationFixStatus.md) | Status of this moderation fix |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this moderation fix was last updated. |

## Example

```json
{
  "author": User,
  "authorId": "4",
  "createdAt": "2007-12-03T10:15:30Z",
  "description": "xyz789",
  "id": "4",
  "moderation": Moderation,
  "status": "submitted",
  "updatedAt": "2007-12-03T10:15:30Z"
}
```
