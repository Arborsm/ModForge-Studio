import type { DialogueEntrySummary } from './entries'
import {
  compareDialoguePriority,
  describeDialogueKey,
  findShadowedKeys,
  DIALOGUE_FAMILY_RANK,
  DIALOGUE_FAMILY_TIER,
  DIALOGUE_KEY_TIERS,
  type DescribeDialogueKeyOptions,
  type DialogueKeyDescriptor,
  type DialogueKeyFamily,
  type DialogueKeyTier,
  type DialogueShadowReport,
} from './keys'

export type DialogueTreeEntry = {
  entry: DialogueEntrySummary
  descriptor: DialogueKeyDescriptor
  /** Set when a higher-precedence sibling steals days from this entry. */
  shadow: DialogueShadowReport | null
}

export type DialogueTreeFamilyGroup = {
  family: DialogueKeyFamily
  rank: number
  entries: DialogueTreeEntry[]
}

export type DialogueTreeTierGroup = {
  tier: DialogueKeyTier
  families: DialogueTreeFamilyGroup[]
  entryCount: number
}

/**
 * Groups merged dialogue entries into the left-rail priority tree: tiers in
 * fixed order, families by descending rank, entries by descending precedence.
 * Empty tiers and families are dropped so the rail never renders a bare header.
 */
export function buildDialoguePriorityTree(
  entries: readonly DialogueEntrySummary[],
  options: DescribeDialogueKeyOptions = {},
): DialogueTreeTierGroup[] {
  const shadowByKey = new Map(
    findShadowedKeys(
      entries.map((entry) => entry.key),
      options,
    ).map((report) => [report.key, report]),
  )
  const byFamily = new Map<DialogueKeyFamily, DialogueTreeEntry[]>()

  for (const entry of entries) {
    const descriptor = describeDialogueKey(entry.key, options)
    const bucket = byFamily.get(descriptor.family)
    const node: DialogueTreeEntry = { entry, descriptor, shadow: shadowByKey.get(entry.key) ?? null }
    if (bucket) {
      bucket.push(node)
    } else {
      byFamily.set(descriptor.family, [node])
    }
  }

  return DIALOGUE_KEY_TIERS.flatMap((tier) => {
    const families = Array.from(byFamily.entries())
      .filter(([family]) => DIALOGUE_FAMILY_TIER[family] === tier)
      .map(([family, familyEntries]) => ({
        family,
        rank: DIALOGUE_FAMILY_RANK[family],
        entries: familyEntries.sort(
          (left, right) =>
            compareDialoguePriority(right.descriptor, left.descriptor) ||
            left.entry.key.localeCompare(right.entry.key, undefined, { numeric: true, sensitivity: 'base' }),
        ),
      }))
      .sort((left, right) => right.rank - left.rank)

    if (families.length === 0) {
      return []
    }
    return [{ tier, families, entryCount: families.reduce((total, group) => total + group.entries.length, 0) }]
  })
}
