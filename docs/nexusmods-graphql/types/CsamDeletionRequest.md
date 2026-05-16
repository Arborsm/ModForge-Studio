# CsamDeletionRequest

## Description

A CSAM Deletion Request

## Fields

| Field Name | Description |
| --- | --- |
| `createdAt` - [DateTime!](../types/DateTime.md) | Timestamp when the request was created |
| `csamUrls` - [String!](../types/String.md) | List of CSAM URL IDs to be deleted |
| `id` - [ID!](../types/ID.md) | ID of the CSAM Deletion Request |
| `requesterMemberId` - [ID!](../types/ID.md) | ID of the user who made the request |
| `status` - [CsamDeletionRequestStatus!](../types/CsamDeletionRequestStatus.md) | Current status of the request |

## Example

```json
{
  "createdAt": "2007-12-03T10:15:30Z",
  "csamUrls": "xyz789",
  "id": "4",
  "requesterMemberId": 4,
  "status": "PENDING"
}
```
