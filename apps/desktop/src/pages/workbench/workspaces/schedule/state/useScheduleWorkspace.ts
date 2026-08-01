import { useEffect, useState } from 'react'
import {
  clearGameAssetLocaleCache,
  invalidateLocalizedTextCache,
  loadResourceRegistry,
  loadTextAsset,
  resolveLocalizedText,
} from '@entities/game/api'
import type { AssetDraftPort } from '@features/cp-maker'
import type { LocaleCode } from '@locales'
import { useLocale } from '@locales/provider'
import { normalizeCachePathSegment } from '@shared/lib/assets'
import { useWorkbenchEnvironment, useWorkbenchProject } from '../../../model/workbenchModuleContexts'
import { useWorkbenchAssetDraftPort, type WorkbenchDraftSaveState } from '../../../model/useWorkbenchAssetDraftPort'
import {
  buildSchedulePriorityGroups,
  buildScheduleEntrySummaries,
  buildScheduleNpcOptions,
  buildScheduleTarget,
  collectProjectNpcIds,
  collectScheduleModelIssues,
  createSchedulePointAfter,
  findLastSchedulePoint,
  getScheduleEntryKeyError,
  parseScheduleScript,
  type ScheduleEntryModel,
  type ScheduleEntrySummary,
  type ScheduleModelIssue,
  type SchedulePatchEditorState,
  type SchedulePriorityGroup,
  type ScheduleSegment,
  serializeScheduleScript,
} from '../entities/schedule'

const CHARACTER_DATA_ASSET_PATH = 'Content\\Data\\Characters.xnb'

/**
 * Vanilla animation catalog. Keys are the exact animation names a schedule
 * segment may reference (`abigail_read`, `gus_cooking`, …), so the datalist is
 * sourced from the game instead of a hand-kept guess list.
 */
const ANIMATION_DESCRIPTIONS_ASSET_PATH = 'Content\\Data\\animationDescriptions.xnb'

/** CP Maker workspace the schedule patches belong to. */
const SCHEDULE_WORKSPACE_ID = 'schedules' as const

export type ScheduleEditorMode = 'structured' | 'raw'

type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error'

export type ScheduleLocationOption = {
  value: string
  label: string
  /**
   * Absolute path of the location's `.xnb` map file as reported by the resource
   * registry. `loadMapAsset` strip-prefixes its `mapPath` against the game root,
   * so the map panel needs the absolute path, not the logical asset name.
   */
  mapPath: string | null
}

/** Entry the author is editing, resolved from the staged draft each render. */
export type ScheduleActiveEntry = {
  summary: ScheduleEntrySummary
  /** Parsed view of the effective script; the segment table edits this. */
  model: ScheduleEntryModel
  issues: ScheduleModelIssue[]
  /** True while the entry only exists in the vanilla schedule file. */
  readOnly: boolean
}

const vanillaCharactersCache = new Map<string, Promise<Record<string, unknown>>>()
const vanillaScheduleCache = new Map<string, Promise<Record<string, string> | null>>()
const animationDescriptionsCache = new Map<string, Promise<string[]>>()

function getRootLocaleCacheKey(rootPath: string, locale: LocaleCode) {
  return `${normalizeCachePathSegment(rootPath)}::${locale}`
}

function getScheduleCacheKey(rootPath: string, npcId: string, locale: LocaleCode) {
  return `${normalizeCachePathSegment(rootPath)}::${npcId}::${locale}`
}

async function readCachedPromise<T>(cache: Map<string, Promise<T>>, key: string, loader: () => Promise<T>) {
  const cached = cache.get(key)
  if (cached) {
    return cached
  }

  const pending = loader().catch((error) => {
    cache.delete(key)
    throw error
  })

  cache.set(key, pending)
  return pending
}

function parseStringRecord(content: string): Record<string, string> {
  const parsed = JSON.parse(content) as Record<string, unknown>
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }
  return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => (typeof value === 'string' ? ([[key, value]] as const) : [])))
}

