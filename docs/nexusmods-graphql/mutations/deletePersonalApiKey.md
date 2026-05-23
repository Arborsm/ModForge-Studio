# deletePersonalApiKey

## Description

Deletes a user's personal API Key

## Response

Returns a [DeletePersonalApiKeyMutationPayload](../types/DeletePersonalApiKeyMutationPayload.md)

#### Example

## Query

```gql
mutation deletePersonalApiKey {
  deletePersonalApiKey {
    message
    success
  }
}
```

## Response

```json
{
  "data": {
    "deletePersonalApiKey": {
      "message": "xyz789",
      "success": false
    }
  }
}
```
