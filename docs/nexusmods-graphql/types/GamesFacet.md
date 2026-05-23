# GamesFacet

## Description

Facet fields specific to the games query.

## Fields

| Input Field | Description |
| --- | --- |
| `genre` - [[String!]](../types/String.md) | Facet on game genre. |
| `hasCollections` - [[String!]](../types/String.md) | Facet on collections. |
| `supportsVortex` - [[String!]](../types/String.md) | Facet on Vortex support. |

## Example

```json
{
  "genre": ["abc123"],
  "hasCollections": ["xyz789"],
  "supportsVortex": ["xyz789"]
}
```
