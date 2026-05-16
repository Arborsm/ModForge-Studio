# ArtworkSchemaV1

## Description

Artwork schema using one tile image, additionally blurred for background use.

## Fields

| Field Name | Description |
| --- | --- |
| `tile` - [String!](../types/String.md) | URI template for primary game image. |
| `tileBlurred` - [String!](../types/String.md) | URI template for blurred image e.g. for background use. |

## Example

```json
{
  "tile": "xyz789",
  "tileBlurred": "abc123"
}
```