function loadVanillaCharacters(rootPath: string, locale: LocaleCode) {
  return readCachedPromise(vanillaCharactersCache, getRootLocaleCacheKey(rootPath, locale), async () => {
    const asset = await loadTextAsset(rootPath, CHARACTER_DATA_ASSET_PATH, locale)
    const parsed = JSON.parse(asset.content) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    // Resolve `[LocalizedText …]` display names once, so every consumer of this
    // cache reads the name the player sees instead of the raw token.
    await Promise.all(
      Object.values(parsed).map(async (entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return
        }
        const record = entry as Record<string, unknown>
        if (typeof record['DisplayName'] === 'string') {
          record['__resolvedDisplayName'] = await resolveLocalizedText(rootPath, locale, record['DisplayName'])
        }
      }),
    )
    return parsed
  })
}

/**
 * Loads the vanilla animation-name catalog. A missing file is a hard failure
 * rather than a silent empty list: the caller surfaces it so the author knows
 * the suggestions are unavailable instead of believing the game has none.
 */
function loadAnimationDescriptions(rootPath: string, locale: LocaleCode) {
  return readCachedPromise(animationDescriptionsCache, getRootLocaleCacheKey(rootPath, locale), async () => {
    const asset = await loadTextAsset(rootPath, ANIMATION_DESCRIPTIONS_ASSET_PATH, locale)
    return Object.keys(parseStringRecord(asset.content)).sort((left, right) => left.localeCompare(right))
  })
}

/**
 * Orders animation suggestions so the ones belonging to the NPC being edited
 * come first. Stardew animation keys are conventionally `<npc>_<activity>`, so
 * the prefix match is what makes the datalist useful without hiding the rest of
 * the catalog (authors legitimately reuse another NPC's animation).
 */
function rankAnimationNames(names: string[], npcId: string | null) {
  if (npcId === null || npcId === '') {
    return names
  }

  const prefix = `${npcId.toLowerCase()}_`
  const own: string[] = []
  const rest: string[] = []
  for (const name of names) {
    if (name.toLowerCase().startsWith(prefix)) {
      own.push(name)
    } else {
      rest.push(name)
    }
  }

  return [...own, ...rest]
}

function loadVanillaSchedule(rootPath: string, npcId: string, locale: LocaleCode) {
  return readCachedPromise(vanillaScheduleCache, getScheduleCacheKey(rootPath, npcId, locale), async () => {
    let content: string
    try {
      const asset = await loadTextAsset(rootPath, `Content\\Characters\\schedules\\${npcId}.xnb`, locale)
      content = asset.content
    } catch {
      // Missing schedule file is a normal state (many NPCs have none), not an error.
      return null
    }
    return parseStringRecord(content)
  })
}

/**
 * Rebuilds the schedule patch state from the staged draft. The editor state
 * shape (`entries` / `disabledEntries` / `entryLabels`) is what the port stores,
 * so this is a projection rather than a second source of truth.
 */
export function readSchedulePatchStateFromPort(port: AssetDraftPort | null, assetId: string): SchedulePatchEditorState {
  const state: SchedulePatchEditorState = { entries: {}, disabledEntries: {}, entryLabels: {} }
  if (!port) {
    return state
  }
  for (const key of port.listEntries(assetId)) {
    const value = port.readValue(assetId, key)
    if (typeof value !== 'string') {
      continue
    }
    const meta = port.readEntryMeta(assetId, key)
    if (meta.enabled) {
      state.entries[key] = value
    } else {
      state.disabledEntries[key] = value
    }
    if (meta.label !== null) {
      state.entryLabels[key] = meta.label
    }
  }
  return state
}

/**
 * State for the schedule authoring workspace: NPC catalog (vanilla + project),
 * vanilla schedule loading with a refreshable module-level cache, and the
 * merged entry list.
 *
 * Every edit stages straight into the CP draft through the shared
 * `AssetDraftPort` — there is no second copy of an entry being edited — so
 * saving is one `commit` and discarding is one `revert`, the same policy the
 * character and building pages use.
 */
