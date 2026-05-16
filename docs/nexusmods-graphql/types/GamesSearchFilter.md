# GamesSearchFilter

## Description

Filter for a list of Games

## Fields

| Input Field | Description |
| --- | --- |
| `filter` - [[GamesSearchFilter!]](../types/GamesSearchFilter.md) | Nested filters. |
| `op` - [FilterLogicalOperator](../types/FilterLogicalOperator.md) | Logical operator for clauses. |
| `name` - [[GameNameFieldFilterValue!]](../types/GameNameFieldFilterValue.md) | Game name suitable for use with op:wildcard, but not op:matches. Punctuation matched. |

## Example

```json
{
  "filter": [GamesSearchFilter],
  "op": "AND",
  "name": [GameNameFieldFilterValue]
}
```
