# ModRequirement

## Description

Represents a mod requirement

## Fields

| Field Name | Description |
| --- | --- |
| `externalRequirement` - [Boolean!](../types/Boolean.md) | If true, the requirement is external to the site. See the url field for the address. |
| `gameId` - [ID!](../types/ID.md) | The ID of the game that the required mod belongs to |
| `id` - [ID!](../types/ID.md) | The ID of the mod requirement |
| `modId` - [ID!](../types/ID.md) | The ID of the mod that is required |
| `modName` - [String!](../types/String.md) | The name of the mod required |
| `notes` - [String](../types/String.md) | Notes about the mod requirement |
| `url` - [String!](../types/String.md) | The URL of the mod that is required by the mod |

## Example

```json
{
  "externalRequirement": true,
  "gameId": "4",
  "id": 4,
  "modId": "4",
  "modName": "xyz789",
  "notes": "xyz789",
  "url": "abc123"
}
```
