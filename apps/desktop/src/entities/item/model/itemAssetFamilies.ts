/**
 * The item asset families and which of them this build can edit structurally.
 *
 * The codex covers every family, while structured authoring currently reaches
 * `Data/Objects` only. That boundary lives here as data rather than as a branch
 * in the pages, so the index rail, the editor router and the codex jump all read
 * the same table — an unsupported family is listed and reachable, it just lands
 * on the raw-JSON escape hatch instead of a form.
 */

import { getQualifiedItemId } from './itemIdentity'
import { OBJECT_DATA_ASSET_ID } from './itemObjectFields'
import type { ItemKind } from './itemTypes'

/** Where a jump to an item ends up: the schema-driven form, or raw JSON. */
export type ItemAuthoringEditor = 'structured' | 'raw'

export type ItemAssetFamily = {
  kind: ItemKind
  /** Content Patcher target of the family's data asset, e.g. `Data/Objects`. */
  assetId: string
  /** Which editor an entry of this family opens in. */
  editor: ItemAuthoringEditor
}

/**
 * Every item family, in the order the index rail lists them: the editable one
 * first, then the rest by how often mods touch them.
 *
 * `Data/hats` is spelled lowercase because the shipped asset is — Content
 * Patcher matches target names case-insensitively, but the game data and the
 * codex both use this spelling, so the patch target reads the same as the file.
 */
export const ITEM_ASSET_FAMILIES: readonly ItemAssetFamily[] = [
  { kind: 'object', assetId: OBJECT_DATA_ASSET_ID, editor: 'structured' },
  { kind: 'big-craftable', assetId: 'Data/BigCraftables', editor: 'raw' },
  { kind: 'weapon', assetId: 'Data/Weapons', editor: 'raw' },
  { kind: 'tool', assetId: 'Data/Tools', editor: 'raw' },
  { kind: 'boots', assetId: 'Data/Boots', editor: 'raw' },
  { kind: 'hat', assetId: 'Data/hats', editor: 'raw' },
  { kind: 'shirt', assetId: 'Data/Shirts', editor: 'raw' },
  { kind: 'pants', assetId: 'Data/Pants', editor: 'raw' },
  { kind: 'trinket', assetId: 'Data/Trinkets', editor: 'raw' },
  { kind: 'furniture', assetId: 'Data/Furniture', editor: 'raw' },
]

function normalizeAssetId(assetId: string): string {
  return assetId.trim().replaceAll('\\', '/').toLowerCase()
}

/** Family record of one item kind. Every `ItemKind` has exactly one. */
export function findItemAssetFamily(kind: ItemKind): ItemAssetFamily {
  const family = ITEM_ASSET_FAMILIES.find((candidate) => candidate.kind === kind)
  if (family === undefined) {
    // Unreachable while `ITEM_ASSET_FAMILIES` covers `ItemKind`; the throw keeps
    // a future kind from silently resolving to the object editor.
    throw new Error(`No item asset family declared for kind "${kind}"`)
  }
  return family
}

/** Family a Content Patcher target belongs to, or null when it is not an item asset. */
export function findItemAssetFamilyByAssetId(assetId: string): ItemAssetFamily | null {
  const normalized = normalizeAssetId(assetId)
  return ITEM_ASSET_FAMILIES.find((family) => normalizeAssetId(family.assetId) === normalized) ?? null
}

/** True when the target names an item asset family this build edits structurally. */
export function isStructuredItemAsset(assetId: string): boolean {
  return findItemAssetFamilyByAssetId(assetId)?.editor === 'structured'
}

/** Where an "open in item authoring" jump should land. */
export type ItemAuthoringTarget = {
  kind: ItemKind
  assetId: string
  /** Entry id to select inside the asset; null opens the family without one. */
  itemId: string | null
  /** Qualified id (`(O)128`) of `itemId`, used to label the jump and match codex rows. */
  qualifiedItemId: string | null
  editor: ItemAuthoringEditor
}

/** Opens a whole family, e.g. when the index rail switches to another asset. */
export function resolveItemFamilyTarget(kind: ItemKind): ItemAuthoringTarget {
  const family = findItemAssetFamily(kind)
  return { kind, assetId: family.assetId, itemId: null, qualifiedItemId: null, editor: family.editor }
}

/**
 * Resolves a codex row to the patch target that should open.
 *
 * A blank id degrades to the family target rather than to null: the author asked
 * to open something, and an unsupported family resolves too — with
 * `editor: 'raw'` — because a jump must never dead-end. It falls back to the raw
 * escape hatch instead of doing nothing.
 */
export function resolveItemAuthoringTarget(kind: ItemKind, itemId: string): ItemAuthoringTarget {
  const trimmed = itemId.trim()
  if (trimmed === '') {
    return resolveItemFamilyTarget(kind)
  }
  const family = findItemAssetFamily(kind)
  return {
    kind,
    assetId: family.assetId,
    itemId: trimmed,
    qualifiedItemId: getQualifiedItemId(kind, trimmed),
    editor: family.editor,
  }
}
