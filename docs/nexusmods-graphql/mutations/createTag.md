# createTag

## Description

Creates a new collection Tag

## Response

Returns a [CreateTagMutationPayload](../types/CreateTagMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `name` - [String!](../types/String.md) | Tag name |
| `categoryId` - [ID](../types/ID.md) | Tag category ID |
| `gameIds` - [[ID!]](../types/ID.md) | Array containing Game IDs to be associated with the tag |
| `global` - [Boolean](../types/Boolean.md) | Is the tag global (not game specific) |
| `adult` - [Boolean](../types/Boolean.md) | Is this an adult content tag |

#### Example

## Query

```gql
mutation createTag(
  $name: String!,
  $categoryId: ID,
  $gameIds: [ID!],
  $global: Boolean,
  $adult: Boolean
) {
  createTag(
    name: $name,
    categoryId: $categoryId,
    gameIds: $gameIds,
    global: $global,
    adult: $adult
  ) {
    success
    tag {
      ...TagFragment
    }
  }
}
```

## Variables

```json
{
  "name": "abc123",
  "categoryId": "4",
  "gameIds": ["4"],
  "global": false,
  "adult": false
}
```

## Response

```json
{"data": {"createTag": {"success": false, "tag": Tag}}}
```
