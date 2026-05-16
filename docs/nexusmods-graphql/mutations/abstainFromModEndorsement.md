# abstainFromModEndorsement

## Description

Abstains from mod endorsement.

## Response

Returns an [AbstainFromModEndorsementMutationPayload](../types/AbstainFromModEndorsementMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `modUid` - [String!](../types/String.md) | ID of the mod the endorsement is for. |

#### Example

## Query

```gql
mutation abstainFromModEndorsement($modUid: String!) {
  abstainFromModEndorsement(modUid: $modUid) {
    endorsement {
      ...ModEndorsementFragment
    }
    success
  }
}
```

## Variables

```json
{"modUid": "abc123"}
```

## Response

```json
{
  "data": {
    "abstainFromModEndorsement": {
      "endorsement": ModEndorsement,
      "success": true
    }
  }
}
```
