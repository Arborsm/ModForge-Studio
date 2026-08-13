/**
 * `Data/Objects` validation, expressed as the workbench-wide `AssetIssue` shape.
 *
 * Layered on top of the generic schema rules (required fields, duplicate entry
 * keys, the per-field `validate` callbacks in `./itemObjectSchema`): the rules
 * here need context a single field cannot see — the internal names the other
 * entries already claim, and the sprite sheets the project actually ships.
 */

import { isPlainObject, validateAssetEntries, type AssetIssue } from '@entities/asset-schema'
import { OBJECT_DATA_SCHEMA } from './itemObjectSchema'

/**
 * Reference data the cross-entry rules check against.
 *
 * An empty list disables its rule rather than reporting everything as missing,
 * because the game directory may not be connected while the author is editing.
 */
export type ItemValidationContext = {
  /** Texture asset names (`Maps/springobjects`) the project or the game provides. */
  knownTextureAssets?: readonly string[]
}

function trimmedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Rejects two entries sharing one internal `Name`.
 *
 * Crafting recipes, machine rules and quest goals still resolve items by
 * internal name, so a collision silently redirects all of them to whichever
 * object the game indexed last.
 */
function validateInternalNames(entries: Readonly<Record<string, unknown>>): AssetIssue[] {
  const issues: AssetIssue[] = []
  const seen = new Map<string, string>()

  for (const [entryKey, raw] of Object.entries(entries)) {
    const name = trimmedText(isPlainObject(raw) ? raw['Name'] : undefined)
    if (name === '') {
      // A blank `Name` is already reported by the schema's `required` rule.
      continue
    }
    const lower = name.toLowerCase()
    const previous = seen.get(lower)
    if (previous === undefined) {
      seen.set(lower, entryKey)
    } else {
      issues.push({
        severity: 'error',
        code: 'objectInternalNameDuplicate',
        messageKey: 'object.internalNameDuplicate',
        path: [entryKey, 'Name'],
        relatedKeys: [previous],
        params: { name, entryKey: previous },
      })
    }
  }

  return issues
}

/**
 * Reports a `Texture` the project cannot resolve. A missing sheet draws the item
 * as an error tile in every menu, and the game logs nothing about it.
 */
function validateTexture(entryKey: string, raw: unknown, knownTextures: Set<string>): AssetIssue[] {
  const texture = trimmedText(isPlainObject(raw) ? raw['Texture'] : undefined)
  if (texture === '' || knownTextures.size === 0 || knownTextures.has(texture.toLowerCase())) {
    return []
  }
  return [
    {
      severity: 'warning',
      code: 'objectTextureMissing',
      messageKey: 'object.textureMissing',
      path: [entryKey, 'Texture'],
      params: { texture },
    },
  ]
}

/**
 * Validates every `Data/Objects` entry: the schema rules plus the cross-entry
 * internal-name rule and the texture-resolution rule.
 */
export function validateObjectEntries(entries: Readonly<Record<string, unknown>>, context: ItemValidationContext = {}): AssetIssue[] {
  const knownTextures = new Set((context.knownTextureAssets ?? []).map((value) => value.toLowerCase()))

  const issues = validateAssetEntries(OBJECT_DATA_SCHEMA, entries)

  for (const [entryKey, raw] of Object.entries(entries)) {
    issues.push(...validateTexture(entryKey, raw, knownTextures))
  }

  issues.push(...validateInternalNames(entries))

  return issues
}
