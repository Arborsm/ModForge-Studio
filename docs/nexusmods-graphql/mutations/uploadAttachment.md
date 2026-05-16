# uploadAttachment

## Description

Uploads a file to later be attached to an Attachable entity

## Response

Returns an [UploadAttachmentMutationPayload](../types/UploadAttachmentMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `file` - [Upload!](../types/Upload.md) | A file to upload that will be later attached to an entity |

#### Example

## Query

```gql
mutation uploadAttachment($file: Upload!) {
  uploadAttachment(file: $file) {
    attachment {
      ...AttachmentFragment
    }
  }
}
```

## Variables

```json
{"file": Upload}
```

## Response

```json
{"data": {"uploadAttachment": {"attachment": Attachment}}}
```
