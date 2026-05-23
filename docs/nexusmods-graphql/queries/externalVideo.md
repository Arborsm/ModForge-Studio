# externalVideo

## Description

Gets an external video.

## Response

Returns an [ExternalVideo!](../types/ExternalVideo.md)

## Arguments

| Name | Description |
| --- | --- |
| `url` - [String!](../types/String.md) | The external video URL. |

#### Example

## Query

```gql
query externalVideo($url: String!) {
  externalVideo(url: $url) {
    embedUrl
    id
    platform
    thumbnailUrl
    title
  }
}
```

## Variables

```json
{"url": "abc123"}
```

## Response

```json
{
  "data": {
    "externalVideo": {
      "embedUrl": "xyz789",
      "id": "4",
      "platform": "youtube",
      "thumbnailUrl": "xyz789",
      "title": "abc123"
    }
  }
}
```
