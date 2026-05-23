# csamDeletionRequests

## Description

Get all CSAM Deletion Requests

## Response

Returns [[CsamDeletionRequest!]!](../types/CsamDeletionRequest.md)

## Arguments

| Name | Description |
| --- | --- |
| `status` - [CsamDeletionRequestStatus](../types/CsamDeletionRequestStatus.md) | Filter by status of the request |
| `cdnSecret` - [String](../types/String.md) | Secret key for CDNs to authenticate |

#### Example

## Query

```gql
query csamDeletionRequests(
  $status: CsamDeletionRequestStatus,
  $cdnSecret: String
) {
  csamDeletionRequests(
    status: $status,
    cdnSecret: $cdnSecret
  ) {
    createdAt
    csamUrls
    id
    requesterMemberId
    status
  }
}
```

## Variables

```json
{"status": "PENDING", "cdnSecret": "abc123"}
```

## Response

```json
{
  "data": {
    "csamDeletionRequests": [
      {
        "createdAt": "2007-12-03T10:15:30Z",
        "csamUrls": "abc123",
        "id": "4",
        "requesterMemberId": "4",
        "status": "PENDING"
      }
    ]
  }
}
```
