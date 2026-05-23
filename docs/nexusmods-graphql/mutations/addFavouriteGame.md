# addFavouriteGame

## Description

Adds a game to a user's favourites

## Response

Returns an [AddFavouriteGameMutationPayload](../types/AddFavouriteGameMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `gameId` - [ID!](../types/ID.md) | The game to add |

#### Example

## Query

```gql
mutation addFavouriteGame($gameId: ID!) {
  addFavouriteGame(gameId: $gameId) {
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
{"data": {"addFavouriteGame": {"success": false}}}
```
