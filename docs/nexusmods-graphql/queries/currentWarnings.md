# currentWarnings

## Description

Get a list of unread warnings for a user

## Response

Returns a [UserWarnings!](../types/UserWarnings.md)

#### Example

## Query

```gql
query currentWarnings {
  currentWarnings {
    unreadGlobalNotices {
      ...GlobalNoticeFragment
    }
    unreadWarnings {
      ...ModerationWarningFragment
    }
  }
}
```

## Response

```json
{
  "data": {
    "currentWarnings": {
      "unreadGlobalNotices": [GlobalNotice],
      "unreadWarnings": [ModerationWarning]
    }
  }
}
```
