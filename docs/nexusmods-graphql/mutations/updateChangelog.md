# updateChangelog

## Description

Updates existing revision changelog

## Response

Returns an [UpdateChangelogMutationPayload](../types/UpdateChangelogMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `changelogId` - [ID!](../types/ID.md) | Changelog ID |
| `description` - [String!](../types/String.md) | Changelog description |

#### Example

## Query

```gql
mutation updateChangelog(
  $changelogId: ID!,
  $description: String!
) {
  updateChangelog(
    changelogId: $changelogId,
    description: $description
  ) {
    changelogId
    success
  }
}
```

## Variables

```json
{
  "changelogId": "4",
  "description": "abc123"
}
```

## Response

```json
{"data": {"updateChangelog": {"changelogId": 123, "success": false}}}
```
