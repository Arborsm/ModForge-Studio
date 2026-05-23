# moderationReason

## Description

Get a Moderation Reason by ID

## Response

Returns a [ModerationReason](../types/ModerationReason.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | The database ID for this moderation reason. |

#### Example

## Query

```gql
query moderationReason($id: ID!) {
  moderationReason(id: $id) {
    createdAt
    id
    reason
    resolution
    updatedAt
  }
}
```

## Variables

```json
{"id": 4}
```

## Response

```json
{
  "data": {
    "moderationReason": {
      "createdAt": "2007-12-03T10:15:30Z",
      "id": "4",
      "reason": "xyz789",
      "resolution": "xyz789",
      "updatedAt": "2007-12-03T10:15:30Z"
    }
  }
}
```
