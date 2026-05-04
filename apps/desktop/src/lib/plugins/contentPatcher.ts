import type { ContentPatcherPatchSummary } from '../desktop'
import type {
  ContentPatcherProjectSnapshot,
  ContentPatcherSimulationContext as DesktopContentPatcherSimulationContext,
  SimulateContentPatcherRequest,
} from '../desktop'

type JsonObject = Record<string, unknown>

type ParsedJsonResult = {
  value: unknown | null
  error: string | null
}

export function createDefaultContentPatcherSimulationContext(): ContentPatcherBackendSimulationContext {
  return {
    season: '',
    weather: '',
    day: undefined,
    dayOfWeek: '',
    daysPlayed: undefined,
    year: undefined,
    time: undefined,
    playerName: '',
    playerGender: '',
    farmName: '',
    locationName: '',
    spouse: '',
    isMainPlayer: undefined,
    stardropCount: undefined,
    hasFlags: [],
    hasSeenEvents: [],
    hasConversationTopics: [],
    hasDialogueAnswers: [],
    hasWalletItems: [],
    hasProfessions: [],
    hasCraftingRecipes: [],
    hasCookingRecipes: [],
    skillLevels: {},
    hasActiveQuests: [],
    hasCompletedQuests: [],
    hasItems: [],
    hasPet: undefined,
    petType: '',
    hasChildren: undefined,
    childCount: undefined,
    dailyLuck: undefined,
    hasCaughtFish: [],
    hasReadLetters: [],
    hasVisitedLocations: [],
    isOutdoors: undefined,
    locationContext: '',
    locationUniqueName: '',
    locationOwnerId: '',
    preferredPet: '',
    farmCave: '',
    farmMapAsset: '',
    havingChild: undefined,
    pregnant: undefined,
    roommate: '',
    hearts: {},
    childNames: [],
    childGenders: [],
    dayEvent: '',
    farmType: '',
    farmhouseUpgrade: undefined,
    isCommunityCenterComplete: undefined,
    isJojaMartComplete: undefined,
    language: '',
    relationships: {},
    config: {},
    installedMods: [],
    customTokens: {},
    ignoreEntryWhenConditions: false,
  }
}

export type ContentPatcherBackendSimulationContext = {
  season: string
  weather: string
  day: number | undefined
  dayOfWeek: string
  daysPlayed: number | undefined
  year: number | undefined
  time: number | undefined
  playerName: string
  playerGender: string
  farmName: string
  locationName: string
  spouse: string
  isMainPlayer: boolean | undefined
  stardropCount: number | undefined
  hasFlags: string[]
  hasSeenEvents: string[]
  hasConversationTopics: string[]
  hasDialogueAnswers: string[]
  hasWalletItems: string[]
  hasProfessions: string[]
  hasCraftingRecipes: string[]
  hasCookingRecipes: string[]
  skillLevels: Record<string, number>
  hasActiveQuests: string[]
  hasCompletedQuests: string[]
  hasItems: string[]
  hasPet: boolean | undefined
  petType: string
  hasChildren: boolean | undefined
  childCount: number | undefined
  dailyLuck: number | undefined
  hasCaughtFish: string[]
  hasReadLetters: string[]
  hasVisitedLocations: string[]
  isOutdoors: boolean | undefined
  locationContext: string
  locationUniqueName: string
  locationOwnerId: string
  preferredPet: string
  farmCave: string
  farmMapAsset: string
  havingChild: boolean | undefined
  pregnant: boolean | undefined
  roommate: string
  hearts: Record<string, number>
  childNames: string[]
  childGenders: string[]
  dayEvent: string
  farmType: string
  farmhouseUpgrade: number | undefined
  isCommunityCenterComplete: boolean | undefined
  isJojaMartComplete: boolean | undefined
  language: string
  relationships: Record<string, string>
  config: Record<string, string | number | boolean>
  installedMods: string[]
  customTokens: Record<string, unknown>
  ignoreEntryWhenConditions: boolean
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePatchTarget(value: unknown) {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(', ')
  }

  return ''
}

