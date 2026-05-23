# csamHashCheck

## Description

Check MD5 hashes against the latest successful CSAM known image hashlist

## Response

Returns [[HashCheckResult!]!](../types/HashCheckResult.md)

## Arguments

| Name | Description |
| --- | --- |
| `md5Hashes` - [[String!]!](../types/String.md) | Array of MD5 hashes to check against the CSAM hashlist |

#### Example

## Query

```gql
query csamHashCheck($md5Hashes: [String!]!) {
  csamHashCheck(md5Hashes: $md5Hashes) {
    hashValue
    match
  }
}
```

## Variables

```json
{"md5Hashes": ["xyz789"]}
```

## Response

```json
{
  "data": {
    "csamHashCheck": [
      {"hashValue": "xyz789", "match": true}
    ]
  }
}
```
