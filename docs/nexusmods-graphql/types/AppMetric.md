# AppMetric

## Description

Application metric event

## Fields

| Field Name | Description |
| --- | --- |
| `clientString` - [String](../types/String.md) | Client identifier |
| `createdAt` - [ISO8601DateTime!](../types/ISO8601DateTime.md) | When the metric was recorded |
| `entityId` - [String!](../types/String.md) | Unique identifier for the entity, e.g., collection ID |
| `entityType` - [String!](../types/String.md) | Type of entity associated with the event, e.g., "collection" |
| `eventType` - [AppMetricEventType!](../types/AppMetricEventType.md) | Type of event that was tracked |
| `id` - [BigInt!](../types/BigInt.md) | Unique identifier for the metric event |
| `metadata` - [JSON](../types/JSON.md) | Additional metadata as JSON object |
| `userId` - [BigInt](../types/BigInt.md) | ID of the user who triggered the event |

## Example

```json
{
  "clientString": "abc123",
  "createdAt": ISO8601DateTime,
  "entityId": "xyz789",
  "entityType": "xyz789",
  "eventType": "collection_completed",
  "id": {},
  "metadata": {},
  "userId": {}
}
```
