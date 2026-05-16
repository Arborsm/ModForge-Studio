# ModUpload

## Description

An upload

## Fields

| Field Name | Description |
| --- | --- |
| `claimed` - [Boolean](../types/Boolean.md) | If true, this file has been claimed by a user |
| `contentPreviewGenerated` - [Boolean](../types/Boolean.md) | If true, the content preview has been generated for this upload |
| `createdAt` - [String!](../types/String.md) | Time of when this upload was first created. |
| `discardedAt` - [String](../types/String.md) | Time of when this upload was discarded. |
| `fileChunksReassembled` - [Boolean](../types/Boolean.md) | If true, this file has been reassembled from the uploaded chunks |
| `fileId` - [Int](../types/Int.md) | Forms a composite key with the game_id |
| `game` - [Game](../types/Game.md) | A Game |
| `hasAlternateDataStreams` - [Boolean](../types/Boolean.md) | If true, NTFS alternate data streams were detected in this upload |
| `id` - [String!](../types/String.md) | The database ID for this upload. |
| `internalVirusScanStatus` - [Int](../types/Int.md) | The virus scanning status of this upload, provided by our internal virus scanning tools |
| `magicBytesScanStatus` - [Int](../types/Int.md) | The magic bytes scan status of this upload |
| `md5` - [String](../types/String.md) | The MD5 hash for this object in our object store |
| `modFile` - [ModFile](../types/ModFile.md) | Files belonging to a mod |
| `modId` - [Int](../types/Int.md) | The database ID for this mod. |
| `s3UploadComplete` - [Boolean](../types/Boolean.md) | If true, this file has been uploaded to object store |
| `s3Url` - [String](../types/String.md) | The URL for this object in our object store |
| `sha256` - [String](../types/String.md) | The HAS256 hash for this object in our object store |
| `sizeBytes` - [String](../types/String.md) | The size of this upload in bytes |
| `systemFileName` - [String](../types/String.md) | System filename for this upload |
| `tempFileName` - [String!](../types/String.md) | Temporary filename for this upload |
| `updatedAt` - [String!](../types/String.md) | Time of when this upload was last updated. |
| `uploadType` - [String](../types/String.md) | Type of upload |
| `user` - [User](../types/User.md) | A Nexus Mods user |
| `virusTotalPositives` - [Int](../types/Int.md) | Number of positive reports from VirusTotal |
| `virusTotalStatus` - [Int](../types/Int.md) | The virus scanning status of this upload, provided by VirusTotal |
| `virusTotalUrl` - [String](../types/String.md) | The URL of the VirusTotal report for this upload |
| `yaraScanStatus` - [Int](../types/Int.md) | The YARA scan status of this upload |

## Example

```json
{
  "claimed": true,
  "contentPreviewGenerated": false,
  "createdAt": "xyz789",
  "discardedAt": "abc123",
  "fileChunksReassembled": true,
  "fileId": 123,
  "game": Game,
  "hasAlternateDataStreams": true,
  "id": "xyz789",
  "internalVirusScanStatus": 987,
  "magicBytesScanStatus": 123,
  "md5": "abc123",
  "modFile": ModFile,
  "modId": 987,
  "s3UploadComplete": false,
  "s3Url": "xyz789",
  "sha256": "abc123",
  "sizeBytes": "abc123",
  "systemFileName": "xyz789",
  "tempFileName": "abc123",
  "updatedAt": "xyz789",
  "uploadType": "xyz789",
  "user": User,
  "virusTotalPositives": 987,
  "virusTotalStatus": 123,
  "virusTotalUrl": "abc123",
  "yaraScanStatus": 987
}
```
