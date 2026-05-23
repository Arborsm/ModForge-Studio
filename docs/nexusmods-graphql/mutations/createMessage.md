# createMessage

## Description

Create a new message

## Response

Returns a [CreateMessagePayload](../types/CreateMessagePayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `to` - [[Int!]!](../types/Int.md) | User IDs of recipients |
| `title` - [String!](../types/String.md) | Title of message |
| `body` - [String!](../types/String.md) | Body of message |

#### Example

## Query

```gql
mutation createMessage(
  $to: [Int!]!,
  $title: String!,
  $body: String!
) {
  createMessage(
    to: $to,
    title: $title,
    body: $body
  ) {
    success
  }
}
```

## Variables

```json
{
  "to": [987],
  "title": "xyz789",
  "body": "xyz789"
}
```

## Response

```json
{"data": {"createMessage": {"success": false}}}
```
