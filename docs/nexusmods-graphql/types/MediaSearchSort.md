# MediaSearchSort

## Description

Sort fields specific to the media query.

## Fields

| Input Field | Description |
| --- | --- |
| `createdAt` - [BaseSortValue](../types/BaseSortValue.md) | Sort for 'new'. |
| `rating` - [BaseSortValue](../types/BaseSortValue.md) | Sort for 'trending'. |
| `views` - [BaseSortValue](../types/BaseSortValue.md) | Sort for 'popular'. |
| `random` - [RandomSortValue](../types/RandomSortValue.md) | Sort for 'surprise'. |

## Example

```json
{
  "createdAt": BaseSortValue,
  "rating": BaseSortValue,
  "views": BaseSortValue,
  "random": RandomSortValue
}
```
