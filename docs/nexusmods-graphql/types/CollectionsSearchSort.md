# CollectionsSearchSort

## Description

Sort fields specific to a Collections query.

## Fields

| Input Field | Description |
| --- | --- |
| `relevance` - [BaseSortValue](../types/BaseSortValue.md) | Filter query relevance, works best with non wildcard queries. |
| `createdAt` - [BaseSortValue](../types/BaseSortValue.md) | Created at date |
| `updatedAt` - [BaseSortValue](../types/BaseSortValue.md) | Updated at date |
| `endorsements` - [BaseSortValue](../types/BaseSortValue.md) | Endorsements count |
| `downloads` - [BaseSortValue](../types/BaseSortValue.md) | Downloads count |
| `rating` - [BaseSortValue](../types/BaseSortValue.md) | Overall rating |
| `recentRating` - [BaseSortValue](../types/BaseSortValue.md) | Recent rating |

## Example

```json
{
  "relevance": BaseSortValue,
  "createdAt": BaseSortValue,
  "updatedAt": BaseSortValue,
  "endorsements": BaseSortValue,
  "downloads": BaseSortValue,
  "rating": BaseSortValue,
  "recentRating": BaseSortValue
}
```
