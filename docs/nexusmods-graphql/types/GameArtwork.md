# GameArtwork

## Description

Game artwork is set individually. This describes the schema for the artwork.

## Fields

| Field Name | Description |
| --- | --- |
| `schemaV1` - [ArtworkSchemaV1!](../types/ArtworkSchemaV1.md) | V1 prior to May 2025, using one tile image. |
| `schemaV2` - [ArtworkSchemaV2!](../types/ArtworkSchemaV2.md) | V2 introduced May 2025, comprising tile, hero, and thumbnail images. |

## Example

```json
{
  "schemaV1": ArtworkSchemaV1,
  "schemaV2": ArtworkSchemaV2
}
```
