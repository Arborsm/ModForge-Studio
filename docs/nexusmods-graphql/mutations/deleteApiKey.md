# deleteApiKey

## Description

Deletes a user's API Key

## Response

Returns a [DeleteApiKeyMutationPayload](../types/DeleteApiKeyMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `applicationId` - [ID!](../types/ID.md) | The application to delete the key for. |

#### Example

## Query

```gql
mutation deleteApiKey($applicationId: ID!) {
  deleteApiKey(applicationId: $applicationId) {
    message
    success
  }
}
```

## Variables

```json
{"applicationId": 4}
```

## Response

```json
{
  "data": {
    "deleteApiKey": {
      "message": "abc123",
      "success": true
    }
  }
}
```
