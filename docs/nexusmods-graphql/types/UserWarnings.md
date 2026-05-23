# UserWarnings

## Description

A return type for the current warnings query

## Fields

| Field Name | Description |
| --- | --- |
| `unreadGlobalNotices` - [[GlobalNotice!]!](../types/GlobalNotice.md) | List of unread global notices |
| `unreadWarnings` - [[ModerationWarning!]!](../types/ModerationWarning.md) | List of unread warnings |

## Example

```json
{
  "unreadGlobalNotices": [GlobalNotice],
  "unreadWarnings": [ModerationWarning]
}
```
