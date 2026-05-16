# removeKudos

## Description

Allows the current user to remove kudos from another user

## Response

Returns a [RemoveKudosMutationPayload](../types/RemoveKudosMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `kudosUserId` - [ID](../types/ID.md) | The ID of the user to remove kudos from. |

#### Example

## Query

```gql
mutation removeKudos($kudosUserId: ID) {
  removeKudos(kudosUserId: $kudosUserId) {
    success
  }
}
```

## Variables

```json
{"kudosUserId": 4}
```

## Response

```json
{"data": {"removeKudos": {"success": true}}}
```
