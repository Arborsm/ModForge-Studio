# requestMediaUploadUrl

## Description

Get a pre-signed upload URL. You must supply EITHER mimeType (preferred) or filename.

## Response

Returns a [PresignedUrl!](../types/PresignedUrl.md)

## Arguments

| Name | Description |
| --- | --- |
| `filename` - [String](../types/String.md) | Local filename of the file to be uploaded. DEPRECATED- prefer mimeType. |
| `mimeType` - [String](../types/String.md) | MIME type of the file to be uploaded. |

#### Example

## Query

```gql
query requestMediaUploadUrl(
  $filename: String,
  $mimeType: String
) {
  requestMediaUploadUrl(
    filename: $filename,
    mimeType: $mimeType
  ) {
    url
    uuid
  }
}
```

## Variables

```json
{
  "filename": "xyz789",
  "mimeType": "xyz789"
}
```

## Response

```json
{
  "data": {
    "requestMediaUploadUrl": {
      "url": "xyz789",
      "uuid": "abc123"
    }
  }
}
```
