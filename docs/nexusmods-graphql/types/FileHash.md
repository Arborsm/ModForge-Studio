# FileHash

## Description

A Mod File Hash

## Fields

| Field Name | Description |
| --- | --- |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this file was first created. |
| `fileName` - [String!](../types/String.md) | Name of the file |
| `fileSize` - [BigInt!](../types/BigInt.md) | Filesize in bytes |
| `fileType` - [String!](../types/String.md) | Type of file |
| `gameId` - [Int!](../types/Int.md) | The database ID for this game. |
| `md5` - [String!](../types/String.md) | MD5 Checksum of the file |
| `modFile` - [ModFile](../types/ModFile.md) | Mod file object |
| `modFileId` - [Int!](../types/Int.md) | The database ID for this file. |

## Example

```json
{
  "createdAt": "2007-12-03T10:15:30Z",
  "fileName": "abc123",
  "fileSize": {},
  "fileType": "xyz789",
  "gameId": 123,
  "md5": "abc123",
  "modFile": ModFile,
  "modFileId": 987
}
```
