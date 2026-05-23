# StartAgeVerificationFlowResponse

## Description

The gql result of a query to the age verification flow start.

## Fields

| Field Name | Description |
| --- | --- |
| `message` - [String](../types/String.md) | A message providing additional context about the request. |
| `success` - [Boolean!](../types/Boolean.md) | True if the request to start the age verification flow was successful. |
| `verificationResult` - [VerificationResult!](../types/VerificationResult.md) | The result of the age verification call. |

## Example

```json
{
  "message": "xyz789",
  "success": false,
  "verificationResult": VerificationResult
}
```