function normalizeBackendSimulationContext(
  context: ContentPatcherBackendSimulationContext,
): DesktopContentPatcherSimulationContext {
  const season = context.season.trim()
  const weather = context.weather.trim()
  const playerName = context.playerName.trim()
  const playerGender = context.playerGender.trim()
  const farmName = context.farmName.trim()
  const locationName = context.locationName.trim()
  const spouse = context.spouse.trim()
  const petType = context.petType.trim()
  const farmType = context.farmType.trim()
  const language = context.language.trim()
  const locationContext = context.locationContext.trim()
  const locationUniqueName = context.locationUniqueName.trim()
  const locationOwnerId = context.locationOwnerId.trim()
  const preferredPet = context.preferredPet.trim()
  const farmCave = context.farmCave.trim()
  const farmMapAsset = context.farmMapAsset.trim()
  const roommate = context.roommate.trim()
  const dayEvent = context.dayEvent.trim()
  return {
    season: season || undefined,
    weather: weather || undefined,
    day: context.day,
    dayOfWeek: context.dayOfWeek.trim() || undefined,
    daysPlayed: context.daysPlayed,
    year: context.year,
    time: context.time,
    playerName: playerName || undefined,
    playerGender: playerGender || undefined,
    farmName: farmName || undefined,
    locationName: locationName || undefined,
    locationContext: locationContext || undefined,
    locationUniqueName: locationUniqueName || undefined,
    locationOwnerId: locationOwnerId || undefined,
    spouse: spouse || undefined,
    roommate: roommate || undefined,
    isMainPlayer: context.isMainPlayer,
    isOutdoors: context.isOutdoors,
    stardropCount: context.stardropCount,
    hasFlags: context.hasFlags,
    hasSeenEvents: context.hasSeenEvents,
    hasCaughtFish: context.hasCaughtFish,
    hasReadLetters: context.hasReadLetters,
    hasVisitedLocations: context.hasVisitedLocations,
    hasConversationTopics: context.hasConversationTopics,
    hasDialogueAnswers: context.hasDialogueAnswers,
    hasWalletItems: context.hasWalletItems,
    hasProfessions: context.hasProfessions,
    hasCraftingRecipes: context.hasCraftingRecipes,
    hasCookingRecipes: context.hasCookingRecipes,
    skillLevels: context.skillLevels,
    hasActiveQuests: context.hasActiveQuests,
    hasCompletedQuests: context.hasCompletedQuests,
    hasItems: context.hasItems,
    hasPet: context.hasPet,
    petType: petType || undefined,
    preferredPet: preferredPet || undefined,
    hasChildren: context.hasChildren,
    childCount: context.childCount,
    childNames: context.childNames,
    childGenders: context.childGenders,
    havingChild: context.havingChild,
    pregnant: context.pregnant,
    dailyLuck: context.dailyLuck,
    hearts: context.hearts,
    farmType: farmType || undefined,
    farmCave: farmCave || undefined,
    farmMapAsset: farmMapAsset || undefined,
    farmhouseUpgrade: context.farmhouseUpgrade,
    isCommunityCenterComplete: context.isCommunityCenterComplete,
    isJojaMartComplete: context.isJojaMartComplete,
    dayEvent: dayEvent || undefined,
    language: language || undefined,
    relationships: context.relationships,
    config: context.config,
    installedMods: context.installedMods.map((value) => value.trim()).filter(Boolean),
    customTokens: context.customTokens,
    ignoreEntryWhenConditions: context.ignoreEntryWhenConditions,
  }
}

export function buildContentPatcherSimulationRequest(
  snapshot: ContentPatcherProjectSnapshot,
  context: ContentPatcherBackendSimulationContext,
  options?: {
    path?: string | null
    gameRootPath?: string | null
    manifestJson?: string | null
    contentJson?: string | null
  },
): SimulateContentPatcherRequest {
  return {
    path: options?.path ?? null,
    gameRootPath: options?.gameRootPath ?? null,
    snapshot,
    manifestJson: options?.manifestJson ?? null,
    contentJson: options?.contentJson ?? null,
    context: normalizeBackendSimulationContext(context),
  }
}

function buildPatchSummary(index: number, patch: JsonObject): ContentPatcherPatchSummary {
  const action = asTrimmedString(patch.Action) || 'Unknown'
  const target = normalizePatchTarget(patch.Target)
  const fromFile = asTrimmedString(patch.FromFile) || null
  const logName = asTrimmedString(patch.LogName) || (target ? `${action} -> ${target}` : `${action} #${index}`)
  const whenKeys = isJsonObject(patch.When) ? Object.keys(patch.When).sort((left, right) => left.localeCompare(right)) : []
  const updateKeys = Array.isArray(patch.Update)
    ? patch.Update.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    : []

  return {
    id: `patch:${index}`,
    index,
    action,
    target,
    fromFile,
    logName,
    whenKeys,
    hasWhen: whenKeys.length > 0,
    updateKeys,
  }
}

