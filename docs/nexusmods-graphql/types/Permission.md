# Permission

## Description

A global or entity-specific permission granted to a user

## Fields

| Field Name | Description |
| --- | --- |
| `global` - [Boolean!](../types/Boolean.md) | If true, this permission is being granted globally from the user's role |
| `key` - [String!](../types/String.md) | Permission string being granted E.g. 'collection:publish' |

## Example

```json
{"global": true, "key": "abc123"}
```
