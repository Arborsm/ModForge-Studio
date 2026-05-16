# UserConnection

## Description

The connection type for User.

## Fields

| Field Name | Description |
| --- | --- |
| `edges` - [[UserEdge]](../types/UserEdge.md) | A list of edges. |
| `nodes` - [[User]](../types/User.md) | A list of nodes. |
| `pageInfo` - [PageInfo!](../types/PageInfo.md) | Information to aid in pagination. |
| `totalCount` - [Int!](../types/Int.md) | Total # of objects returned from this Plural Query |

## Example

```json
{
  "edges": [UserEdge],
  "nodes": [User],
  "pageInfo": PageInfo,
  "totalCount": 987
}
```
