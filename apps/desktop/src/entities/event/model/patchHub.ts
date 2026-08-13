import { parseEventCommand, parseEventCommands, parseEventSceneSetup, splitEventPreconditions } from './parser'
import { findDuplicateEventKeys, validateEventScript } from './eventValidation'
import type { EventCommand, EventSceneActor } from './types'
import type { WorkspaceId } from '@shared/contracts/types/cpMaker'
import { EventPreconditionParser, type EventPreconditionGroups } from '@entities/event'
import { countAssetIssues, type AssetIssue } from '@entities/asset-schema'

export type EventHubStatus = 'done' | 'draft' | 'error' | 'disabled'
export type EventHubSeverity = 'ok' | 'warn' | 'error'

export interface EventPatchHubActor {
  name: string
  tileX: number
  tileY: number
}

export interface EventPatchHubScriptStep {
  index: number
  title: string
  detail: string
}

export interface EventPatchHubEvent {
  key: string
  eventId: string
  title: string
  status: EventHubStatus
  severity: EventHubSeverity
  triggers: string[]
  location: string
  actors: EventPatchHubActor[]
  commandCount: number
  dialogueCount: number
  /** Findings of `validateEventScript`, in reading order. */
  issues: AssetIssue[]
  issueCount: number
  scriptSteps: EventPatchHubScriptStep[]
  preconditionGroups: EventPreconditionGroups
}

export interface EventPatchHubStats {
  events: number
  commands: number
  actors: number
  triggers: number
  /** Error-severity findings across the patch's events. */
  errors: number
  /** Warning-severity findings across the patch's events. */
  warnings: number
}

export interface EventPatchHubSourcePatch {
  id: string
  workspace: WorkspaceId
  action: 'EditData' | 'EditImage' | 'EditMap' | 'Load' | 'Include'
  target: string
  logName: string
  enabled: boolean | string
  updatedAt?: number
  when?: Record<string, unknown>
  fromFile?: string
  editorState: unknown
  targetLocale?: string
  update?: string
  priority?: string | number
  localTokens?: Record<string, unknown>
  targetField?: string[]
}

export interface EventPatchHubPatch {
  id: string
  displayName: string
  action: EventPatchHubSourcePatch['action']
  target: string
  enabled: boolean
  conditionSummary: string
  targetFieldSummary: string
  events: EventPatchHubEvent[]
  stats: EventPatchHubStats
  sourcePatch: EventPatchHubSourcePatch
  searchText: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function eventEntriesFromPatch(patch: EventPatchHubSourcePatch): Array<[string, string]> {
  const state = asRecord(patch.editorState)
  const entries = asRecord(state['entries'])

  return Object.entries(entries)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .sort(([a], [b]) => a.localeCompare(b))
}

function formatConditionValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(formatConditionValue).join(', ')
  }
  if (value == null) {
    return ''
  }
  return JSON.stringify(value)
}

export function summarizePatchWhen(when: EventPatchHubSourcePatch['when']): string {
  if (!when || Object.keys(when).length === 0) {
    return ''
  }

  return Object.entries(when)
    .map(([key, value]) => `${key} = ${formatConditionValue(value)}`)
    .join(', ')
}

function getTargetName(target: string) {
  const parts = target.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? target
}

