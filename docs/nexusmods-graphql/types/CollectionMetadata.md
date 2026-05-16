# CollectionMetadata

## Description

Metadata information about a collection

## Fields

| Field Name | Description |
| --- | --- |
| `downloadedAt` - [DateTime](../types/DateTime.md) | A timestamp indicating the first time the user downloaded this collection |
| `endorsementValue` - [Int](../types/Int.md) | A positive value indicates an endorsement by the user, while a negative value indicates abstention (will be null if the user has not endorsed the collection) |
| `latestDownloadedRevisionNumber` - [Int](../types/Int.md) | The latest revision number downloaded by the user for this collection |

## Example

```json
{
  "downloadedAt": "2007-12-03T10:15:30Z",
  "endorsementValue": 987,
  "latestDownloadedRevisionNumber": 987
}
```
