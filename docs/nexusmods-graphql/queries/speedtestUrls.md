# speedtestUrls

## Description

Get the urls for running a speedtest to diagnose download issues

## Response

Returns [[SpeedtestUrl!]!](../types/SpeedtestUrl.md)

#### Example

## Query

```gql
query speedtestUrls {
  speedtestUrls {
    description
    location
    tag
    title
  }
}
```

## Response

```json
{
  "data": {
    "speedtestUrls": [
      {
        "description": "abc123",
        "location": "abc123",
        "tag": "xyz789",
        "title": "abc123"
      }
    ]
  }
}
```
