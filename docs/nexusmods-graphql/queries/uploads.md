# uploads

## Description

Get a list of uploads

## Response

Returns an [UploadList!](../types/UploadList.md)

## Arguments

| Name | Description |
| --- | --- |
| `start` - [Int!](../types/Int.md) | For offset-based pagination. Indicates the first element to start returning values from |
| `perPage` - [Int!](../types/Int.md) | Number of elements to return per page |
| `orderDir` - [String!](../types/String.md) | Direction for sorting. 'asc' or 'desc' are the only valid options |
| `orderColumn` - [String!](../types/String.md) | Column used for sorting |
| `id` - [String](../types/String.md) | The database ID for this ModUpload. |
| `search` - [String](../types/String.md) | Filter uploads |
| `filter` - [String](../types/String.md) | Filter uploads |
| `uploadType` - [String](../types/String.md) | Only return specific types of uploads |
| `gameId` - [Int](../types/Int.md) | The database ID for this Game. |
| `userId` - [Int](../types/Int.md) | The database ID for this User. |
| `fileId` - [Int](../types/Int.md) | The database ID for this ModFile. |
| `modId` - [Int](../types/Int.md) | The database ID for this Mod. |

#### Example

## Query

```gql
query uploads(
  $start: Int!,
  $perPage: Int!,
  $orderDir: String!,
  $orderColumn: String!,
  $id: String,
  $search: String,
  $filter: String,
  $uploadType: String,
  $gameId: Int,
  $userId: Int,
  $fileId: Int,
  $modId: Int
) {
  uploads(
    start: $start,
    perPage: $perPage,
    orderDir: $orderDir,
    orderColumn: $orderColumn,
    id: $id,
    search: $search,
    filter: $filter,
    uploadType: $uploadType,
    gameId: $gameId,
    userId: $userId,
    fileId: $fileId,
    modId: $modId
  ) {
    filteredCount
    totalCount
    uploads {
      ...ModUploadFragment
    }
  }
}
```

## Variables

```json
{
  "start": 987,
  "perPage": 123,
  "orderDir": "abc123",
  "orderColumn": "xyz789",
  "id": "abc123",
  "search": "abc123",
  "filter": "abc123",
  "uploadType": "abc123",
  "gameId": 987,
  "userId": 123,
  "fileId": 987,
  "modId": 987
}
```

## Response

```json
{
  "data": {
    "uploads": {
      "filteredCount": 987,
      "totalCount": 123,
      "uploads": [ModUpload]
    }
  }
}
```
