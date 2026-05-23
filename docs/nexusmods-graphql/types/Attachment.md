# Attachment

## Description

Type that exposes the attachment urls

## Fields

| Field Name | Description |
| --- | --- |
| `filename` - [String!](../types/String.md) | The attachment filename |
| `id` - [ID!](../types/ID.md) | A unique ID for this attachment. This is a signed ID that will change between requests. This is expected behaviour and is to avoid tampering. |
| `url` - [String!](../types/String.md) | The attachment URL |

## Example

```json
{
  "filename": "abc123",
  "id": 4,
  "url": "abc123"
}
```
