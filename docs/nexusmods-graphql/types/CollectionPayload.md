# CollectionPayload

## Description

The data payload used to create a collection revision

## Fields

| Input Field | Description |
| --- | --- |
| `adultContent` - [Boolean!](../types/Boolean.md) | Whether the collection includes adult content |
| `collectionManifest` - [CollectionManifest!](../types/CollectionManifest.md) | Collection manifest |
| `collectionSchemaId` - [Int!](../types/Int.md) | Collection schema ID (Default: 1) |

## Example

```json
{
  "adultContent": false,
  "collectionManifest": CollectionManifest,
  "collectionSchemaId": 987
}
```
