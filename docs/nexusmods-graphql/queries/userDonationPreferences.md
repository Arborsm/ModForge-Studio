# userDonationPreferences

## Description

Get a list of user donation preferences.

## Response

Returns a [LegacyUserDonationPreferences](../types/LegacyUserDonationPreferences.md)

#### Example

## Query

```gql
query userDonationPreferences {
  userDonationPreferences {
    donateAuthorpremium
    donateOwnpremium
    donatePremiumMax
    donateProfile
    donateStraight
    id
    paypal
  }
}
```

## Response

```json
{
  "data": {
    "userDonationPreferences": {
      "donateAuthorpremium": true,
      "donateOwnpremium": false,
      "donatePremiumMax": 987,
      "donateProfile": true,
      "donateStraight": true,
      "id": 4,
      "paypal": "xyz789"
    }
  }
}
```
