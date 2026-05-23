# CollectionBugReport

## Description

A collection bug report.

## Fields

| Field Name | Description |
| --- | --- |
| `attachments` - [[Attachment!]](../types/Attachment.md) | The attachment filename and IDs |
| `closedAt` - [DateTime](../types/DateTime.md) | Date that this report was changed to closed |
| `closureReason` - [BugReportClosureReason](../types/BugReportClosureReason.md) | If closed, what was the reason for closing the report |
| `collection` - [Collection!](../types/Collection.md) | A curated collection of mods |
| `collectionRevisionNumber` - [Int!](../types/Int.md) | The collection revision number. |
| `commentThread` - [CommentThread!](../types/CommentThread.md) | The comment thread for this collection bug report. |
| `createdAt` - [DateTime!](../types/DateTime.md) | Date that this report was created |
| `description` - [String](../types/String.md) | User-provided summary of the Bug Report |
| `hiddenBy` - [User](../types/User.md) | User that hid this Bug Report from public view |
| `hiddenInternalReason` - [String](../types/String.md) | If hidden, this will provide a reason. This is intended for moderators, admins and collection curators |
| `hiddenReason` - [String](../types/String.md) | If hidden, this will provide the reason |
| `id` - [ID!](../types/ID.md) | The database ID for this collection bug report. |
| `moderationJwt` - [String!](../types/String.md) | JWT token for submitting moderation reports |
| `moderationStatus` - [BugReportModerationStatus!](../types/BugReportModerationStatus.md) | If under moderation, can be none or hidden |
| `openedAt` - [DateTime](../types/DateTime.md) | Date that this report was changed to open |
| `permissions` - [[Permission!]](../types/Permission.md) | Provides a list of all permissions for this report, using the context of the current user |
| `reporter` - [User!](../types/User.md) | User that reported this Bug Report |
| `status` - [BugReportStatus!](../types/BugReportStatus.md) | Status, can be Open or Closed |
| `title` - [String!](../types/String.md) | Title of the bug report |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Date that this report was last updated |
| `viewerHasIgnored` - [Boolean!](../types/Boolean.md) | Whether the viewer has ignored the content owner. |

## Example

```json
{
  "attachments": [Attachment],
  "closedAt": "2007-12-03T10:15:30Z",
  "closureReason": "none",
  "collection": Collection,
  "collectionRevisionNumber": 987,
  "commentThread": CommentThread,
  "createdAt": "2007-12-03T10:15:30Z",
  "description": "abc123",
  "hiddenBy": User,
  "hiddenInternalReason": "xyz789",
  "hiddenReason": "xyz789",
  "id": "4",
  "moderationJwt": "abc123",
  "moderationStatus": "none",
  "openedAt": "2007-12-03T10:15:30Z",
  "permissions": [Permission],
  "reporter": User,
  "status": "open",
  "title": "xyz789",
  "updatedAt": "2007-12-03T10:15:30Z",
  "viewerHasIgnored": false
}
```
