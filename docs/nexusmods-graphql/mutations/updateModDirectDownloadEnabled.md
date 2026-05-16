# updateModDirectDownloadEnabled

## Description

Updates whether or not a mod can be downloaded directly without requiring premium status

## Response

Returns an [UpdateModDirectDownloadEnabledMutationPayload](../types/UpdateModDirectDownloadEnabledMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `modUid` - [ID!](../types/ID.md) | The database ID for this mod. |
| `directDownloadEnabled` - [Boolean!](../types/Boolean.md) | Enable or disable direct download |

#### Example

## Query

```gql
mutation updateModDirectDownloadEnabled(
  $modUid: ID!,
  $directDownloadEnabled: Boolean!
) {
  updateModDirectDownloadEnabled(
    modUid: $modUid,
    directDownloadEnabled: $directDownloadEnabled
  ) {
    mod {
      ...ModFragment
    }
    success
  }
}
```

## Variables

```json
{
  "modUid": "4",
  "directDownloadEnabled": true
}
```

## Response

```json
{
  "data": {
    "updateModDirectDownloadEnabled": {
      "mod": Mod,
      "success": true
    }
  }
}
```
