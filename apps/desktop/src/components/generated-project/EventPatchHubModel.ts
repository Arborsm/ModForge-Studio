import type { DraftPatch } from '../../lib/app/useGeneratedProject'
import { parseEventCommand, parseEventCommands, parseEventSceneSetup, splitEventPreconditions } from '../../lib/events/parser'
import type { EventCommand, EventSceneActor } from '../../lib/events/types'
import { EventPreconditionParser, type EventPreconditionGroups } from './EventPreconditionSemantics'

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
  issueCount: number
  scriptSteps: EventPatchHubScriptStep[]
  preconditionGroups: EventPreconditionGroups
}

export interface EventPatchHubStats {
  events: number
  commands: number
  actors: number
  triggers: number
}

export interface EventPatchHubPatch {
  id: string
  displayName: string
  action: DraftPatch['action']
  target: string
  enabled: boolean
  conditionSummary: string
  targetFieldSummary: string
  events: EventPatchHubEvent[]
  stats: EventPatchHubStats
  exportReady: boolean
  sourcePatch: DraftPatch
  searchText: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function eventEntriesFromPatch(patch: DraftPatch): Array<[string, string]> {
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

export function summarizePatchWhen(when: DraftPatch['when']): string {
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

function getDisabledEventKeys(patch: DraftPatch): Set<string> {
  const state = asRecord(patch.editorState)
  const disabledKeys = Array.isArray(state['disabledEventKeys'])
    ? state['disabledEventKeys'].filter((key): key is string => typeof key === 'string')
    : []
  return new Set(disabledKeys)
}

function buildHubEvent(patch: DraftPatch, key: string, rawScript: string, disabledEventKeys: Set<string>): EventPatchHubEvent {
  const parser = new EventPreconditionParser()
  const keyParts = splitEventPreconditions(key)
  const eventId = keyParts[0] ?? key
  const triggers = keyParts.slice(1).filter(Boolean)
  const preconditionGroups = parser.parse(keyParts.slice(1))
  const segments = parseEventCommands(rawScript)
  const scene = parseEventSceneSetup(segments)
  const commands = segments.slice(3).map((raw, index) => parseEventCommand(raw, index))
  const cameraCoordinates = firstCoordinatePair(scene.cameraInstruction)
  const firstActor = scene.actors[0] ?? null
  const tile = cameraCoordinates ?? (firstActor ? { x: firstActor.tileX, y: firstActor.tileY } : null)
  const targetName = getTargetName(patch.target)

  return {
    key,
    eventId,
    title: eventId || key,
    status: patch.enabled && !disabledEventKeys.has(key) ? 'draft' : 'disabled',
    severity: 'ok',
    triggers,
    location: tile ? `${targetName} (${tile.x}, ${tile.y})` : targetName,
    actors: scene.actors.map(actorToHubActor),
    commandCount: commands.length,
    dialogueCount: countDialogueCommands(commands),
    issueCount: 0,
    scriptSteps: buildScriptSteps(commands),
    preconditionGroups,
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

function buildPatchSearchText(patch: DraftPatch, events: EventPatchHubEvent[]) {
  return [
    patch.logName,
    patch.action,
    patch.target,
    patch.fromFile ?? '',
    ...events.flatMap((event) => [event.key, event.title, event.location, ...event.actors.map((actor) => actor.name)]),
  ].join(' ').toLowerCase()
}

export function buildEventPatchHubPatches(patches: DraftPatch[]): EventPatchHubPatch[] {
  return patches.map((patch) => {
    const disabledEventKeys = getDisabledEventKeys(patch)
    const events = eventEntriesFromPatch(patch).map(([key, rawScript]) => buildHubEvent(patch, key, rawScript, disabledEventKeys))
    const conditionSummary = summarizePatchWhen(patch.when)
    const stats: EventPatchHubStats = {
      events: events.length,
      commands: events.reduce((total, event) => total + event.commandCount, 0),
      actors: uniqueActorCount(events),
      triggers: events.reduce((total, event) => total + event.triggers.length, 0),
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
      exportReady: patch.enabled !== false,
      sourcePatch: patch,
      searchText: buildPatchSearchText(patch, events),
    }
  })
}
