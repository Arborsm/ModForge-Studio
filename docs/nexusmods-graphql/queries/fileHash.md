# fileHash

## Description

Get Mod FileHash by md5

## Response

Returns [[FileHash!]!](../types/FileHash.md)

## Arguments

| Name | Description |
| --- | --- |
| `md5` - [String!](../types/String.md) | MD5 file hashes for retrieving files |

#### Example

## Query

```gql
query fileHash($md5: String!) {
  fileHash(md5: $md5) {
    createdAt
    fileName
    fileSize
    fileType
    gameId
    md5
    modFile {
      ...ModFileFragment
    }
    modFileId
  }
}
```

## Variables

```json
{"md5": "abc123"}
```

## Response

```json
{
  "data": {
    "fileHash": [
      {
        "createdAt": "2007-12-03T10:15:30Z",
        "fileName": "abc123",
        "fileSize": {},
        "fileType": "xyz789",
        "gameId": 987,
        "md5": "xyz789",
        "modFile": ModFile,
        "modFileId": 123
      }
    ]
  }
}
```
