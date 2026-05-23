# ModEndorserEdge

## Description

Mod endorser edge

## Fields

| Field Name | Description |
| --- | --- |
| `cursor` - [String!](../types/String.md) | A cursor for use in pagination. |
| `endorsedAt` - [DateTime!](../types/DateTime.md) | Time of endorsement |
| `node` - [User](../types/User.md) | The item at the end of the edge. |

## Example

```json
{
  "cursor": "abc123",
  "endorsedAt": "2007-12-03T10:15:30Z",
  "node": User
}
```