export function stringifyPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function parseJsonText(text: string): ParsedJsonResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      value: null,
      error: 'JSON is empty.',
    }
  }

  try {
    return {
      value: JSON.parse(trimmed),
      error: null,
    }
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function ensureJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? { ...value } : {}
}

export function summarizeContentPatcherContent(value: unknown) {
  const content = ensureJsonObject(value)
  const rawChanges = Array.isArray(content.Changes) ? content.Changes : []
  const patches = rawChanges
    .map((entry, index) => (isJsonObject(entry) ? buildPatchSummary(index, entry) : null))
    .filter((entry): entry is ContentPatcherPatchSummary => Boolean(entry))
  const configEntries = isJsonObject(content.ConfigSchema)
    ? Object.entries(content.ConfigSchema)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, definition]) => ({
          key,
          defaultValue: isJsonObject(definition) ? definition.Default ?? null : null,
        }))
    : []
  const configKeys = configEntries.map((entry) => entry.key)

  return {
    format: typeof content.Format === 'string' ? content.Format : null,
    changeCount: rawChanges.length,
    includeCount: Array.isArray(content.Include) ? content.Include.length : 0,
    dynamicTokenCount: Array.isArray(content.DynamicTokens) ? content.DynamicTokens.length : 0,
    configKeys,
    configEntries,
    patches,
  }
}

export function getPatchObject(value: unknown, patchId: string) {
  const summary = summarizeContentPatcherContent(value)
  const selected = summary.patches.find((patch) => patch.id === patchId)
  if (!selected) {
    return null
  }

  const content = ensureJsonObject(value)
  const rawChanges = Array.isArray(content.Changes) ? content.Changes : []
  const patch = rawChanges[selected.index]
  return isJsonObject(patch) ? { ...patch } : null
}

export function updateManifestField(value: unknown, field: string, nextValue: string) {
  const manifest = ensureJsonObject(value)
  const trimmed = nextValue.trim()
  if (trimmed) {
    manifest[field] = trimmed
  } else {
    delete manifest[field]
  }
  return manifest
}

function withChanges(value: unknown, updater: (changes: unknown[]) => unknown[]) {
  const content = ensureJsonObject(value)
  const changes = Array.isArray(content.Changes) ? [...content.Changes] : []
  content.Changes = updater(changes)
  return content
}

export function addPatch(value: unknown) {
  return withChanges(value, (changes) => [
    ...changes,
    {
      LogName: 'New Patch',
      Action: 'EditData',
      Target: '',
    },
  ])
}

export function removePatch(value: unknown, patchId: string) {
  const patch = summarizeContentPatcherContent(value).patches.find((entry) => entry.id === patchId)
  if (!patch) {
    return ensureJsonObject(value)
  }
  return withChanges(value, (changes) => changes.filter((_, index) => index !== patch.index))
}

function replacePatch(value: unknown, patchId: string, nextPatch: JsonObject) {
  const patch = summarizeContentPatcherContent(value).patches.find((entry) => entry.id === patchId)
  if (!patch) {
    return ensureJsonObject(value)
  }
  return withChanges(value, (changes) => changes.map((entry, index) => (index === patch.index ? nextPatch : entry)))
}

export function updatePatchField(value: unknown, patchId: string, field: string, nextValue: string | boolean) {
  const currentPatch = getPatchObject(value, patchId)
  if (!currentPatch) {
    return ensureJsonObject(value)
  }

  if (typeof nextValue === 'boolean') {
    currentPatch[field] = nextValue
  } else {
    const trimmed = nextValue.trim()
    if (trimmed) {
      currentPatch[field] = trimmed
    } else {
      delete currentPatch[field]
    }
  }

  return replacePatch(value, patchId, currentPatch)
}

export function updatePatchWhen(value: unknown, patchId: string, nextValue: string) {
  const currentPatch = getPatchObject(value, patchId)
  if (!currentPatch) {
    return {
      value: ensureJsonObject(value),
      error: 'Patch not found.',
    }
  }

  const trimmed = nextValue.trim()
  if (!trimmed) {
    delete currentPatch.When
    return {
      value: replacePatch(value, patchId, currentPatch),
      error: null,
    }
  }

  const parsed = parseJsonText(trimmed)
  if (parsed.error) {
    return {
      value: ensureJsonObject(value),
      error: parsed.error,
    }
  }

  if (!isJsonObject(parsed.value)) {
    return {
      value: ensureJsonObject(value),
      error: 'When must be a JSON object.',
    }
  }

  currentPatch.When = parsed.value
  return {
    value: replacePatch(value, patchId, currentPatch),
    error: null,
  }
}
