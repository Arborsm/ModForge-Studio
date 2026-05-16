# ModSource

## Description

Used to define the source of a mod. Useful for informing Collections how to retrieve mods.

## Values

| Enum Value | Description |
| --- | --- |
| `nexus` | The Nexus website |
| `direct` | A direct url to download from |
| `browse` | A general url to find the mod (further instructions may be provided) |
| `manual` | Manual instructions for installing the mod |
| `bundle` | Mod files are included in the collection asset file, and do not need to be acquired separately |

## Example

```gql
"nexus"
```
