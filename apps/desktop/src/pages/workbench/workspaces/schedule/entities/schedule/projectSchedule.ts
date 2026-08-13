/**
 * Pure logic that binds schedule editing to the Content Patcher draft: naming
 * the `Characters/schedules/<NpcId>` target, merging the staged project entries
 * over the vanilla schedule, and building the NPC picker options. Reading and
 * writing the patch itself is the `AssetDraftPort`'s job; everything here is
 * side-effect free so it stays unit-testable.
 */
import type { DraftPatch } from '@features/cp-maker'
import { isScheduleScriptStructured } from './model'

/** Editor state stored on the schedule EditData patch. Only `entries` is exported to content.json. */
export type SchedulePatchEditorState = {
  /** Enabled schedule entries, exported as CP `Entries`. */
  entries: Record<string, string>
  /** Entries the author disabled in the editor; kept out of the export. */
  disabledEntries: Record<string, string>
  /** Optional editor-only display titles per entry key. */
  entryLabels: Record<string, string>
}

const CHARACTERS_DATA_TARGET = 'data/characters'
const SCHEDULE_TARGET_PREFIX = 'Characters/schedules/'

/** Builds the CP target asset name for an NPC schedule. */
export function buildScheduleTarget(npcId: string): string {
  return `${SCHEDULE_TARGET_PREFIX}${npcId}`
}

function normalizeTarget(target: string): string {
  return target.trim().replaceAll('\\', '/').toLowerCase()
}

export type ScheduleEntryOrigin = 'vanilla' | 'project' | 'override'

export type ScheduleEntrySummary = {
  key: string
  /** Effective script: the project entry wins over the vanilla one. */
  script: string
  /** Vanilla script when the key exists in the vanilla schedule file. */
  vanillaScript: string | null
  origin: ScheduleEntryOrigin
  /** False only for project entries parked in `disabledEntries`. */
  enabled: boolean
  label: string | null
  /** True when every segment of the effective script parses structurally. */
  structured: boolean
}

/**
 * Merges vanilla schedule entries with the project patch state. Vanilla keys
 * come first in JS object enumeration order (integer-like keys such as `16`
 * enumerate before string keys) and are marked `override` when the project
 * redefines them; project-only keys follow in their insertion order.
 */
export function buildScheduleEntrySummaries(
  vanillaEntries: Record<string, string> | null,
  patchState: SchedulePatchEditorState,
): ScheduleEntrySummary[] {
  const summaries: ScheduleEntrySummary[] = []
  const projectKeys = new Set([...Object.keys(patchState.entries), ...Object.keys(patchState.disabledEntries)])

  const buildProjectSummary = (key: string, vanillaScript: string | null): ScheduleEntrySummary => {
    const enabled = key in patchState.entries
    const script = enabled ? patchState.entries[key]! : patchState.disabledEntries[key]!
    return {
      key,
      script,
      vanillaScript,
      origin: vanillaScript != null ? 'override' : 'project',
      enabled,
      label: patchState.entryLabels[key] ?? null,
      structured: isScheduleScriptStructured(script),
    }
  }

  for (const [key, vanillaScript] of Object.entries(vanillaEntries ?? {})) {
    if (projectKeys.has(key)) {
      summaries.push(buildProjectSummary(key, vanillaScript))
      projectKeys.delete(key)
    } else {
      summaries.push({
        key,
        script: vanillaScript,
        vanillaScript,
        origin: 'vanilla',
        enabled: true,
        label: null,
        structured: isScheduleScriptStructured(vanillaScript),
      })
    }
  }

  for (const key of projectKeys) {
    summaries.push(buildProjectSummary(key, null))
  }

  return summaries
}

/** Validates a draft entry key against the project entries of the same NPC. */
export function getScheduleEntryKeyError(
  state: SchedulePatchEditorState,
  key: string,
  originalKey: string | null,
): 'empty' | 'conflict' | null {
  const trimmed = key.trim()
  if (trimmed === '') {
    return 'empty'
  }
  if (trimmed !== originalKey && (trimmed in state.entries || trimmed in state.disabledEntries)) {
    return 'conflict'
  }
  return null
}

/**
 * Collects NPC ids introduced or edited by EditData patches that target
 * `Data/Characters`, across every workspace of the draft.
 */
export function collectProjectNpcIds(patches: DraftPatch[]): string[] {
  const ids = new Set<string>()

  for (const patch of patches) {
    if (patch.action !== 'EditData' || normalizeTarget(patch.target) !== CHARACTERS_DATA_TARGET) {
      continue
    }

    const state = patch.editorState as Record<string, unknown> | null | undefined
    const entries = state && typeof state === 'object' && !Array.isArray(state) ? state['entries'] : null
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      continue
    }

    for (const npcId of Object.keys(entries)) {
      if (npcId.trim() !== '') {
        ids.add(npcId)
      }
    }
  }

  return Array.from(ids)
}

export type ScheduleNpcOption = {
  id: string
  displayName: string
  source: 'vanilla' | 'project'
}

const LOCALIZED_TOKEN_PATTERN = /^\[.*\]$/su

function resolveNpcDisplayName(npcId: string, characterEntry: unknown): string {
  if (!characterEntry || typeof characterEntry !== 'object' || Array.isArray(characterEntry)) {
    return npcId
  }

  const record = characterEntry as Record<string, unknown>
  // The loader pre-resolves `[LocalizedText …]` names into this sidecar field.
  const resolved = record['__resolvedDisplayName']
  if (typeof resolved === 'string' && resolved.trim() !== '') {
    return resolved.trim()
  }

  const displayName = record['DisplayName']
  if (typeof displayName !== 'string') {
    return npcId
  }

  const trimmed = displayName.trim()
  if (trimmed === '' || LOCALIZED_TOKEN_PATTERN.test(trimmed)) {
    return npcId
  }

  return trimmed
}

/**
 * Merges vanilla `Data/Characters` NPCs with project-defined NPCs. Project ids
 * that already exist in the vanilla data stay in the vanilla group; project
 * options come first, each group sorted by display name.
 */
export function buildScheduleNpcOptions(vanillaCharacters: Record<string, unknown> | null, projectNpcIds: string[]): ScheduleNpcOption[] {
  const vanillaOptions: ScheduleNpcOption[] = Object.entries(vanillaCharacters ?? {}).map(([npcId, characterEntry]) => ({
    id: npcId,
    displayName: resolveNpcDisplayName(npcId, characterEntry),
    source: 'vanilla',
  }))
  const vanillaIds = new Set(vanillaOptions.map((option) => option.id))

  const projectOptions: ScheduleNpcOption[] = projectNpcIds
    .filter((npcId) => !vanillaIds.has(npcId))
    .map((npcId) => ({ id: npcId, displayName: npcId, source: 'project' }))

  const byDisplayName = (left: ScheduleNpcOption, right: ScheduleNpcOption) => left.displayName.localeCompare(right.displayName)
  return [...projectOptions.sort(byDisplayName), ...vanillaOptions.sort(byDisplayName)]
}
