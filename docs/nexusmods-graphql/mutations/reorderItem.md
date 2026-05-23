# reorderItem

## Description

Moves an item to a new position in a list.

## Response

Returns a [ReorderItemPayload](../types/ReorderItemPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | The global ID of the item to move. |
| `targetId` - [ID!](../types/ID.md) | The global ID of the item to move towards. |
| `location` - [ReorderLocation!](../types/ReorderLocation.md) | The new location of the item, in relation to the target item. |

#### Example

## Query

```gql
mutation reorderItem(
  $id: ID!,
  $targetId: ID!,
  $location: ReorderLocation!
) {
  reorderItem(
    id: $id,
    targetId: $targetId,
    location: $location
  ) {
    item {
      ...ReorderableFragment
    }
  }
}
```

## Variables

```json
{
  "id": "4",
  "targetId": "4",
  "location": "BEFORE"
}
```

## Response

```json
{"data": {"reorderItem": {"item": Reorderable}}}
```
