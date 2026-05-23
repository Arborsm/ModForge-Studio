# CollectionManifestInfo

## Description

The info section of the JSON manifest

## Fields

| Input Field | Description |
| --- | --- |
| `author` - [String!](../types/String.md) | The collection author's name |
| `authorUrl` - [String](../types/String.md) | The url of the author's profile |
| `name` - [String!](../types/String.md) | The name of the collection |
| `description` - [String](../types/String.md) | A description of the collection |
| `summary` - [String](../types/String.md) | A short summary of the collection |
| `domainName` - [String!](../types/String.md) | The domain name of the game |
| `gameVersions` - [[String!]](../types/String.md) | A list of game versions that this revision has been tested with |

## Example

```json
{
  "author": "abc123",
  "authorUrl": "abc123",
  "name": "abc123",
  "description": "xyz789",
  "summary": "xyz789",
  "domainName": "abc123",
  "gameVersions": ["abc123"]
}
```
