import type { WorkbenchLocation } from '@shared/contracts'

/**
 * Restorable workbench shell location for browser-style navigation history.
 * Extends {@link WorkbenchLocation} with an optional `patchId` so that entering
 * and exiting a patch editor are first-class history entries.
 */
export type WorkbenchShellLocation = { kind: 'home' } | { kind: 'module'; moduleId: string; patchId?: string | null }

/** Convert a plain {@link WorkbenchLocation} into a shell location (no patch). */
export function toShellLocation(location: WorkbenchLocation): WorkbenchShellLocation {
  return location.kind === 'module' ? { kind: 'module', moduleId: location.moduleId } : { kind: 'home' }
}

export type WorkbenchShellHistoryState = {
  entries: WorkbenchShellLocation[]
  index: number
}

const MAX_HISTORY_ENTRIES = 50

/** Compare two shell locations for history dedupe. */
export function areWorkbenchShellLocationsEqual(left: WorkbenchShellLocation, right: WorkbenchShellLocation): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'home') return true
  if (right.kind !== 'module') return false
  return left.moduleId === right.moduleId && (left.patchId ?? null) === (right.patchId ?? null)
}

/** Create a history stack seeded with a single root location. */
export function createWorkbenchShellHistory(initial: WorkbenchShellLocation): WorkbenchShellHistoryState {
  return {
    entries: [initial],
    index: 0,
  }
}

/** Current location at the history cursor. */
export function getWorkbenchShellHistoryLocation(state: WorkbenchShellHistoryState): WorkbenchShellLocation {
  return state.entries[state.index] ?? state.entries[0]
}

export function canGoWorkbenchShellBack(state: WorkbenchShellHistoryState): boolean {
  return state.index > 0
}

export function canGoWorkbenchShellForward(state: WorkbenchShellHistoryState): boolean {
  return state.index < state.entries.length - 1
}

/**
 * Push a user-initiated navigation entry.
 * Same location as current is ignored so programmatic corrections and repeat clicks do not pollute the stack.
 */
export function pushWorkbenchShellHistory(state: WorkbenchShellHistoryState, location: WorkbenchShellLocation): WorkbenchShellHistoryState {
  const current = getWorkbenchShellHistoryLocation(state)
  if (areWorkbenchShellLocationsEqual(current, location)) {
    return state
  }

  const truncated = state.entries.slice(0, state.index + 1)
  const nextEntries = [...truncated, location]
  while (nextEntries.length > MAX_HISTORY_ENTRIES) {
    nextEntries.shift()
  }

  return {
    entries: nextEntries,
    index: nextEntries.length - 1,
  }
}

/** Move back one entry; no-op at the stack start. */
export function goWorkbenchShellBack(state: WorkbenchShellHistoryState): WorkbenchShellHistoryState {
  if (!canGoWorkbenchShellBack(state)) {
    return state
  }

  return {
    ...state,
    index: state.index - 1,
  }
}

/** Move forward one entry; no-op at the stack end. */
export function goWorkbenchShellForward(state: WorkbenchShellHistoryState): WorkbenchShellHistoryState {
  if (!canGoWorkbenchShellForward(state)) {
    return state
  }

  return {
    ...state,
    index: state.index + 1,
  }
}

/**
 * Project switch / close strategy: drop the prior stack and seed a new root location.
 * Keeps history scoped to the active project session instead of replaying cross-project routes.
 */
export function resetWorkbenchShellHistory(location: WorkbenchShellLocation): WorkbenchShellHistoryState {
  return createWorkbenchShellHistory(location)
}
