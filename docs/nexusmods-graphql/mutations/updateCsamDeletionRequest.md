# updateCsamDeletionRequest

## Description

Update the detailed status of a CSAM Deletion Request

## Response

Returns an [UpdateCsamDeletionRequestPayload](../types/UpdateCsamDeletionRequestPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [Int!](../types/Int.md) | ID of the CSAM Deletion Request to update |
| `detailedStatus` - [CsamDeletionRequestCDNResult!](../types/CsamDeletionRequestCDNResult.md) | Detailed status information for the CSAM Deletion Request |
| `cdnSecret` - [String](../types/String.md) | Secret key for CDNs to authenticate |

#### Example

## Query

```gql
mutation updateCsamDeletionRequest(
  $id: Int!,
  $detailedStatus: CsamDeletionRequestCDNResult!,
  $cdnSecret: String
) {
  updateCsamDeletionRequest(
    id: $id,
    detailedStatus: $detailedStatus,
    cdnSecret: $cdnSecret
  ) {
    csamDeletionRequest {
      ...CsamDeletionRequestFragment
    }
  }
}
```

## Variables

```json
{
  "id": 987,
  "detailedStatus": CsamDeletionRequestCDNResult,
  "cdnSecret": "xyz789"
}
```

## Response

```json
{
  "data": {
    "updateCsamDeletionRequest": {
      "csamDeletionRequest": CsamDeletionRequest
    }
  }
}
```
