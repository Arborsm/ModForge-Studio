# gameArtwork

## Description

Get the current artwork schemas.

## Response

Returns a [GameArtwork](../types/GameArtwork.md)

#### Example

## Query

```gql
query gameArtwork {
  gameArtwork {
    schemaV1 {
      ...ArtworkSchemaV1Fragment
    }
    schemaV2 {
      ...ArtworkSchemaV2Fragment
    }
  }
}
```

## Response

```json
{
  "data": {
    "gameArtwork": {
      "schemaV1": ArtworkSchemaV1,
      "schemaV2": ArtworkSchemaV2
    }
  }
}
```
