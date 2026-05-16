# createCsamDeletionRequest

## Description

Create a new CSAM Deletion Request

## Response

Returns a [CreateCsamDeletionRequestPayload](../types/CreateCsamDeletionRequestPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `csamUrls` - [String!](../types/String.md) | List of CSAM URLs to be deleted |

#### Example

## Query

```gql
mutation createCsamDeletionRequest($csamUrls: String!) {
  createCsamDeletionRequest(csamUrls: $csamUrls) {
    csamDeletionRequest {
      ...CsamDeletionRequestFragment
    }
  }
}
```

## Variables

```json
{"csamUrls": "xyz789"}
```

## Response

```json
{
  "data": {
    "createCsamDeletionRequest": {
      "csamDeletionRequest": CsamDeletionRequest
    }
  }
}
```
