/**
 * Validation for one parsed event script, expressed in the shared `AssetIssue`
 * shape so the event hub, the dashboard counters and the schema-driven
 * validation rail all read the same findings.
 *
 * Every rule below mirrors something the game or SMAPI actually complains
 * about at runtime; ambiguous cases are reported as `warning` rather than
 * `error`, because a content pack may legitimately add commands, actors or
 * preconditions that this build cannot see.
 */

import { isKnownEventCommand } from './commandCatalog'
import type { EventCommand, EventSceneSetup } from './types'
import type { EventPreconditionGroups } from './preconditionSemantics'
import type { AssetIssue } from '@entities/asset-schema'

/** Commands that hand control back to the game; a script without one hangs. */
const TERMINATING_COMMANDS = new Set(['end', 'switchevent', 'fork'])

/**
 * Actor names the game resolves without an entry in the scene setup line.
 * `farmer` is the player, the rest are runtime aliases the engine substitutes.
 */
const IMPLICIT_ACTORS = new Set(['farmer', 'spouse', 'rival', 'invisible'])

function isTokenized(value: string): boolean {
  return value.includes('{{')
}

/** Preconditions and commands are matched case-insensitively by the game. */
function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export interface EventValidationInput {
  /** Event key as written in `Entries`, preconditions included. */
  key: string
  /** Raw script string of that entry. */
  rawScript: string
  /** Scene setup parsed from the first three segments. */
  scene: EventSceneSetup
  /** Commands after the scene setup. */
  commands: EventCommand[]
  /** Preconditions parsed from the key. */
  preconditionGroups: EventPreconditionGroups
  /** Segment count of the raw script, used to detect a truncated setup line. */
  segmentCount: number
}

function validateStructure(input: EventValidationInput, issues: AssetIssue[]) {
  if (input.rawScript.trim() === '') {
    issues.push({ severity: 'error', code: 'eventScriptEmpty', messageKey: 'event.scriptEmpty', path: [input.key] })
    return
  }

  if (input.segmentCount < 3) {
    issues.push({
      severity: 'error',
      code: 'eventSceneSetupIncomplete',
      messageKey: 'event.sceneSetupIncomplete',
      path: [input.key],
      params: { segments: input.segmentCount },
    })
  }

  const terminates = input.commands.some((command) => TERMINATING_COMMANDS.has(normalize(command.command)))
  if (!terminates) {
    issues.push({ severity: 'error', code: 'eventMissingEnd', messageKey: 'event.missingEnd', path: [input.key] })
  }
}

function validateCommands(input: EventValidationInput, issues: AssetIssue[]) {
  const knownActors = new Set(input.scene.actors.map((actor) => normalize(actor.actorName)))

  for (const command of input.commands) {
    if (command.command !== '' && !isKnownEventCommand(command.command) && !isTokenized(command.command)) {
      issues.push({
        severity: 'warning',
        code: 'eventCommandUnknown',
        messageKey: 'event.commandUnknown',
        path: [input.key, command.index],
        params: { command: command.command },
      })
    }

    const actorName = command.actorName?.trim() ?? ''
    if (actorName === '' || isTokenized(actorName)) continue
    const actor = normalize(actorName)
    if (!knownActors.has(actor) && !IMPLICIT_ACTORS.has(actor)) {
      issues.push({
        severity: 'warning',
        code: 'eventActorNotInScene',
        messageKey: 'event.actorNotInScene',
        path: [input.key, command.index],
        params: { actor: actorName, command: command.command },
      })
    }
  }
}

function validatePreconditions(input: EventValidationInput, issues: AssetIssue[]) {
  const groups = input.preconditionGroups
  for (const precondition of [...groups.environment, ...groups.player, ...groups.progress]) {
    if (!precondition.isKnown) {
      issues.push({
        severity: 'warning',
        code: 'eventPreconditionUnknown',
        messageKey: 'event.preconditionUnknown',
        path: [input.key],
        params: { precondition: precondition.key },
      })
      continue
    }
    if (precondition.deprecated) {
      issues.push({
        severity: 'info',
        code: 'eventPreconditionDeprecated',
        messageKey: 'event.preconditionDeprecated',
        path: [input.key],
        params: { precondition: precondition.key, replacement: precondition.canonicalKey },
      })
    }
  }
}

/** Validates one event entry and returns its findings in reading order. */
export function validateEventScript(input: EventValidationInput): AssetIssue[] {
  const issues: AssetIssue[] = []
  validateStructure(input, issues)
  if (input.rawScript.trim() !== '') {
    validateCommands(input, issues)
  }
  validatePreconditions(input, issues)
  return issues
}

/**
 * Reports event keys claimed by more than one patch on the same target. Content
 * Patcher applies both, so whichever patch loads last silently wins.
 */
export function findDuplicateEventKeys(
  patches: ReadonlyArray<{ id: string; target: string; keys: readonly string[] }>,
): Map<string, Set<string>> {
  const owners = new Map<string, Array<{ patchId: string; key: string }>>()
  for (const patch of patches) {
    for (const key of patch.keys) {
      const slot = `${normalize(patch.target)} ${key}`
      const claims = owners.get(slot) ?? []
      claims.push({ patchId: patch.id, key })
      owners.set(slot, claims)
    }
  }

  const duplicates = new Map<string, Set<string>>()
  for (const claims of owners.values()) {
    if (claims.length < 2) continue
    for (const claim of claims) {
      const keys = duplicates.get(claim.patchId) ?? new Set<string>()
      keys.add(claim.key)
      duplicates.set(claim.patchId, keys)
    }
  }
  return duplicates
}
