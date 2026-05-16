# startAgeVerificationFlow

## Description

Starts the age verification flow for the current user.

## Response

Returns a [StartAgeVerificationFlowResponse!](../types/StartAgeVerificationFlowResponse.md)

#### Example

## Query

```gql
query startAgeVerificationFlow {
  startAgeVerificationFlow {
    message
    success
    verificationResult {
      ...VerificationResultFragment
    }
  }
}
```

## Response

```json
{
  "data": {
    "startAgeVerificationFlow": {
      "message": "abc123",
      "success": true,
      "verificationResult": VerificationResult
    }
  }
}
```
