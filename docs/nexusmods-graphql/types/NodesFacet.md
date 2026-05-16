# NodesFacet

## Description

Metadata about a single facet value.

## Fields

| Field Name | Description |
| --- | --- |
| `count` - [Int!](../types/Int.md) | Number of results available for this facet value. Affected by values set on other facets. |
| `facet` - [String!](../types/String.md) | Name matching the graphql facet request. |
| `value` - [String!](../types/String.md) | Value available for this facet. May be used in a subsequent facet request to filter the results by facet. |

## Example

```json
{
  "count": 987,
  "facet": "abc123",
  "value": "abc123"
}
```
