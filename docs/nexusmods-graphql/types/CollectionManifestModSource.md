# CollectionManifestModSource

## Description

Source information for a mod (nexus or other) as part of the manifest

## Fields

| Input Field | Description |
| --- | --- |
| `type` - [ModSource!](../types/ModSource.md) | Type of the mod source |
| `modId` - [Int](../types/Int.md) | Mod id |
| `fileId` - [Int](../types/Int.md) | File ID |
| `md5` - [String](../types/String.md) | An MD5 hash of the file for verification |
| `fileSize` - [Int](../types/Int.md) | The file size in kb |
| `updatePolicy` - [UpdatePolicy](../types/UpdatePolicy.md) | Update policy type |
| `logicalFilename` - [String](../types/String.md) | Logical file name of the mod resource |
| `fileExpression` - [String](../types/String.md) | File expression of the mod resource |
| `url` - [String](../types/String.md) | The direct url of the file |
| `adultContent` - [Boolean](../types/Boolean.md) | Does the mod includes adult content |

## Example

```json
{
  "type": "nexus",
  "modId": 987,
  "fileId": 987,
  "md5": "abc123",
  "fileSize": 123,
  "updatePolicy": "exact",
  "logicalFilename": "xyz789",
  "fileExpression": "xyz789",
  "url": "abc123",
  "adultContent": false
}
```
