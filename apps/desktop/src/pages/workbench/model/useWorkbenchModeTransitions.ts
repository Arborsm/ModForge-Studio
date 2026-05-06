import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { WorkspaceMode } from '@locales'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'

type WorkspaceViewMode = 'edit' | 'preview'

type UseWorkbenchModeTransitionsOptions = {
  workspaceViewMode: WorkspaceViewMode
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>
  setWorkspaceViewMode: Dispatch<SetStateAction<WorkspaceViewMode>>
  resetNavigation: () => void
}

export function useWorkbenchModeTransitions({
  workspaceViewMode,
  setWorkspaceMode,
  setWorkspaceViewMode,
  resetNavigation,
}: UseWorkbenchModeTransitionsOptions) {
  const openStudioDeskRoute = useCallback(() => {
    setWorkspaceMode('mods')
    setWorkspaceViewMode('edit')
    resetNavigation()
  }, [resetNavigation, setWorkspaceMode, setWorkspaceViewMode])

  const handleWorkspaceChange = useCallback(
    (mode: WorkspaceMode) => {
      if (mode === 'mods' && workspaceViewMode === 'edit') {
        openStudioDeskRoute()
        return
      }

      setWorkspaceMode(mode)
    },
    [openStudioDeskRoute, setWorkspaceMode, workspaceViewMode],
  )

  const handleWorkspaceViewModeChange = useCallback(
    (mode: WorkspaceViewMode) => {
      if (mode === 'edit') {
        openStudioDeskRoute()
      } else {
        setWorkspaceViewMode(mode)
      }

      void applyAppUiStatePatch({
        workspace: {
          workspaceViewMode: mode,
        },
      })
    },
    [openStudioDeskRoute, setWorkspaceViewMode],
  )

  const handleWorkspaceViewModeChangeFromSnapshot = useCallback(() => {
    const saved = getAppUiStateSnapshot()?.workspace?.workspaceViewMode
    if (saved === 'edit' || saved === 'preview') {
      setWorkspaceViewMode(saved)
    }
  }, [setWorkspaceViewMode])

  return {
    openStudioDeskRoute,
    handleWorkspaceChange,
    handleWorkspaceViewModeChange,
    handleWorkspaceViewModeChangeFromSnapshot,
  }
}
