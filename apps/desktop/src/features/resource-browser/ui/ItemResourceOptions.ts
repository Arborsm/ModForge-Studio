import type { ItemTextureAssetState, ItemWorkspaceEntry } from '@entities/item'
import type { ResourceBrowserOption } from './ResourcePicker'

/** Builds rich, sprite-backed item options for every shared resource picker. */
export function toItemResourceBrowserOptions(
  items: readonly ItemWorkspaceEntry[],
  textureStates: Readonly<Record<string, ItemTextureAssetState>>,
  idPrefix = 'item',
): ResourceBrowserOption[] {
  return items.map((item) => {
    const textureKey = item.textureAssetName?.replaceAll('\\', '/').toLowerCase() ?? ''
    return {
      id: `${idPrefix}:${item.qualifiedItemId}`,
      value: item.qualifiedItemId,
      label: item.displayName,
      kind: 'item',
      aliases: [item.itemId],
      subtitle: item.internalName,
      category: item.kindMetaLabel ?? item.kind,
      sourceKind: 'catalog',
      item,
      itemTexture: textureStates[textureKey] ?? null,
    }
  })
}
