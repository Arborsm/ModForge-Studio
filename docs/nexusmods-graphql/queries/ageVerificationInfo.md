# ageVerificationInfo

## Description

Gets age verification info for the authenticated user

## Response

Returns an [AgeVerificationInfo!](../types/AgeVerificationInfo.md)

## Arguments

| Name | Description |
| --- | --- |
| `userId` - [ID](../types/ID.md) | The ID of the user to get age verification info for. If not provided, uses the authenticated user. |

#### Example

## Query

```gql
query ageVerificationInfo($userId: ID) {
  ageVerificationInfo(userId: $userId) {
    externalVerificationIds {
      ...AgeVerificationIdFragment
    }
    verified
  }
}
```

## Variables

```json
{"userId": 4}
```

## Response

```json
{
  "data": {
    "ageVerificationInfo": {
      "externalVerificationIds": [AgeVerificationId],
      "verified": false
    }
  }
}
```
