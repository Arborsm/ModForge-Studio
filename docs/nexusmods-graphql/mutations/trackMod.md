# trackMod

## Description

Allows the current user to track a mod

## Response

Returns a [TrackModMutationPayload](../types/TrackModMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `modUid` - [ID!](../types/ID.md) | The ID of the mod to be tracked. |

#### Example

## Query

```gql
mutation trackMod($modUid: ID!) {
  trackMod(modUid: $modUid) {
    success
    trackedMod {
      ...TrackedModFragment
    }
  }
}
```

## Variables

```json
{"modUid": 4}
```

## Response

```json
{
  "data": {
    "trackMod": {
      "success": true,
      "trackedMod": TrackedMod
    }
  }
}
```
