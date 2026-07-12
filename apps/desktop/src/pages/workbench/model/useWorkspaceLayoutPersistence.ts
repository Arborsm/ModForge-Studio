import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceMode } from '@locales'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import type { WorkspaceStoredState } from '@shared/contracts'
import { normalizeWorkspaceLayouts, areWorkspaceStoredStatesEqual } from './workbenchLogic'

const WORKSPACE_LAYOUT_VERSION = 'v14'

export function useWorkspaceLayoutPersistence(appUiStateReady: boolean, workspaceMode: WorkspaceMode) {
  const [workspaceLayouts, setWorkspaceLayouts] = useState<Record<string, WorkspaceStoredState>>(() =>
    normalizeWorkspaceLayouts(getAppUiStateSnapshot()?.workspace.layouts),
  )
  const workspaceLayoutsRef = useRef<Record<string, WorkspaceStoredState>>(workspaceLayouts)
  const hydratedWorkspaceStateRef = useRef(false)

  useEffect(() => {
    if (!appUiStateReady || hydratedWorkspaceStateRef.current) {
      return
    }

    const state = getAppUiStateSnapshot()
    const nextLayouts = normalizeWorkspaceLayouts(state.workspace.layouts)
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
          layouts: { [storageKey]: nextState as Record<string, unknown> },
        },
      }).catch((error) => {
        console.error('[appUiState] failed to save workspace layout state', error)
      })
    },
    [appUiStateReady],
  )

  const workspaceLayoutStorageKey = useMemo(() => `modforge:workspace-layout:${WORKSPACE_LAYOUT_VERSION}:${workspaceMode}`, [workspaceMode])

  return {
    workspaceLayouts,
    workspaceLayoutStorageKey,
    handleWorkspacePersistStateChange,
  }
}
