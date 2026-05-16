# updateCountry

## Description

Updates a user's country on their profile

## Response

Returns an [UpdateCountryMutationPayload](../types/UpdateCountryMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `userId` - [ID](../types/ID.md) | The user whose country to update (current user if omitted). |
| `country` - [String](../types/String.md) | ISO Country Code (can also be null) |

#### Example

## Query

```gql
mutation updateCountry(
  $userId: ID,
  $country: String
) {
  updateCountry(
    userId: $userId,
    country: $country
  ) {
    success
  }
}
```

## Variables

```json
{"userId": 4, "country": "abc123"}
```

## Response

```json
{"data": {"updateCountry": {"success": true}}}
```
