# CollectionManifestMod

## Description

Defines a mod to be used in a collection as part of the manifest

## Fields

| Input Field | Description |
| --- | --- |
| `name` - [String!](../types/String.md) | The name of the mod |
| `version` - [String!](../types/String.md) | The mod version |
| `optional` - [Boolean!](../types/Boolean.md) | Whether the mod is required for this collection |
| `domainName` - [String!](../types/String.md) | The domain name of the game for the mod |
| `source` - [CollectionManifestModSource!](../types/CollectionManifestModSource.md) | Mod source details |
| `author` - [String](../types/String.md) | The name of the mod author |

## Example

```json
{
  "name": "abc123",
  "version": "abc123",
  "optional": true,
  "domainName": "xyz789",
  "source": CollectionManifestModSource,
  "author": "abc123"
}
```
