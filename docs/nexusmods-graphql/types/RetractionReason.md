# RetractionReason

## Description

A reason for which a revision has been retracted.

## Fields

| Field Name | Description |
| --- | --- |
| `collectionRevisionId` - [Int!](../types/Int.md) | An immutable revision of a collection |
| `createdAt` - [DateTime!](../types/DateTime.md) | Time of when this retraction reason was first created. |
| `id` - [Int!](../types/Int.md) | The database ID for this retraction reason. |
| `reason` - [String!](../types/String.md) | User-provided reason for this retraction |
| `updatedAt` - [DateTime!](../types/DateTime.md) | Time of when this retraction reason was last updated. |

## Example

```json
{
  "collectionRevisionId": 987,
  "createdAt": "2007-12-03T10:15:30Z",
  "id": 123,
  "reason": "xyz789",
  "updatedAt": "2007-12-03T10:15:30Z"
}
```
