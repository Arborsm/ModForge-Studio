# collectionRevisionUploadUrl

## Description

Get a pre-signed upload URL for B2

## Response

Returns a [PresignedUrl!](../types/PresignedUrl.md)

#### Example

## Query

```gql
query collectionRevisionUploadUrl {
  collectionRevisionUploadUrl {
    url
    uuid
  }
}
```

## Response

```json
{
  "data": {
    "collectionRevisionUploadUrl": {
      "url": "xyz789",
      "uuid": "xyz789"
    }
  }
}
```
