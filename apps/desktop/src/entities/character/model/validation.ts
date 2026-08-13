/**
 * Character validation, expressed as the workbench-wide `AssetIssue` shape.
 *
 * Layered on top of the generic schema rules (required fields, unknown enum
 * values, duplicate entry keys): the rules here need cross-item context the
 * per-field `validate` callbacks cannot see — duplicate appearance ids inside
 * one list, gift-taste rows whose NPC has no character entry, tokens that would
 * break the slash-delimited row format.
 */

import { isPlainObject, validateAssetEntries, type AssetIssue } from '@entities/asset-schema'
import { GIFT_TASTE_KINDS, isUniversalGiftTasteKey, parseNpcGiftTasteEntry } from '../lib/giftTasteHelpers'
import { CHARACTER_DATA_SCHEMA } from './characterSchema'

/** Content Patcher target holding the gift-taste rows edited alongside characters. */
export const NPC_GIFT_TASTES_ASSET_ID = 'Data/NPCGiftTastes'

function appearanceList(raw: unknown): Record<string, unknown>[] {
  if (!isPlainObject(raw) || !Array.isArray(raw['Appearance'])) {
    return []
  }
  return raw['Appearance'].map((item) => (isPlainObject(item) ? item : {}))
}

/**
 * Appearance rules the game enforces at selection time: ids must be unique
 * within one character, a record that swaps no texture does nothing, and a
 * record excluded both indoors and outdoors can never be picked.
 */
function validateAppearanceEntries(entryKey: string, raw: unknown): AssetIssue[] {
  const issues: AssetIssue[] = []
  const seenIds = new Map<string, number>()

  appearanceList(raw).forEach((appearance, index) => {
    const path = [entryKey, 'Appearance', index] as const
    const id = typeof appearance['Id'] === 'string' ? appearance['Id'].trim() : ''
    if (id !== '') {
      const lower = id.toLowerCase()
      const previous = seenIds.get(lower)
      if (previous === undefined) {
        seenIds.set(lower, index)
      } else {
        issues.push({
          severity: 'error',
          code: 'appearanceIdDuplicate',
          messageKey: 'character.appearanceIdDuplicate',
          path: [...path, 'Id'],
          params: { id, index: previous + 1 },
        })
      }
    }

    const hasPortrait = typeof appearance['Portrait'] === 'string' && appearance['Portrait'].trim() !== ''
    const hasSprite = typeof appearance['Sprite'] === 'string' && appearance['Sprite'].trim() !== ''
    if (!hasPortrait && !hasSprite) {
      issues.push({
        severity: 'warning',
        code: 'appearanceNoTexture',
        messageKey: 'character.appearanceNoTexture',
        path: [...path],
        params: { id: id || String(index + 1) },
      })
    }

    if (appearance['Indoors'] === false && appearance['Outdoors'] === false) {
      issues.push({
        severity: 'warning',
        code: 'appearanceNeverVisible',
        messageKey: 'character.appearanceNeverVisible',
        path: [...path],
        params: { id: id || String(index + 1) },
      })
    }
  })

  return issues
}

/** Validates every `Data/Characters` entry: schema rules plus appearance rules. */
export function validateCharacterEntries(entries: Readonly<Record<string, unknown>>): AssetIssue[] {
  const issues = validateAssetEntries(CHARACTER_DATA_SCHEMA, entries)
  for (const [entryKey, raw] of Object.entries(entries)) {
    issues.push(...validateAppearanceEntries(entryKey, raw))
  }
  return issues
}

/**
 * Validates `Data/NPCGiftTastes` rows against the characters they describe.
 *
 * `characterKeys` are the NPC ids the project defines or overrides; a row whose
 * key matches none of them and is not a `Universal_*` row is reported as info,
 * because it only takes effect if some other pack defines that NPC.
 */
export function validateGiftTasteEntries(entries: Readonly<Record<string, unknown>>, characterKeys: readonly string[] = []): AssetIssue[] {
  const issues: AssetIssue[] = []
  const knownCharacters = new Set(characterKeys.map((key) => key.toLowerCase()))

  for (const [entryKey, raw] of Object.entries(entries)) {
    if (isUniversalGiftTasteKey(entryKey)) {
      continue
    }

    if (knownCharacters.size > 0 && !knownCharacters.has(entryKey.toLowerCase())) {
      issues.push({
        severity: 'info',
        code: 'giftTasteOrphanEntry',
        messageKey: 'character.giftTasteOrphanEntry',
        path: [entryKey],
        params: { entryKey },
      })
    }

    const entry = parseNpcGiftTasteEntry(raw)
    const seenTokens = new Map<string, string>()

    for (const kind of GIFT_TASTE_KINDS) {
      const section = entry[kind]
      if (section.items.length > 0 && section.reaction === '') {
        issues.push({
          severity: 'warning',
          code: 'giftTasteReactionMissing',
          messageKey: 'character.giftTasteReactionMissing',
          path: [entryKey, kind, 'reaction'],
          params: { taste: kind },
        })
      }

      if (section.reaction.includes('/')) {
        issues.push({
          severity: 'error',
          code: 'giftTasteTokenDelimiter',
          messageKey: 'character.giftTasteTokenDelimiter',
          path: [entryKey, kind, 'reaction'],
          params: { taste: kind },
        })
      }

      section.items.forEach((token, index) => {
        if (token.includes('/')) {
          issues.push({
            severity: 'error',
            code: 'giftTasteTokenDelimiter',
            messageKey: 'character.giftTasteTokenDelimiter',
            path: [entryKey, kind, 'items', index],
            params: { taste: kind },
          })
        }

        const lower = token.toLowerCase()
        const previousKind = seenTokens.get(lower)
        if (previousKind === undefined) {
          seenTokens.set(lower, kind)
        } else if (previousKind !== kind) {
          issues.push({
            severity: 'warning',
            code: 'giftTasteDuplicateToken',
            messageKey: 'character.giftTasteDuplicateToken',
            path: [entryKey, kind, 'items', index],
            params: { token, taste: previousKind },
          })
        }
      })
    }
  }

  return issues
}
