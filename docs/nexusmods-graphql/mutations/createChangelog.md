# createChangelog

## Description

Creates a revision changelog entry

## Response

Returns a [CreateChangelogMutationPayload](../types/CreateChangelogMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `revisionId` - [ID!](../types/ID.md) | Revision ID |
| `description` - [String!](../types/String.md) | Changelog description |

#### Example

## Query

```gql
mutation createChangelog(
  $revisionId: ID!,
  $description: String!
) {
  createChangelog(
    revisionId: $revisionId,
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
  "revisionId": "4",
  "description": "xyz789"
}
```

## Response

```json
{"data": {"createChangelog": {"changelogId": 987, "success": true}}}
```
