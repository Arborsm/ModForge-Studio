# FilterComparisonOperator

## Description

Filter comparison operators for elastic search queries.

## Values

| Enum Value | Description |
| --- | --- |
| `EQUALS` |  |
| `NOT_EQUALS` |  |
| `MATCHES` | Matches if all terms in the value are present (in any order). No wildcarding, though stems may match. |
| `WILDCARD` | Matches if all terms in the value are present (in any order), with leading/trailing wildcards applied. |
| `GT` | Greater than |
| `GTE` | Greater than or equal to |
| `LT` | Less than |
| `LTE` | Less than or equal to |

## Example

```gql
"EQUALS"
```
