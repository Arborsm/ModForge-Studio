import type { WorkspaceStoredState } from '@shared/contracts'

export function normalizeWorkspaceLayouts(
  layouts: Record<string, Record<string, unknown>> | null | undefined,
): Record<string, WorkspaceStoredState> {
  const entries = Object.entries(layouts ?? {}).filter(
    ([key, value]) => key.trim().length > 0 && typeof value === 'object' && value !== null && !Array.isArray(value),
  )

  return Object.fromEntries(entries) as Record<string, WorkspaceStoredState>
}

export function areWorkspaceStoredStatesEqual(
  left: WorkspaceStoredState | null | undefined,
  right: WorkspaceStoredState | null | undefined,
) {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return JSON.stringify(left) === JSON.stringify(right)
}
