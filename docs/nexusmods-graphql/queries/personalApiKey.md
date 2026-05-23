# personalApiKey

## Description

Get the personal API access key for a current user

## Response

Returns an [ApiKey](../types/ApiKey.md)

#### Example

## Query

```gql
query personalApiKey {
  personalApiKey {
    applicationId
    id
    key
    userId
  }
}
```

## Response

```json
{
  "data": {
    "personalApiKey": {
      "applicationId": 4,
      "id": "4",
      "key": "xyz789",
      "userId": 987
    }
  }
}
```
