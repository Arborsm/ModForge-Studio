# updateTag

## Description

Updates a collection Tag

## Response

Returns an [UpdateTagMutationPayload](../types/UpdateTagMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | Collection Tag ID |
| `name` - [String](../types/String.md) | Tag name |
| `categoryId` - [ID](../types/ID.md) | Tag category ID |
| `gameIds` - [[ID!]](../types/ID.md) | Games IDs to be associated with the Tag |
| `global` - [Boolean](../types/Boolean.md) | Is the tag global (non game specific) |
| `adult` - [Boolean](../types/Boolean.md) | Is this an adult content Tag |

#### Example

## Query

```gql
mutation updateTag(
  $id: ID!,
  $name: String,
  $categoryId: ID,
  $gameIds: [ID!],
  $global: Boolean,
  $adult: Boolean
) {
  updateTag(
    id: $id,
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
  "id": 4,
  "name": "xyz789",
  "categoryId": 4,
  "gameIds": [4],
  "global": false,
  "adult": false
}
```

## Response

```json
{"data": {"updateTag": {"success": true, "tag": Tag}}}
```
