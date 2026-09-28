import { isPlainObject, type AssetEntryDraft } from '@entities/asset-schema'

export type ItemReadinessStatus = 'complete' | 'needs-attention' | 'optional'
export type ItemReadiness = { ready: boolean; groups: Record<string, ItemReadinessStatus> }

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return true
}

/** Computes task status for each item editor tab. */
export function evaluateItemReadiness(draft: AssetEntryDraft, { issueGroups }: { issueGroups: readonly string[] }): ItemReadiness {
  const fields = draft.fields
  const basicsReady = hasText(fields['Name']) && hasText(fields['DisplayName']) && hasText(fields['Type'])
  const spriteReady = typeof fields['SpriteIndex'] === 'number' && Number.isInteger(fields['SpriteIndex']) && fields['SpriteIndex'] >= 0
  const groups: Record<string, ItemReadinessStatus> = {
    basics: basicsReady ? 'complete' : 'needs-attention',
    economy: [
      'Price',
      'CanBeGivenAsGift',
      'CanBeTrashed',
      'ExcludeFromShippingCollection',
      'ExcludeFromFishingCollection',
      'ExcludeFromRandomSale',
    ].some((key) => hasValue(fields[key]))
      ? 'complete'
      : 'optional',
    consumable: ['Edibility', 'IsDrink', 'Buffs'].some((key) => hasValue(fields[key])) ? 'complete' : 'optional',
    sprite: spriteReady ? 'complete' : 'needs-attention',
    geode: ['GeodeDropsDefaultItems', 'GeodeDrops', 'ArtifactSpotChances'].some((key) => hasValue(fields[key])) ? 'complete' : 'optional',
    advanced: hasValue(fields['CustomFields']) ? 'complete' : 'optional',
  }

  for (const groupId of issueGroups) {
    if (groupId in groups) groups[groupId] = 'needs-attention'
  }
  return { ready: basicsReady && spriteReady && !Object.values(groups).includes('needs-attention'), groups }
}
