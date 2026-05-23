# privateMessageUrl

## Description

Get a private message URL

## Response

Returns a [String](../types/String.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [ID!](../types/ID.md) | Nexusmods ID of user to message |

#### Example

## Query

```gql
query privateMessageUrl($id: ID!) {
  privateMessageUrl(id: $id)
}
```

## Variables

```json
{"id": "4"}
```

## Response

```json
{"data": {"privateMessageUrl": "xyz789"}}
```
