# badges

## Description

Get a list of badges

## Response

Returns [[Badge!]!](../types/Badge.md)

#### Example

## Query

```gql
query badges {
  badges {
    automated
    description
    id
    name
  }
}
```

## Response

```json
{
  "data": {
    "badges": [
      {
        "automated": false,
        "description": "xyz789",
        "id": 987,
        "name": "xyz789"
      }
    ]
  }
}
```
