# endorse

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Creates an endorsement for a generic Endorsable model. TODO: This will be moving to a model-specific mutation

## Response

Returns a [CreateEndorsementMutationPayload](../types/CreateEndorsementMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `abstain` - [Boolean](../types/Boolean.md) | Used to determine whether the endorsement entry is used for abstaining. Users that abstain from endorsing a file will not get send future endorsement reminders. |
| `modelId` - [Int!](../types/Int.md) | ID of an entity the endorsement is for. |
| `modelType` - [String!](../types/String.md) | Type of an entity the endorsement is for. |

#### Example

## Query

```gql
mutation endorse(
  $abstain: Boolean,
  $modelId: Int!,
  $modelType: String!
) {
  endorse(
    abstain: $abstain,
    modelId: $modelId,
    modelType: $modelType
  ) {
    endorsement {
      ...EndorsementFragment
    }
    success
  }
}
```

## Variables

```json
{
  "abstain": true,
  "modelId": 987,
  "modelType": "abc123"
}
```

## Response

```json
{
  "data": {
    "endorse": {
      "endorsement": Endorsement,
      "success": true
    }
  }
}
```
