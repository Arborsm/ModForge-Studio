# ModRequirements

## Description

Represents the requirements of a mod

## Fields

| Field Name | Description |
| --- | --- |
| `dlcRequirements` - [[ModRequirementsDlc!]!](../types/ModRequirementsDlc.md) | The DLC (expansion) requirements of the mod |
| `modsRequiringThisMod` - [ModRequiringPage!](../types/ModRequiringPage.md) | Other mods that require this mod |
| Arguments `offset` - [Int](../types/Int.md) `count` - [Int](../types/Int.md) |  |
| `nexusRequirements` - [ModRequirementPage!](../types/ModRequirementPage.md) | Required mods for this mod |
| Arguments `offset` - [Int](../types/Int.md) `count` - [Int](../types/Int.md) |  |

## Example

```json
{
  "dlcRequirements": [ModRequirementsDlc],
  "modsRequiringThisMod": ModRequiringPage,
  "nexusRequirements": ModRequirementPage
}
```