function firstCoordinatePair(value: string | null | undefined): { x: number; y: number } | null {
  if (!value) {
    return null
  }

  const match = /(-?\d+)\s+(-?\d+)/u.exec(value)
  if (!match) {
    return null
  }

  const x = Number.parseInt(match[1] ?? '', 10)
  const y = Number.parseInt(match[2] ?? '', 10)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function actorToHubActor(actor: EventSceneActor): EventPatchHubActor {
  return {
    name: actor.actorName,
    tileX: actor.tileX,
    tileY: actor.tileY,
  }
}

function countDialogueCommands(commands: EventCommand[]) {
  return commands.filter((command) => command.kind === 'dialogue' || command.kind === 'message' || command.kind === 'choice').length
}

function buildScriptSteps(commands: EventCommand[]): EventPatchHubScriptStep[] {
  return commands.slice(0, 3).map((command, index) => ({
    index: index + 1,
    title: `${command.command} / ${command.kind}`,
    detail: command.detail || command.raw,
  }))
}

function getDisabledEventKeys(patch: EventPatchHubSourcePatch): Set<string> {
  const state = asRecord(patch.editorState)
  const disabledKeys = Array.isArray(state['disabledEventKeys'])
    ? state['disabledEventKeys'].filter((key): key is string => typeof key === 'string')
    : []
  return new Set(disabledKeys)
}

function getEventAliases(patch: EventPatchHubSourcePatch): Record<string, string> {
  const state = asRecord(patch.editorState)
  const aliases = asRecord(state['eventAliases'])
  return Object.fromEntries(Object.entries(aliases).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function hubSeverity(issues: readonly AssetIssue[]): EventHubSeverity {
  if (issues.some((issue) => issue.severity === 'error')) return 'error'
  if (issues.some((issue) => issue.severity === 'warning')) return 'warn'
  return 'ok'
}

function hubStatus(enabled: boolean, severity: EventHubSeverity, issueCount: number): EventHubStatus {
  if (!enabled) return 'disabled'
  if (severity === 'error') return 'error'
  // "Done" means the script survives validation as written, so the author knows
  // which events still need a pass and which are ready to ship.
  return issueCount === 0 ? 'done' : 'draft'
}

/** Pure parse+validate outcome of one event script; shared from the analysis cache, never mutate. */
type EventScriptAnalysis = {
  eventId: string
  triggers: string[]
  preconditionGroups: EventPreconditionGroups
  actors: EventPatchHubActor[]
  cameraTile: { x: number; y: number } | null
  commandCount: number
  dialogueCount: number
  scriptSteps: EventPatchHubScriptStep[]
  issues: AssetIssue[]
}

const EVENT_SCRIPT_ANALYSIS_CACHE_LIMIT = 1000
const eventScriptAnalysisCache = new Map<string, EventScriptAnalysis>()

/**
 * Parses and validates one event script. Cached by key + raw script: the hub
 * analyzes every patch on mount and the editor re-analyzes on entry, while the
 * same vanilla scripts repeat across patches, so the cache turns editor entry
 * after a hub visit into a lookup.
 */
function analyzeEventScript(key: string, rawScript: string): EventScriptAnalysis {
  const cacheKey = `${key}\n${rawScript}`
  const cached = eventScriptAnalysisCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const parser = new EventPreconditionParser()
  const keyParts = splitEventPreconditions(key)
  const preconditionGroups = parser.parse(keyParts.slice(1))
  const segments = parseEventCommands(rawScript)
  const scene = parseEventSceneSetup(segments)
  const commands = segments.slice(3).map((raw, index) => parseEventCommand(raw, index))
  const firstActor = scene.actors[0] ?? null
  const analysis: EventScriptAnalysis = {
    eventId: keyParts[0] ?? key,
    triggers: keyParts.slice(1).filter(Boolean),
    preconditionGroups,
    actors: scene.actors.map(actorToHubActor),
    cameraTile: firstCoordinatePair(scene.cameraInstruction) ?? (firstActor ? { x: firstActor.tileX, y: firstActor.tileY } : null),
    commandCount: commands.length,
    dialogueCount: countDialogueCommands(commands),
    scriptSteps: buildScriptSteps(commands),
    issues: validateEventScript({
      key,
      rawScript,
      scene,
      commands,
      preconditionGroups,
      segmentCount: segments.length,
    }),
  }

  if (eventScriptAnalysisCache.size >= EVENT_SCRIPT_ANALYSIS_CACHE_LIMIT) {
    const oldest = eventScriptAnalysisCache.keys().next().value
    if (oldest !== undefined) {
      eventScriptAnalysisCache.delete(oldest)
    }
  }
  eventScriptAnalysisCache.set(cacheKey, analysis)
  return analysis
}

function buildHubEvent(
  patch: EventPatchHubSourcePatch,
  key: string,
  rawScript: string,
  disabledEventKeys: Set<string>,
  eventAliases: Record<string, string>,
  duplicateKeys: Set<string>,
): EventPatchHubEvent {
  const analysis = analyzeEventScript(key, rawScript)
  const alias = eventAliases[key]?.trim() ?? ''
  const targetName = getTargetName(patch.target)
  const enabled = Boolean(patch.enabled) && !disabledEventKeys.has(key)
  // Duplicate flags are draft-session state, not script content, so they layer
  // over the cached analysis (copy — the cached issues array is shared).
  const issues: AssetIssue[] = duplicateKeys.has(key)
    ? [
        {
          severity: 'error',
          code: 'duplicateEntryKey',
          messageKey: 'duplicateEntryKey',
          path: [key],
          params: { entryKey: key },
        },
        ...analysis.issues,
      ]
    : analysis.issues
  const severity = hubSeverity(issues)

  return {
    key,
    eventId: analysis.eventId,
    title: alias || analysis.eventId || key,
    status: hubStatus(enabled, severity, issues.length),
    severity,
    triggers: analysis.triggers,
    location: analysis.cameraTile ? `${targetName} (${analysis.cameraTile.x}, ${analysis.cameraTile.y})` : targetName,
    actors: analysis.actors,
    commandCount: analysis.commandCount,
    dialogueCount: analysis.dialogueCount,
    issues,
    issueCount: issues.length,
    scriptSteps: analysis.scriptSteps,
    preconditionGroups: analysis.preconditionGroups,
  }
}

function uniqueActorCount(events: EventPatchHubEvent[]) {
  const actors = new Set<string>()
  for (const event of events) {
    for (const actor of event.actors) {
      actors.add(actor.name)
    }
  }
  return actors.size
}

function buildPatchSearchText(patch: EventPatchHubSourcePatch, events: EventPatchHubEvent[]) {
  return [
    patch.logName,
    patch.action,
    patch.target,
    patch.fromFile ?? '',
    ...events.flatMap((event) => [event.key, event.title, event.location, ...event.actors.map((actor) => actor.name)]),
  ]
    .join(' ')
    .toLowerCase()
}

export function buildEventPatchHubPatches(patches: EventPatchHubSourcePatch[]): EventPatchHubPatch[] {
  const duplicatesByPatch = findDuplicateEventKeys(
    patches.map((patch) => ({
      id: patch.id,
      target: patch.target,
      keys: eventEntriesFromPatch(patch).map(([key]) => key),
    })),
  )

  return patches.map((patch) => {
    const disabledEventKeys = getDisabledEventKeys(patch)
    const eventAliases = getEventAliases(patch)
    const duplicateKeys = duplicatesByPatch.get(patch.id) ?? new Set<string>()
    const events = eventEntriesFromPatch(patch).map(([key, rawScript]) =>
      buildHubEvent(patch, key, rawScript, disabledEventKeys, eventAliases, duplicateKeys),
    )
    const conditionSummary = summarizePatchWhen(patch.when)
    const counts = countAssetIssues(events.flatMap((event) => event.issues))
    const stats: EventPatchHubStats = {
      events: events.length,
      commands: events.reduce((total, event) => total + event.commandCount, 0),
      actors: uniqueActorCount(events),
      triggers: events.reduce((total, event) => total + event.triggers.length, 0),
      errors: counts.errors,
      warnings: counts.warnings,
    }

    return {
      id: patch.id,
      displayName: patch.logName || patch.target || patch.id,
      action: patch.action,
      target: patch.target,
      enabled: patch.enabled === true || typeof patch.enabled === 'string',
      conditionSummary,
      targetFieldSummary: patch.targetField?.join(' / ') ?? '',
      events,
      stats,
      sourcePatch: patch,
      searchText: buildPatchSearchText(patch, events),
    }
  })
}
