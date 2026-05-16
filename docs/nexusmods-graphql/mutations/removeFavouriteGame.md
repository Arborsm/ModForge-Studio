# removeFavouriteGame

## Description

Removes a game from a user's favourites

## Response

Returns a [RemoveFavouriteGameMutationPayload](../types/RemoveFavouriteGameMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `gameId` - [ID!](../types/ID.md) | The game to remove |

#### Example

## Query

```gql
mutation removeFavouriteGame($gameId: ID!) {
  removeFavouriteGame(gameId: $gameId) {
    success
  }
}
```

## Variables

```json
{"gameId": 4}
```

## Response

```json
{"data": {"removeFavouriteGame": {"success": true}}}
```
