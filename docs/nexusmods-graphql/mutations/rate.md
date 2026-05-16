# rate

                   This mutation will be replaced using Interfaces and Global IDs

## Description

Votes for a generic Rateable model. TODO: This will be moved to model-specific mutations

## Response

Returns a [CreateRatingMutationPayload](../types/CreateRatingMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | ID of the entity the rating is for |
| `type` - [Ratable!](../types/Ratable.md) | Type of the entity the rating is for |
| `rating` - [RatingOptions!](../types/RatingOptions.md) | Rating value |

#### Example

## Query

```gql
mutation rate(
  $id: ID!,
  $type: Ratable!,
  $rating: RatingOptions!
) {
  rate(
    id: $id,
    type: $type,
    rating: $rating
  ) {
    averageRating {
      ...AverageRatingFragment
    }
    rating {
      ...RatingFragment
    }
    success
  }
}
```

## Variables

```json
{"id": 4, "type": "CollectionRevision", "rating": "positive"}
```

## Response

```json
{
  "data": {
    "rate": {
      "averageRating": AverageRating,
      "rating": Rating,
      "success": true
    }
  }
}
```
