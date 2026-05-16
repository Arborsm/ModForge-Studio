# ModerationReason

## Description

A moderation reason

## Fields

| Field Name | Description |
| --- | --- |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this moderation reason was first created. |
| `id` - [ID!](../types/ID.md) | The database ID for this moderation reason. |
| `reason` - [String!](../types/String.md) | Reason for moderation |
| `resolution` - [String](../types/String.md) | Resolution of the moderation |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this moderation reason was last updated. |

## Example

```json
{
  "createdAt": "2007-12-03T10:15:30Z",
  "id": "4",
  "reason": "abc123",
  "resolution": "abc123",
  "updatedAt": "2007-12-03T10:15:30Z"
}
```
