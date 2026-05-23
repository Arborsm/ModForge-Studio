# modEndorsers

## Description

Get a list of users that have endorsed a mod. Will return a maximum of 100 items per page.

## Response

Returns a [ModEndorserConnection!](../types/ModEndorserConnection.md)

## Arguments

| Name | Description |
| --- | --- |
| `modUid` - [ID!](../types/ID.md) | Mod UID to retrieve endorsers for |
| `after` - [String](../types/String.md) | Returns the elements in the list that come after the specified cursor. |
| `before` - [String](../types/String.md) | Returns the elements in the list that come before the specified cursor. |
| `first` - [Int](../types/Int.md) | Returns the first *n* elements from the list. |
| `last` - [Int](../types/Int.md) | Returns the last *n* elements from the list. |

#### Example

## Query

```gql
query modEndorsers(
  $modUid: ID!,
  $after: String,
  $before: String,
  $first: Int,
  $last: Int
) {
  modEndorsers(
    modUid: $modUid,
    after: $after,
    before: $before,
    first: $first,
    last: $last
  ) {
    edges {
      ...ModEndorserEdgeFragment
    }
    nodes {
      ...UserFragment
    }
    pageInfo {
      ...PageInfoFragment
    }
  }
}
```

## Variables

```json
{
  "modUid": "4",
  "after": "abc123",
  "before": "abc123",
  "first": 123,
  "last": 123
}
```

## Response

```json
{
  "data": {
    "modEndorsers": {
      "edges": [ModEndorserEdge],
      "nodes": [User],
      "pageInfo": PageInfo
    }
  }
}
```
