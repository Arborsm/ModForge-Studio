# LegacyUserDonationPreferences

## Description

A set of user donation preferences.

## Fields

| Field Name | Description |
| --- | --- |
| `donateAuthorpremium` - [Boolean!](../types/Boolean.md) | Whether the user has enabled author premium donations. |
| `donateOwnpremium` - [Boolean!](../types/Boolean.md) | Whether the user has enabled own premium donations. |
| `donatePremiumMax` - [Int!](../types/Int.md) | The maximum amount of premium time in months a user can donate (0 is Lifetime, or no limit). |
| `donateProfile` - [Boolean!](../types/Boolean.md) | Whether the user has enabled profile donations. |
| `donateStraight` - [Boolean!](../types/Boolean.md) | Whether the user has enabled straight donations. |
| `id` - [ID!](../types/ID.md) | ID of the object. |
| `paypal` - [String!](../types/String.md) | The user's PayPal email address. |

## Example

```json
{
  "donateAuthorpremium": false,
  "donateOwnpremium": true,
  "donatePremiumMax": 987,
  "donateProfile": true,
  "donateStraight": true,
  "id": 4,
  "paypal": "xyz789"
}
```
