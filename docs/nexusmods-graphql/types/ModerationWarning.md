# ModerationWarning

## Description

A moderation_warning

## Fields

| Field Name | Description |
| --- | --- |
| `category` - [ModerationWarningCategoryEnum!](../types/ModerationWarningCategoryEnum.md) | Category Id |
| `date` - [Int!](../types/Int.md) | Unix timestamp of moderation warning date |
| `id` - [ID!](../types/ID.md) | The database ID for this moderation warning. |
| `isRead` - [Boolean!](../types/Boolean.md) | Has been read |
| `link` - [String!](../types/String.md) | Moderation warning link |
| `moderationWarningRestrictions` - [ModerationWarningRestrictionConnection](../types/ModerationWarningRestrictionConnection.md) | A moderation restriction |
| Arguments `after` - [String](../types/String.md) Returns the elements in the list that come after the specified cursor. `before` - [String](../types/String.md) Returns the elements in the list that come before the specified cursor. `first` - [Int](../types/Int.md) Returns the first *n* elements from the list. `last` - [Int](../types/Int.md) Returns the last *n* elements from the list. |  |
| `post` - [ForumPost](../types/ForumPost.md) | Forum post linked to warning |
| `postId` - [ID](../types/ID.md) | Post id of moderation warning |
| `publicReason` - [String](../types/String.md) | Public reason |
| `reason` - [String!](../types/String.md) | Reason for moderation warning |
| `removedBy` - [ID](../types/ID.md) | User id who removed moderation warning |
| `removedDate` - [Int](../types/Int.md) | Removed date of moderation warning |
| `removedReason` - [String](../types/String.md) | Removed reason |
| `staff` - [User!](../types/User.md) | Issuer of warning |
| `user` - [User!](../types/User.md) | User warning has been applied to |

## Example

```json
{
  "category": "INFORMAL_WARNING",
  "date": 987,
  "id": "4",
  "isRead": false,
  "link": "abc123",
  "moderationWarningRestrictions": ModerationWarningRestrictionConnection,
  "post": ForumPost,
  "postId": 4,
  "publicReason": "xyz789",
  "reason": "xyz789",
  "removedBy": 4,
  "removedDate": 123,
  "removedReason": "abc123",
  "staff": User,
  "user": User
}
```
