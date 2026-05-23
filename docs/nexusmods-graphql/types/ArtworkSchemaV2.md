# ArtworkSchemaV2

## Description

Artwork schema introduced in May 2025, comprising tile, hero, and thumbnail images.

## Fields

| Field Name | Description |
| --- | --- |
| `hero` - [String!](../types/String.md) | URI template for hero e.g. for backgrounds, minimum 1920x620. |
| `thumbnail` - [String!](../types/String.md) | URI template for thumbnail e.g. for icons, minimum 80x80. |
| `tile` - [String!](../types/String.md) | URI template for tile e.g. for listings, minimum 400x267. |

## Example

```json
{
  "hero": "abc123",
  "thumbnail": "xyz789",
  "tile": "xyz789"
}
```
