# applications

## Description

Get a list of modding applications (accessed via API keys)

## Response

Returns [[ApiApplication!]](../types/ApiApplication.md)

#### Example

## Query

```gql
query applications {
  applications {
    active
    id
    image
    key
    name
    slug
    summary
  }
}
```

## Response

```json
{
  "data": {
    "applications": [
      {
        "active": true,
        "id": "4",
        "image": "xyz789",
        "key": "abc123",
        "name": "xyz789",
        "slug": "abc123",
        "summary": "xyz789"
      }
    ]
  }
}
```
