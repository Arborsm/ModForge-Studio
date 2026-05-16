# createApiKey

## Description

Creates an API Key for a user

## Response

Returns a [CreateApiKeyMutationPayload](../types/CreateApiKeyMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `applicationId` - [ID](../types/ID.md) | The application to create the key for. Pass null to create a personal API key. |

#### Example

## Query

```gql
mutation createApiKey($applicationId: ID) {
  createApiKey(applicationId: $applicationId) {
    apiKey {
      ...ApiKeyFragment
    }
    success
  }
}
```

## Variables

```json
{"applicationId": "4"}
```

## Response

```json
{
  "data": {
    "createApiKey": {"apiKey": ApiKey, "success": false}
  }
}
```
