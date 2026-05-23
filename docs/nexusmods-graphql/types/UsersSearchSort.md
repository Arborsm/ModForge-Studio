# UsersSearchSort

## Description

Sort fields specific to a Users query.

## Fields

| Input Field | Description |
| --- | --- |
| `relevance` - [BaseSortValue](../types/BaseSortValue.md) | Filter query relevance, works best with non wildcard queries. |
| `name` - [BaseSortValue](../types/BaseSortValue.md) | username |

## Example

```json
{
  "relevance": BaseSortValue,
  "name": BaseSortValue
}
```
