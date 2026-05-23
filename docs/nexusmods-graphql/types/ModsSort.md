# ModsSort

## Description

Sort fields specific to a Mods query.

## Fields

| Input Field | Description |
| --- | --- |
| `relevance` - [BaseSortValue](../types/BaseSortValue.md) | Filter query relevance, works best with non wildcard queries. |
| `name` - [BaseSortValue](../types/BaseSortValue.md) | Mod name. |
| `downloads` - [BaseSortValue](../types/BaseSortValue.md) | Number of times downloaded. |
| `uniqueDownloads` - [BaseSortValue](../types/BaseSortValue.md) | Number of unique downloads. |
| `endorsements` - [BaseSortValue](../types/BaseSortValue.md) | Number of times endorsed. |
| `random` - [RandomSortValue](../types/RandomSortValue.md) | Random mods. |
| `createdAt` - [BaseSortValue](../types/BaseSortValue.md) | Date created. |
| `updatedAt` - [BaseSortValue](../types/BaseSortValue.md) | Date updated. |
| `size` - [BaseSortValue](../types/BaseSortValue.md) | Mod file size. |
| `lastComment` - [BaseSortValue](../types/BaseSortValue.md) | Date of last comment. |

## Example

```json
{
  "relevance": BaseSortValue,
  "name": BaseSortValue,
  "downloads": BaseSortValue,
  "uniqueDownloads": BaseSortValue,
  "endorsements": BaseSortValue,
  "random": RandomSortValue,
  "createdAt": BaseSortValue,
  "updatedAt": BaseSortValue,
  "size": BaseSortValue,
  "lastComment": BaseSortValue
}
```
