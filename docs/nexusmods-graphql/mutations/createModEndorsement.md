# createModEndorsement

## Description

Creates an endorsement for a mod.

## Response

Returns a [CreateModEndorsementMutationPayload](../types/CreateModEndorsementMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `modUid` - [String!](../types/String.md) | ID of the mod the endorsement is for. |

#### Example

## Query

```gql
mutation createModEndorsement($modUid: String!) {
  createModEndorsement(modUid: $modUid) {
    endorsement {
      ...ModEndorsementFragment
    }
    success
  }
}
```

## Variables

```json
{"modUid": "xyz789"}
```

## Response

```json
{
  "data": {
    "createModEndorsement": {
      "endorsement": ModEndorsement,
      "success": true
    }
  }
}
```
