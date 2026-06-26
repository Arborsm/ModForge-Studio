import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { WorkspaceMode } from '@locales'

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
  const openProjectEditRoute = useCallback(() => {
    setWorkspaceMode('mods')
    setWorkspaceViewMode('edit')
    resetNavigation()
  }, [resetNavigation, setWorkspaceMode, setWorkspaceViewMode])

  const handleWorkspaceChange = useCallback(
    (mode: WorkspaceMode) => {
      if (mode === 'mods' && workspaceViewMode === 'edit') {
        openProjectEditRoute()
        return
      }

      setWorkspaceMode(mode)
    },
    [openProjectEditRoute, setWorkspaceMode, workspaceViewMode],
  )

  const handleWorkspaceViewModeChange = useCallback(
    (mode: WorkspaceViewMode) => {
      if (mode === 'edit') {
        openProjectEditRoute()
      } else {
        setWorkspaceViewMode(mode)
      }
    },
    [openProjectEditRoute, setWorkspaceViewMode],
  )

  return {
    openProjectEditRoute,
    handleWorkspaceChange,
    handleWorkspaceViewModeChange,
  }
}
