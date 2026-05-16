# giveKudos

## Description

Allows the current user to give kudos to another user

## Response

Returns a [GiveKudosMutationPayload](../types/GiveKudosMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `kudosUserId` - [ID](../types/ID.md) | The ID of the user to give kudos to. |

#### Example

## Query

```gql
mutation giveKudos($kudosUserId: ID) {
  giveKudos(kudosUserId: $kudosUserId) {
    success
  }
}
```

## Variables

```json
{"kudosUserId": "4"}
```

## Response

```json
{"data": {"giveKudos": {"success": false}}}
```
