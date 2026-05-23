# editCollection

## Description

Updates the core details for a collection such as the name, description and category

## Response

Returns an [EditCollectionMutationPayload](../types/EditCollectionMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `collectionId` - [Int!](../types/Int.md) | The database ID for this collection. |
| `name` - [String](../types/String.md) | Name of this collection |
| `summary` - [String](../types/String.md) | Collection summary |
| `description` - [String](../types/String.md) | Description of this collection |
| `categoryId` - [ID](../types/ID.md) | ID of the parent category |
| `allowUserMedia` - [Boolean](../types/Boolean.md) | If true, allow user-uploaded content |
| `manuallyVerifyMedia` - [Boolean](../types/Boolean.md) | If true, media needs to be verified |

#### Example

## Query

```gql
mutation editCollection(
  $collectionId: Int!,
  $name: String,
  $summary: String,
  $description: String,
  $categoryId: ID,
  $allowUserMedia: Boolean,
  $manuallyVerifyMedia: Boolean
) {
  editCollection(
    collectionId: $collectionId,
    name: $name,
    summary: $summary,
    description: $description,
    categoryId: $categoryId,
    allowUserMedia: $allowUserMedia,
    manuallyVerifyMedia: $manuallyVerifyMedia
  ) {
    collection {
      ...CollectionFragment
    }
    success
  }
}
```

## Variables

```json
{
  "collectionId": 987,
  "name": "xyz789",
  "summary": "xyz789",
  "description": "xyz789",
  "categoryId": "4",
  "allowUserMedia": false,
  "manuallyVerifyMedia": true
}
```

## Response

```json
{
  "data": {
    "editCollection": {
      "collection": Collection,
      "success": true
    }
  }
}
```
