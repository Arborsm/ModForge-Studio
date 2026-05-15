import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceMode } from '@locales'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import type { WorkspaceStoredState } from '@shared/contracts'
import { normalizeWorkspaceLayouts, areWorkspaceStoredStatesEqual } from './workbenchLogic'

const WORKSPACE_LAYOUT_PERSIST_DEBOUNCE_MS = 180
const WORKSPACE_LAYOUT_VERSION = 'v11'

export function useWorkspaceLayoutPersistence(appUiStateReady: boolean, workspaceMode: WorkspaceMode) {
  const [workspaceLayouts, setWorkspaceLayouts] = useState<Record<string, WorkspaceStoredState>>(
    () => normalizeWorkspaceLayouts(getAppUiStateSnapshot()?.workspace.layouts),
  )
  const workspaceLayoutsRef = useRef<Record<string, WorkspaceStoredState>>(workspaceLayouts)
  const pendingWorkspaceLayoutPatchesRef = useRef<Record<string, WorkspaceStoredState>>({})
  const workspaceLayoutPersistTimeoutRef = useRef<number | null>(null)
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

  const flushPendingWorkspaceLayoutPatches = useCallback(() => {
    if (workspaceLayoutPersistTimeoutRef.current !== null) {
      window.clearTimeout(workspaceLayoutPersistTimeoutRef.current)
      workspaceLayoutPersistTimeoutRef.current = null
    }

    if (!appUiStateReady) {
      return
    }

    const entries = Object.entries(pendingWorkspaceLayoutPatchesRef.current)
    if (!entries.length) {
      return
    }

    pendingWorkspaceLayoutPatchesRef.current = {}

    void applyAppUiStatePatch({
      workspace: {
        layouts: Object.fromEntries(
          entries.map(([storageKey, state]) => [storageKey, state as Record<string, unknown>]),
        ),
      },
    })
  }, [appUiStateReady])

  const scheduleWorkspaceLayoutPersist = useCallback(() => {
    if (!appUiStateReady) {
      return
    }

    if (workspaceLayoutPersistTimeoutRef.current !== null) {
      window.clearTimeout(workspaceLayoutPersistTimeoutRef.current)
    }

    workspaceLayoutPersistTimeoutRef.current = window.setTimeout(() => {
      flushPendingWorkspaceLayoutPatches()
    }, WORKSPACE_LAYOUT_PERSIST_DEBOUNCE_MS)
  }, [appUiStateReady, flushPendingWorkspaceLayoutPatches])

  useEffect(() => {
    if (!appUiStateReady || !Object.keys(pendingWorkspaceLayoutPatchesRef.current).length) {
      return
    }

    scheduleWorkspaceLayoutPersist()
  }, [appUiStateReady, scheduleWorkspaceLayoutPersist])

  useEffect(() => () => flushPendingWorkspaceLayoutPatches(), [flushPendingWorkspaceLayoutPatches])

  const handleWorkspacePersistStateChange = useCallback(
    (storageKey: string, nextState: WorkspaceStoredState) => {
      if (areWorkspaceStoredStatesEqual(workspaceLayoutsRef.current[storageKey], nextState)) {
        return
      }

      workspaceLayoutsRef.current[storageKey] = nextState
      setWorkspaceLayouts((current) => ({ ...current, [storageKey]: nextState }))
      pendingWorkspaceLayoutPatchesRef.current[storageKey] = nextState
      scheduleWorkspaceLayoutPersist()
    },
    [scheduleWorkspaceLayoutPersist],
  )

  const workspaceLayoutStorageKey = useMemo(
    () => `modforge:workspace-layout:${WORKSPACE_LAYOUT_VERSION}:${workspaceMode}`,
    [workspaceMode],
  )

  return {
    workspaceLayouts,
    workspaceLayoutStorageKey,
    handleWorkspacePersistStateChange,
  }
}
