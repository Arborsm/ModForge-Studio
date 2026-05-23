# AgeVerificationInfo

## Description

An age verification log entry for a user.

## Fields

| Field Name | Description |
| --- | --- |
| `externalVerificationIds` - [[AgeVerificationId!]!](../types/AgeVerificationId.md) | An array of external age verification. Newest first. |
| `verified` - [Boolean!](../types/Boolean.md) | Indicates if the user has successfully verified their age. |

## Example

```json
{
  "externalVerificationIds": [AgeVerificationId],
  "verified": true
}
```
