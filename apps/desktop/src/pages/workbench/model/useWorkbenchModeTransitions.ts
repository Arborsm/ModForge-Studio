import { useCallback } from 'react'
import type { WorkspaceMode } from '@locales'

type WorkspaceViewMode = 'edit' | 'preview'

type UseWorkbenchModeTransitionsOptions = {
  setWorkspaceMode: (mode: WorkspaceMode) => void
  setWorkspaceViewMode: (mode: WorkspaceViewMode) => void
  resetNavigation: () => void
}

export function useWorkbenchModeTransitions({
  setWorkspaceMode,
  setWorkspaceViewMode,
  resetNavigation,
}: UseWorkbenchModeTransitionsOptions) {
  const handleWorkspaceChange = useCallback(
    (mode: WorkspaceMode) => {
      setWorkspaceMode(mode)
    },
    [setWorkspaceMode],
  )

  const handleWorkspaceViewModeChange = useCallback(
    (mode: WorkspaceViewMode) => {
      setWorkspaceViewMode(mode)
      if (mode === 'edit') {
        resetNavigation()
      }
    },
    [resetNavigation, setWorkspaceViewMode],
  )

  return {
    handleWorkspaceChange,
    handleWorkspaceViewModeChange,
  }
}
