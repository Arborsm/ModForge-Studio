# OptedInMods

## Description

A list of mods that this user has been opted into

## Fields

| Field Name | Description |
| --- | --- |
| `count` - [Int!](../types/Int.md) | Number of mods this user has opted in |
| `entries` - [[OptedInMod!]!](../types/OptedInMod.md) | Mods that have been opted in |
| `user` - [User!](../types/User.md) | User |
| `userId` - [Int!](../types/Int.md) | ID of the user |

## Example

```json
{
  "count": 987,
  "entries": [OptedInMod],
  "user": User,
  "userId": 987
}
```
