# GlobalNotice

## Description

A sitewide notice to be displayed to all users

## Fields

| Field Name | Description |
| --- | --- |
| `content` - [String!](../types/String.md) | Content of the notice |
| `date` - [DateTime!](../types/DateTime.md) | Date of the notice |
| `staff` - [User!](../types/User.md) | Staff member who created the notice |

## Example

```json
{
  "content": "abc123",
  "date": "2007-12-03T10:15:30Z",
  "staff": User
}
```
