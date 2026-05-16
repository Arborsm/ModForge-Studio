# untrackMod

## Description

Allows the current user to untrack a mod

## Response

Returns an [UntrackModMutationPayload](../types/UntrackModMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `modUid` - [ID!](../types/ID.md) | The ID of the mod to be un-tracked. |

#### Example

## Query

```gql
mutation untrackMod($modUid: ID!) {
  untrackMod(modUid: $modUid) {
    success
  }
}
```

## Variables

```json
{"modUid": "4"}
```

## Response

```json
{"data": {"untrackMod": {"success": true}}}
```
