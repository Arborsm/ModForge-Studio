import { isPlainObject, type AssetEntryDraft } from '@entities/asset-schema'

export type CharacterReadinessStatus = 'complete' | 'needs-attention' | 'optional'

export type CharacterReadiness = {
  ready: boolean
  groups: Record<string, CharacterReadinessStatus>
}

const GROUP_FIELDS: Readonly<Record<string, readonly string[]>> = {
  personality: ['Manner', 'SocialAnxiety', 'Optimism'],
  social: [
    'Calendar',
    'SocialTab',
    'CanSocialize',
    'CanReceiveGifts',
    'CanGreetNearbyCharacters',
    'CanCommentOnPurchasedShopItems',
    'CanVisitIsland',
    'IntroductionsQuest',
    'ItemDeliveryQuests',
    'PerfectionScore',
    'EndSlideShow',
    'FriendsAndFamily',
  ],
  festival: ['DumpsterDiveFriendshipEffect', 'DumpsterDiveEmote', 'FlowerDanceCanDance', 'WinterStarParticipant', 'WinterStarGifts'],
  advanced: [
    'Language',
    'IsDarkSkinned',
    'FormerCharacterNames',
    'FestivalVanillaActorIndex',
    'SpouseAdopts',
    'SpouseWantsChildren',
    'SpouseGiftJealousy',
    'SpouseGiftJealousyFriendshipChange',
    'SpouseRoom',
    'SpousePatio',
    'SpouseFloors',
    'SpouseWallpapers',
    'CustomFields',
  ],
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return true
}

function hasHome(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false
  return value.some((entry) => isPlainObject(entry) && hasText(entry['Location']) && isPlainObject(entry['Tile']))
}

function hasAnyGroupValue(draft: AssetEntryDraft, groupId: keyof typeof GROUP_FIELDS): boolean {
  return GROUP_FIELDS[groupId].some((field) => hasValue(draft.fields[field]))
}

/** Computes compact status icons for the character editor's task tabs. */
export function evaluateCharacterReadiness(
  draft: AssetEntryDraft,
  { issueGroups, hasGiftTastes }: { issueGroups: readonly string[]; hasGiftTastes: boolean },
): CharacterReadiness {
  const issueSet = new Set(issueGroups)
  const required = {
    core: hasText(draft.fields['DisplayName']),
    spawn: hasHome(draft.fields['Home']),
    render: hasText(draft.fields['TextureName']) || hasValue(draft.fields['Appearance']),
  }

  const groups: Record<string, CharacterReadinessStatus> = {
    core: required.core ? 'complete' : 'needs-attention',
    personality: hasAnyGroupValue(draft, 'personality') ? 'complete' : 'optional',
    spawn: required.spawn ? 'complete' : 'needs-attention',
    social: hasAnyGroupValue(draft, 'social') ? 'complete' : 'optional',
    festival: hasGiftTastes || hasAnyGroupValue(draft, 'festival') ? 'complete' : 'optional',
    render: required.render ? 'complete' : 'needs-attention',
    advanced: hasAnyGroupValue(draft, 'advanced') ? 'complete' : 'optional',
  }

  for (const groupId of issueSet) {
    if (groupId in groups) groups[groupId] = 'needs-attention'
  }

  return {
    ready: required.core && required.spawn && required.render && !Object.values(groups).includes('needs-attention'),
    groups,
  }
}
