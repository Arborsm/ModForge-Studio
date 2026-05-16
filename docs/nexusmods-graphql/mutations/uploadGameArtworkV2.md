# uploadGameArtworkV2

## Description

TODO

## Response

Returns an [UploadGameArtworkV2MutationPayload](../types/UploadGameArtworkV2MutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `gameId` - [Int!](../types/Int.md) | ID of the game to update. |
| `tileFile` - [Upload](../types/Upload.md) | TODO |
| `heroFile` - [Upload](../types/Upload.md) | TODO |
| `thumbnailFile` - [Upload](../types/Upload.md) | TODO |

#### Example

## Query

```gql
mutation uploadGameArtworkV2(
  $gameId: Int!,
  $tileFile: Upload,
  $heroFile: Upload,
  $thumbnailFile: Upload
) {
  uploadGameArtworkV2(
    gameId: $gameId,
    tileFile: $tileFile,
    heroFile: $heroFile,
    thumbnailFile: $thumbnailFile
  ) {
    successHero
    successThumbnail
    successTile
  }
}
```

## Variables

```json
{
  "gameId": 987,
  "tileFile": Upload,
  "heroFile": Upload,
  "thumbnailFile": Upload
}
```

## Response

```json
{
  "data": {
    "uploadGameArtworkV2": {
      "successHero": true,
      "successThumbnail": true,
      "successTile": true
    }
  }
}
```
