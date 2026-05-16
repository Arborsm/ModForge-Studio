# ExternalResource

## Description

A mod file that is not hosted on Nexus Mods

## Fields

| Field Name | Description |
| --- | --- |
| `author` - [String](../types/String.md) | Similar to the author field in the mod details. So this is not the uploader and may not be an actual user account on the page. Will often be unassigned for external resources |
| `collectionRevisionId` - [Int!](../types/Int.md) | The database ID for this revision. |
| `fileExpression` - [String!](../types/String.md) | Glob pattern that must then match the archive file name. In cases where the collection asks for a non-exact version (e.g.: 1.2.4 or newer) where we can't look at the hash of the expected file, this can be used to determine if the mod is already installed/downloaded locally. |
| `id` - [Int!](../types/Int.md) | The database ID for this external resource. |
| `instructions` - [String](../types/String.md) | Deprecated This field is no longer being used |
| `name` - [String!](../types/String.md) | Name of this resource |
| `optional` - [Boolean!](../types/Boolean.md) | If true, this is an optional resource |
| `resourceType` - [String!](../types/String.md) | Resource type. This can be one of "direct" (A url to download directly from), "browse" (A website url for the user to browse and manually select the right file on), "manual" (Vortex will just show instructions for the user to create/acquire the mod manually). |
| `resourceUrl` - [String](../types/String.md) | Only set in the "browse"/"direct" types, contains the url to browse to/download from |
| `version` - [String](../types/String.md) | The version of the mod that the curator had installed at the time of uploading the collection. |

## Example

```json
{
  "author": "xyz789",
  "collectionRevisionId": 123,
  "fileExpression": "xyz789",
  "id": 123,
  "instructions": "abc123",
  "name": "xyz789",
  "optional": true,
  "resourceType": "xyz789",
  "resourceUrl": "xyz789",
  "version": "abc123"
}
```
