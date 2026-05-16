# moderationReasons

## Description

Get a list of Moderation Reasons

## Response

Returns [[ModerationReason!]](../types/ModerationReason.md)

#### Example

## Query

```gql
query moderationReasons {
  moderationReasons {
    createdAt
    id
    reason
    resolution
    updatedAt
  }
}
```

## Response

```json
{
  "data": {
    "moderationReasons": [
      {
        "createdAt": "2007-12-03T10:15:30Z",
        "id": "4",
        "reason": "abc123",
        "resolution": "xyz789",
        "updatedAt": "2007-12-03T10:15:30Z"
      }
    ]
  }
}
```