export function useScheduleWorkspace() {
  const environment = useWorkbenchEnvironment()
  const project = useWorkbenchProject()
  const locale = useLocale()
  const { port, saveState } = useWorkbenchAssetDraftPort(SCHEDULE_WORKSPACE_ID)
  const rootPath = environment.directoryInfo?.rootPath ?? null

  const [vanillaCharacters, setVanillaCharacters] = useState<{
    status: AsyncStatus
    data: Record<string, unknown> | null
    errorMessage: string | null
  }>({ status: 'idle', data: null, errorMessage: null })
  const [npcListRefreshToken, setNpcListRefreshToken] = useState(0)
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null)
  const [vanillaSchedule, setVanillaSchedule] = useState<{
    status: AsyncStatus
    npcId: string | null
    entries: Record<string, string> | null
    errorMessage: string | null
  }>({ status: 'idle', npcId: null, entries: null, errorMessage: null })
  const [scheduleRefreshToken, setScheduleRefreshToken] = useState(0)
  const [locationState, setLocationState] = useState<{ status: AsyncStatus; options: ScheduleLocationOption[] }>({
    status: 'idle',
    options: [],
  })
  const [animationState, setAnimationState] = useState<{ status: AsyncStatus; names: string[] }>({ status: 'idle', names: [] })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mode, setMode] = useState<ScheduleEditorMode>('structured')
  const [deleteArmed, setDeleteArmed] = useState(false)
  // Creating the first entry of an NPC needs the patch to exist first, and a
  // freshly added patch only reaches the port on the next render.
  const [pendingEntry, setPendingEntry] = useState<{ npcId: string; patchId: string; key: string; script: string } | null>(null)

  // ── NPC catalog ──

  useEffect(() => {
    if (!rootPath) {
      setVanillaCharacters({ status: 'ready', data: null, errorMessage: null })
      return
    }

    let cancelled = false
    setVanillaCharacters({ status: 'loading', data: null, errorMessage: null })

    void (async () => {
      try {
        const data = await loadVanillaCharacters(rootPath, locale)
        if (!cancelled) {
          setVanillaCharacters({ status: 'ready', data, errorMessage: null })
        }
      } catch (error) {
        if (!cancelled) {
          setVanillaCharacters({ status: 'error', data: null, errorMessage: error instanceof Error ? error.message : String(error) })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [rootPath, locale, npcListRefreshToken])

  const allProjectPatches = project.activeDraft?.patches ?? []
  const npcOptions = buildScheduleNpcOptions(vanillaCharacters.data, collectProjectNpcIds(allProjectPatches))

  // Converges on a valid NPC selection after loads and project patch changes;
  // the functional update bails out when the selection is already valid.
  useEffect(() => {
    setSelectedNpcId((current) => {
      if (current && npcOptions.some((option) => option.id === current)) {
        return current
      }
      return npcOptions[0]?.id ?? null
    })
  })

  // ── Vanilla schedule for the selected NPC ──

  useEffect(() => {
    if (!selectedNpcId) {
      setVanillaSchedule({ status: 'idle', npcId: null, entries: null, errorMessage: null })
      return
    }

    if (!rootPath) {
      setVanillaSchedule({ status: 'ready', npcId: selectedNpcId, entries: null, errorMessage: null })
      return
    }

    let cancelled = false
    setVanillaSchedule({ status: 'loading', npcId: selectedNpcId, entries: null, errorMessage: null })

    void (async () => {
      try {
        const entries = await loadVanillaSchedule(rootPath, selectedNpcId, locale)
        if (!cancelled) {
          setVanillaSchedule({ status: 'ready', npcId: selectedNpcId, entries, errorMessage: null })
        }
      } catch (error) {
        if (!cancelled) {
          setVanillaSchedule({
            status: 'error',
            npcId: selectedNpcId,
            entries: null,
            errorMessage: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [rootPath, selectedNpcId, locale, scheduleRefreshToken])

  // ── Location catalog for the structured point editor ──

  useEffect(() => {
    if (!rootPath) {
      setLocationState({ status: 'ready', options: [] })
      return
    }

    let cancelled = false
    setLocationState({ status: 'loading', options: [] })

    void (async () => {
      try {
        const registry = await loadResourceRegistry(rootPath, locale)
        if (cancelled) {
          return
        }

        const seen = new Set<string>()
        const options: ScheduleLocationOption[] = []
        for (const entry of registry.entries) {
          if (entry.kind !== 'location' || seen.has(entry.value)) {
            continue
          }
          seen.add(entry.value)
          options.push({ value: entry.value, label: entry.label || entry.value, mapPath: entry.absolutePath })
        }
        options.sort((left, right) => left.label.localeCompare(right.label))
        setLocationState({ status: 'ready', options })
      } catch {
        if (!cancelled) {
          // The registry only powers hints/suggestions; on failure the editor
          // keeps free-text input and hides "unknown location" hints.
          setLocationState({ status: 'error', options: [] })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [rootPath, locale])

  // ── Vanilla animation catalog for the animation datalist ──

  useEffect(() => {
    if (!rootPath) {
      setAnimationState({ status: 'ready', names: [] })
      return
    }

    let cancelled = false
    setAnimationState({ status: 'loading', names: [] })

    void (async () => {
      try {
        const names = await loadAnimationDescriptions(rootPath, locale)
        if (!cancelled) {
          setAnimationState({ status: 'ready', names })
        }
      } catch {
        if (!cancelled) {
          // Suggestions only; the animation field stays free-text either way.
          setAnimationState({ status: 'error', names: [] })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [rootPath, locale])

  // ── Merged entries (project entries override vanilla) ──

  const assetId = selectedNpcId === null ? null : buildScheduleTarget(selectedNpcId)
  const patchState =
    assetId === null ? { entries: {}, disabledEntries: {}, entryLabels: {} } : readSchedulePatchStateFromPort(port, assetId)
  const scheduleResolved =
    vanillaSchedule.npcId === selectedNpcId && (vanillaSchedule.status === 'ready' || vanillaSchedule.status === 'error')
  const vanillaEntries = vanillaSchedule.status === 'ready' ? vanillaSchedule.entries : null
  const entries = scheduleResolved ? buildScheduleEntrySummaries(vanillaEntries, patchState) : []
  const priorityGroups: SchedulePriorityGroup[] = buildSchedulePriorityGroups(entries)
  const hasVanillaSchedule = vanillaSchedule.status === 'ready' && vanillaSchedule.entries != null

  // Stages the entry a create action asked for, once its patch is reachable.
  useEffect(() => {
    if (pendingEntry === null || port === null || !port.hasAsset(buildScheduleTarget(pendingEntry.npcId))) {
      return
    }
    const target = buildScheduleTarget(pendingEntry.npcId)
    port.updatePatch(pendingEntry.patchId, { logName: `Schedules: ${pendingEntry.npcId}` })
    port.stageValue(target, pendingEntry.key, pendingEntry.script)
    setSelectedKey(pendingEntry.key)
    setMode('structured')
    setPendingEntry(null)
  }, [pendingEntry, port])

  const activeSummary = selectedKey === null ? null : (entries.find((entry) => entry.key === selectedKey) ?? null)
  const active: ScheduleActiveEntry | null =
    activeSummary === null
      ? null
      : {
          summary: activeSummary,
          model: parseScheduleScript(activeSummary.script),
          issues: collectScheduleModelIssues(parseScheduleScript(activeSummary.script)),
          readOnly: activeSummary.origin === 'vanilla',
        }

  // Recover the library when the active key disappears. The library owns
  // entry selection; loading an NPC must not jump straight into an editor.
  useEffect(() => {
    if (!scheduleResolved) {
      return
    }
    if (selectedKey === null || entries.some((entry) => entry.key === selectedKey)) {
      return
    }
    setSelectedKey(null)
    setDeleteArmed(false)
  })

  // ── Handlers ──

  function selectNpc(npcId: string) {
    if (npcId === selectedNpcId) {
      return
    }
    setSelectedNpcId(npcId)
    setSelectedKey(null)
    setDeleteArmed(false)
    setMode('structured')
  }

  function selectEntry(key: string) {
    if (key === selectedKey) {
      return
    }
    setSelectedKey(key)
    setDeleteArmed(false)
    setMode(entries.find((entry) => entry.key === key)?.structured === false ? 'raw' : 'structured')
  }

  function closeEntry() {
    setSelectedKey(null)
    setDeleteArmed(false)
    setMode('structured')
  }

  function refreshVanilla() {
    if (!rootPath) {
      return
    }
    if (selectedNpcId) {
      vanillaScheduleCache.delete(getScheduleCacheKey(rootPath, selectedNpcId, locale))
    }
    vanillaCharactersCache.delete(getRootLocaleCacheKey(rootPath, locale))
    clearGameAssetLocaleCache(locale)
    invalidateLocalizedTextCache(rootPath)
    setScheduleRefreshToken((token) => token + 1)
    setNpcListRefreshToken((token) => token + 1)
  }

  function retryNpcList() {
    if (rootPath) {
      vanillaCharactersCache.delete(getRootLocaleCacheKey(rootPath, locale))
    }
    setNpcListRefreshToken((token) => token + 1)
  }

  function retrySchedule() {
    if (rootPath && selectedNpcId) {
      vanillaScheduleCache.delete(getScheduleCacheKey(rootPath, selectedNpcId, locale))
    }
    setScheduleRefreshToken((token) => token + 1)
  }

  /** Validates a new key against the entries already staged for this NPC. */
  function getNewEntryKeyError(key: string): 'empty' | 'conflict' | null {
    const trimmed = key.trim()
    if (trimmed !== '' && entries.some((entry) => entry.key === trimmed)) {
      return 'conflict'
    }
    return getScheduleEntryKeyError(patchState, key, null)
  }

  /** Creates an empty project entry, adding the NPC's schedule patch if needed. */
  function createEntry(key: string) {
    const trimmed = key.trim()
    if (port === null || selectedNpcId === null || getNewEntryKeyError(trimmed) !== null) {
      return
    }
    const target = buildScheduleTarget(selectedNpcId)
    if (port.hasAsset(target)) {
      port.stageValue(target, trimmed, '')
    } else {
      const patchId = port.addPatch('EditData', target)
      if (patchId === null) {
        return
      }
      setPendingEntry({ npcId: selectedNpcId, patchId, key: trimmed, script: '' })
    }
    setSelectedKey(trimmed)
    setMode('structured')
    setDeleteArmed(false)
  }

  /** Copies a vanilla entry into the project so it can be edited. */
  function overrideVanillaEntry(key: string) {
    const summary = entries.find((entry) => entry.key === key)
    if (port === null || selectedNpcId === null || summary === undefined || summary.origin !== 'vanilla') {
      return
    }
    const target = buildScheduleTarget(selectedNpcId)
    if (port.hasAsset(target)) {
      port.stageValue(target, key, summary.script)
      setSelectedKey(key)
      return
    }
    const patchId = port.addPatch('EditData', target)
    if (patchId === null) {
      return
    }
    setPendingEntry({ npcId: selectedNpcId, patchId, key, script: summary.script })
    setSelectedKey(key)
  }

  /** Writes the effective script of the active entry back into the draft. */
  function stageScript(script: string) {
    if (port === null || assetId === null || active === null || active.readOnly) {
      return
    }
    port.stageValue(assetId, active.summary.key, script)
  }

  function stageModel(model: ScheduleEntryModel) {
    stageScript(serializeScheduleScript(model))
  }

  function setRawScript(script: string) {
    stageScript(script)
  }

  function setLabel(label: string) {
    if (port === null || assetId === null || active === null || active.readOnly) {
      return
    }
    port.stageEntryMeta(assetId, active.summary.key, { label: label.trim() === '' ? null : label })
  }

  function setEnabled(enabled: boolean) {
    if (port === null || assetId === null || active === null || active.readOnly) {
      return
    }
    port.stageEntryMeta(assetId, active.summary.key, { enabled })
  }

  /** Renames the active entry; returns the reason a rename was refused. */
  function renameActiveEntry(nextKey: string): 'empty' | 'conflict' | null {
    if (port === null || assetId === null || active === null || active.readOnly) {
      return null
    }
    const trimmed = nextKey.trim()
    if (trimmed === active.summary.key) {
      return null
    }
    const error = getNewEntryKeyError(trimmed)
    if (error !== null) {
      return error
    }
    port.renameEntry(assetId, active.summary.key, trimmed)
    setSelectedKey(trimmed)
    return null
  }

  function updateSegment(index: number, segment: ScheduleSegment) {
    if (active === null) {
      return
    }
    stageModel({ segments: active.model.segments.map((current, currentIndex) => (currentIndex === index ? segment : current)) })
  }

  function removeSegment(index: number) {
    if (active === null) {
      return
    }
    stageModel({ segments: active.model.segments.filter((_, currentIndex) => currentIndex !== index) })
  }

  function moveSegment(index: number, offset: -1 | 1) {
    if (active === null) {
      return
    }
    const target = index + offset
    if (target < 0 || target >= active.model.segments.length) {
      return
    }
    const segments = [...active.model.segments]
    const [moved] = segments.splice(index, 1)
    segments.splice(target, 0, moved!)
    stageModel({ segments })
  }

  function appendSegment(segment: ScheduleSegment) {
    if (active === null) {
      return
    }
    stageModel({ segments: [...active.model.segments, segment] })
  }

  function addTimePoint() {
    if (active === null) {
      return
    }
    appendSegment(createSchedulePointAfter(findLastSchedulePoint(active.model)))
  }

  /** Two-step delete: the first call arms it, the second stages the removal. */
  function deleteEntry() {
    if (port === null || assetId === null || active === null || active.readOnly) {
      return
    }
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }
    port.stageValue(assetId, active.summary.key, null)
    setSelectedKey(null)
    setDeleteArmed(false)
  }

  const selectedNpc = npcOptions.find((option) => option.id === selectedNpcId) ?? null

  return {
    hasProject: port !== null,
    directoryMissing: rootPath == null && environment.directoryStatus.tone !== 'working',
    onOpenGameDirectory: environment.onOpenGameDirectory,
    npcList: {
      status: vanillaCharacters.status,
      errorMessage: vanillaCharacters.errorMessage,
      options: npcOptions,
    },
    selectedNpcId,
    selectedNpc,
    selectNpc,
    scheduleState: {
      status: vanillaSchedule.status,
      errorMessage: vanillaSchedule.errorMessage,
      hasVanillaSchedule,
    },
    entries,
    priorityGroups,
    refreshVanilla,
    retryNpcList,
    retrySchedule,
    selectedKey,
    selectEntry,
    closeEntry,
    active,
    mode,
    setMode,
    getNewEntryKeyError,
    createEntry,
    overrideVanillaEntry,
    setRawScript,
    setLabel,
    setEnabled,
    renameActiveEntry,
    updateSegment,
    removeSegment,
    moveSegment,
    appendSegment,
    addTimePoint,
    deleteEntry,
    deleteArmed,
    isDirty: port?.isDirty() ?? false,
    saveState: saveState as WorkbenchDraftSaveState,
    save: () => port?.commit(),
    revert: () => port?.revert(),
    undo: () => void port?.undo(),
    redo: () => void port?.redo(),
    locationOptions: locationState.options,
    locationCatalogReady: locationState.status === 'ready',
    animationOptions: rankAnimationNames(animationState.names, selectedNpcId),
    vanillaReferenceScript: activeSummary?.origin === 'override' ? activeSummary.vanillaScript : null,
  }
}

export type ScheduleWorkspaceState = ReturnType<typeof useScheduleWorkspace>
