# trackAppMetric

## Description

Track desktop application events and metrics

## Response

Returns a [TrackAppMetricMutationPayload](../types/TrackAppMetricMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `eventType` - [AppMetricEventType!](../types/AppMetricEventType.md) | Type of event being tracked |
| `entityType` - [AppMetricEntityType!](../types/AppMetricEntityType.md) | Type of entity associated with the event, e.g., "collection" |
| `entityId` - [String!](../types/String.md) | Unique identifier for the entity, e.g., collection ID |
| `clientString` - [String](../types/String.md) | Client identifier |
| `metadata` - [JSON](../types/JSON.md) | Additional metadata as JSON object |

#### Example

## Query

```gql
mutation trackAppMetric(
  $eventType: AppMetricEventType!,
  $entityType: AppMetricEntityType!,
  $entityId: String!,
  $clientString: String,
  $metadata: JSON
) {
  trackAppMetric(
    eventType: $eventType,
    entityType: $entityType,
    entityId: $entityId,
    clientString: $clientString,
    metadata: $metadata
  ) {
    appMetric {
      ...AppMetricFragment
    }
    errors
    success
  }
}
```

## Variables

```json
{
  "eventType": "collection_completed",
  "entityType": "collection",
  "entityId": "abc123",
  "clientString": "xyz789",
  "metadata": {}
}
```

## Response

```json
{
  "data": {
    "trackAppMetric": {
      "appMetric": AppMetric,
      "errors": ["xyz789"],
      "success": false
    }
  }
}
```
