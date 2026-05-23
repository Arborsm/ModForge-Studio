# UsersSearchFilter

## Description

Filter fields specific to a Users query

## Fields

| Input Field | Description |
| --- | --- |
| `filter` - [[UsersSearchFilter!]](../types/UsersSearchFilter.md) | Nested filters. |
| `op` - [FilterLogicalOperator](../types/FilterLogicalOperator.md) | Logical operator for clauses. |
| `nameExact` - [[BaseFilterValueEqualsMatches!]](../types/BaseFilterValueEqualsMatches.md) | Username. |
| `nameWildcard` - [[BaseFilterValue!]](../types/BaseFilterValue.md) | Username. |

## Example

```json
{
  "filter": [UsersSearchFilter],
  "op": "AND",
  "nameExact": [BaseFilterValueEqualsMatches],
  "nameWildcard": [BaseFilterValue]
}
```
