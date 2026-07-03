import type { WorkspaceMode } from '@locales'
import type { WorkspaceStoredState } from '@shared/contracts'
import type { ResourcePreloadState, WorkspaceStatus } from '@entities/map'

type WorkspaceDiagnostic = {
  severity: 'info' | 'warning' | 'error'
}

export function getResourcePreloadProgress(state: ResourcePreloadState) {
  if (state.total <= 0) {
    return 18
  }

  return Math.max(0, Math.min(100, (state.completed / state.total) * 100))
}

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

export function getRecentGameDirectories(currentRoot: string | null | undefined, storedRecentGameDirectories: string[]) {
  if (!currentRoot) {
    return storedRecentGameDirectories
  }

  return [currentRoot, ...storedRecentGameDirectories.filter((path) => path !== currentRoot)].slice(0, 6)
}

export function deriveWorkspaceStatus({
  workspaceMode,
  directoryInfoPresent,
  workspaceStatus,
  eventCount,
  eventStatusMessage,
  characterCount,
  characterStatusMessage,
  buildingBrowserCount,
  buildingStatusMessage,
  itemCount,
  itemStatusMessage,
  modDiagnostics,
  modHasUnsavedChanges,
  modProjectsCount,
  activeModProjectDetail,
  modStatusMessage,
}: {
  workspaceMode: WorkspaceMode
  directoryInfoPresent: boolean
  workspaceStatus: WorkspaceStatus
  eventCount: number
  eventStatusMessage: string
  characterCount: number
  characterStatusMessage: string
  buildingBrowserCount: number
  buildingStatusMessage: string
  itemCount: number
  itemStatusMessage: string
  modDiagnostics: WorkspaceDiagnostic[]
  modHasUnsavedChanges: boolean
  modProjectsCount: number
  activeModProjectDetail: object | null
  modStatusMessage: string
}): WorkspaceStatus {
  if (workspaceMode === 'events') {
    return {
      tone: directoryInfoPresent ? (eventCount ? 'ready' : eventStatusMessage ? 'error' : 'idle') : 'idle',
      message: eventStatusMessage,
    }
  }

  if (workspaceMode === 'characters') {
    return {
      tone: directoryInfoPresent ? (characterCount ? 'ready' : characterStatusMessage ? 'error' : 'idle') : 'idle',
      message: characterStatusMessage,
    }
  }

  if (workspaceMode === 'buildings') {
    return {
      tone: directoryInfoPresent ? (buildingBrowserCount ? 'ready' : buildingStatusMessage ? 'error' : 'idle') : 'idle',
      message: buildingStatusMessage,
    }
  }

  if (workspaceMode === 'items') {
    return {
      tone: directoryInfoPresent ? (itemCount ? 'ready' : itemStatusMessage ? 'error' : 'idle') : 'idle',
      message: itemStatusMessage,
    }
  }

  if (workspaceMode === 'mods') {
    const hasModErrors = modDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
    return {
      tone: directoryInfoPresent
        ? hasModErrors
          ? 'error'
          : modHasUnsavedChanges
            ? 'working'
            : modProjectsCount || activeModProjectDetail
              ? 'ready'
              : 'idle'
        : 'idle',
      message: modStatusMessage,
    }
  }

  return workspaceStatus
}
