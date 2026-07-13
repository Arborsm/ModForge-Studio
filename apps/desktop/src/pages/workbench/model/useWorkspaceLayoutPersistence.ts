import { useCallback, useEffect, useRef, useState } from 'react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import type { WorkspaceStoredState } from '@shared/contracts'
import { normalizeWorkspaceLayouts, areWorkspaceStoredStatesEqual } from './workbenchLogic'

export function useWorkspaceLayoutPersistence(appUiStateReady: boolean, persistenceKey: string) {
  const [workspaceLayouts, setWorkspaceLayouts] = useState<Record<string, WorkspaceStoredState>>(() =>
    readModuleLayouts(getAppUiStateSnapshot().workspace.modules),
  )
  const workspaceLayoutsRef = useRef<Record<string, WorkspaceStoredState>>(workspaceLayouts)
  const hydratedWorkspaceStateRef = useRef(false)

  useEffect(() => {
    if (!appUiStateReady || hydratedWorkspaceStateRef.current) {
      return
    }

    const state = getAppUiStateSnapshot()
    const nextLayouts = readModuleLayouts(state.workspace.modules)
    workspaceLayoutsRef.current = nextLayouts
    setWorkspaceLayouts(nextLayouts)
    hydratedWorkspaceStateRef.current = true
  }, [appUiStateReady])

  const handleWorkspacePersistStateChange = useCallback(
    (storageKey: string, nextState: WorkspaceStoredState) => {
      if (!appUiStateReady || !hydratedWorkspaceStateRef.current) {
        return
      }

      if (areWorkspaceStoredStatesEqual(workspaceLayoutsRef.current[storageKey], nextState)) {
        return
      }

      workspaceLayoutsRef.current[storageKey] = nextState
      setWorkspaceLayouts((current) => ({ ...current, [storageKey]: nextState }))
      void applyAppUiStatePatch({
        workspace: {
          modules: { [storageKey]: { layout: nextState as Record<string, unknown> } },
        },
      }).catch((error) => {
        console.error('[appUiState] failed to save workspace layout state', error)
      })
    },
    [appUiStateReady],
  )

  return {
    workspaceLayouts,
    workspaceLayoutStorageKey: persistenceKey,
    handleWorkspacePersistStateChange,
  }
}

function readModuleLayouts(modules: Record<string, Record<string, unknown>>) {
  return normalizeWorkspaceLayouts(
    Object.fromEntries(
      Object.entries(modules)
        .map(([key, state]) => [key, state.layout])
        .filter((entry) => entry[1]),
    ),
  )
}
