# updateGame

## Description

Updates a game

## Response

Returns an [UpdateGameMutationPayload](../types/UpdateGameMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `gameId` - [Int!](../types/Int.md) | ID of the game to update |
| `artworkSchema` - [GameArtworkSchema](../types/GameArtworkSchema.md) | New artwork schema to use |
| `copyrightedName` - [Boolean](../types/Boolean.md) | Set to true if the game name is a copyrighted asset |

#### Example

## Query

```gql
mutation updateGame(
  $gameId: Int!,
  $artworkSchema: GameArtworkSchema,
  $copyrightedName: Boolean
) {
  updateGame(
    gameId: $gameId,
    artworkSchema: $artworkSchema,
    copyrightedName: $copyrightedName
  ) {
    success
  }
}
```

## Variables

```json
{"gameId": 123, "artworkSchema": "V1", "copyrightedName": true}
```

## Response

```json
{"data": {"updateGame": {"success": false}}}
```
