# updateUserDonationPreferences

## Description

Updates a user's donation preferences.

## Response

Returns an [UpdateUserDonationPreferencesPayload](../types/UpdateUserDonationPreferencesPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `donateStraight` - [Boolean](../types/Boolean.md) | Whether the user has enabled straight donations. |
| `donateAuthorpremium` - [Boolean](../types/Boolean.md) | Whether the user has enabled author premium donations. |
| `donateOwnpremium` - [Boolean](../types/Boolean.md) | Whether the user has enabled own premium donations. |
| `donateProfile` - [Boolean](../types/Boolean.md) | Whether the user has enabled profile donations. |
| `donatePremiumMax` - [Int](../types/Int.md) | The maximum amount of premium time in months a user can donate. |
| `dpOptedIn` - [Boolean](../types/Boolean.md) | Whether the user has opted in to the Donation Points program. |
| `paypal` - [String](../types/String.md) | The user's PayPal email address. |

#### Example

## Query

```gql
mutation updateUserDonationPreferences(
  $donateStraight: Boolean,
  $donateAuthorpremium: Boolean,
  $donateOwnpremium: Boolean,
  $donateProfile: Boolean,
  $donatePremiumMax: Int,
  $dpOptedIn: Boolean,
  $paypal: String
) {
  updateUserDonationPreferences(
    donateStraight: $donateStraight,
    donateAuthorpremium: $donateAuthorpremium,
    donateOwnpremium: $donateOwnpremium,
    donateProfile: $donateProfile,
    donatePremiumMax: $donatePremiumMax,
    dpOptedIn: $dpOptedIn,
    paypal: $paypal
  ) {
    success
    userDonationPreferences {
      ...LegacyUserDonationPreferencesFragment
    }
  }
}
```

## Variables

```json
{
  "donateStraight": false,
  "donateAuthorpremium": false,
  "donateOwnpremium": true,
  "donateProfile": false,
  "donatePremiumMax": 123,
  "dpOptedIn": true,
  "paypal": "xyz789"
}
```

## Response

```json
{
  "data": {
    "updateUserDonationPreferences": {
      "success": true,
      "userDonationPreferences": LegacyUserDonationPreferences
    }
  }
}
```
