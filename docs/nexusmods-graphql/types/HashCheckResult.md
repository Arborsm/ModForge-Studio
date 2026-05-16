# HashCheckResult

## Description

Result of checking an MD5 hash against the CSAM known image hashlist

## Fields

| Field Name | Description |
| --- | --- |
| `hashValue` - [String!](../types/String.md) | The MD5 hash that was checked |
| `match` - [Boolean!](../types/Boolean.md) | Whether the hash was found in the CSAM hashlist (true = match found, false = no match) |

## Example

```json
{"hashValue": "abc123", "match": false}
```
