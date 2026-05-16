# startAgeVerificationAppealFlow

## Description

Starts the age verification appeal flow for the current user.

## Response

Returns a [StartAgeVerificationFlowResponse!](../types/StartAgeVerificationFlowResponse.md)

#### Example

## Query

```gql
query startAgeVerificationAppealFlow {
  startAgeVerificationAppealFlow {
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
    "startAgeVerificationAppealFlow": {
      "message": "xyz789",
      "success": true,
      "verificationResult": VerificationResult
    }
  }
}
```
