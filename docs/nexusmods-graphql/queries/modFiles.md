# modFiles

## Description

Get a list of mod files

## Response

Returns [[ModFile!]!](../types/ModFile.md)

## Arguments

| Name | Description |
| --- | --- |
| `modId` - [ID!](../types/ID.md) | Mod ID for retrieving mods in bulk |
| `gameId` - [ID!](../types/ID.md) | Game ID for retrieving mods in bulk |

#### Example

## Query

```gql
query modFiles(
  $modId: ID!,
  $gameId: ID!
) {
  modFiles(
    modId: $modId,
    gameId: $gameId
  ) {
    category
    categoryId
    changelogText
    count
    date
    description
    fileId
    game {
      ...GameFragment
    }
    groupId
    id
    manager
    mod {
      ...ModFragment
    }
    modId
    name
    owner {
      ...UserFragment
    }
    primary
    reportLink
    requirementsAlert
    scanned
    scannedV2
    size
    sizeInBytes
    totalDownloads
    uCount
    uid
    uniqueDownloads
    uri
    version
  }
}
```

## Variables

```json
{"modId": "4", "gameId": 4}
```

## Response

```json
{
  "data": {
    "modFiles": [
      {
        "category": "MAIN",
        "categoryId": 123,
        "changelogText": ["abc123"],
        "count": 123,
        "date": 123,
        "description": "abc123",
        "fileId": 123,
        "game": Game,
        "groupId": 123,
        "id": 4,
        "manager": 987,
        "mod": Mod,
        "modId": 123,
        "name": "abc123",
        "owner": User,
        "primary": 987,
        "reportLink": "abc123",
        "requirementsAlert": 123,
        "scanned": 123,
        "scannedV2": "NOT_SCANNED",
        "size": 123,
        "sizeInBytes": {},
        "totalDownloads": 123,
        "uCount": 123,
        "uid": "4",
        "uniqueDownloads": 987,
        "uri": "xyz789",
        "version": "abc123"
      }
    ]
  }
}
```
