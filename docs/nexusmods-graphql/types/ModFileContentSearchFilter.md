# ModFileContentSearchFilter

## Fields

| Input Field | Description |
| --- | --- |
| `filter` - [[ModFileContentSearchFilter!]](../types/ModFileContentSearchFilter.md) | Nested filters. |
| `op` - [FilterLogicalOperator](../types/FilterLogicalOperator.md) | Logical operator for clauses. |
| `fileId` - [[IntFilterValue!]](../types/IntFilterValue.md) |  |
| `modId` - [[IntFilterValue!]](../types/IntFilterValue.md) |  |
| `gameId` - [[IntFilterValue!]](../types/IntFilterValue.md) |  |
| `filePathWildcard` - [[BaseFilterValueEqualsWildcard!]](../types/BaseFilterValueEqualsWildcard.md) |  |
| `filePathPartsExact` - [[BaseFilterValueEqualsMatches!]](../types/BaseFilterValueEqualsMatches.md) |  |
| `fileNameWildcard` - [[BaseFilterValueEqualsWildcard!]](../types/BaseFilterValueEqualsWildcard.md) |  |
| `fileExtensionExact` - [[BaseFilterValueEqualsMatches!]](../types/BaseFilterValueEqualsMatches.md) |  |
| `fileSize` - [[BaseFilterValueNumeric!]](../types/BaseFilterValueNumeric.md) |  |

## Example

```json
{
  "filter": [ModFileContentSearchFilter],
  "op": "AND",
  "fileId": [IntFilterValue],
  "modId": [IntFilterValue],
  "gameId": [IntFilterValue],
  "filePathWildcard": [BaseFilterValueEqualsWildcard],
  "filePathPartsExact": [BaseFilterValueEqualsMatches],
  "fileNameWildcard": [BaseFilterValueEqualsWildcard],
  "fileExtensionExact": [BaseFilterValueEqualsMatches],
  "fileSize": [BaseFilterValueNumeric]
}
```
