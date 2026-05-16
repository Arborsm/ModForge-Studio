# fileHashes

## Description

Get a list of FileHashes

## Response

Returns [[FileHash!]](../types/FileHash.md)

## Arguments

| Name | Description |
| --- | --- |
| `md5s` - [[String!]!](../types/String.md) | Array of MD5 file hashes for retrieving files in bulk |

#### Example

## Query

```gql
query fileHashes($md5s: [String!]!) {
  fileHashes(md5s: $md5s) {
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
{"md5s": ["abc123"]}
```

## Response

```json
{
  "data": {
    "fileHashes": [
      {
        "createdAt": "2007-12-03T10:15:30Z",
        "fileName": "xyz789",
        "fileSize": {},
        "fileType": "xyz789",
        "gameId": 987,
        "md5": "abc123",
        "modFile": ModFile,
        "modFileId": 987
      }
    ]
  }
}
```
