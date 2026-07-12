import { describe, expect, it, vi } from 'vite-plus/test'
import { renderHook, act } from '@testing-library/react'
import { useRef, useState } from 'react'
import { useWorkbenchModeTransitions } from '@pages/workbench/model/useWorkbenchModeTransitions'
import type { WorkspaceMode } from '@locales'

function useHarness(initialMode: WorkspaceMode = 'map', initialView: 'edit' | 'preview' = 'preview') {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(initialMode)
  const [workspaceViewMode, setWorkspaceViewMode] = useState<'edit' | 'preview'>(initialView)
  const resetNavigation = useRef(vi.fn()).current
  const transitions = useWorkbenchModeTransitions({
    setWorkspaceMode,
    setWorkspaceViewMode,
    resetNavigation,
  })
  return { workspaceMode, workspaceViewMode, resetNavigation, ...transitions }
}

describe('useWorkbenchModeTransitions', () => {
  it('toggles browse/edit without changing the workspace', () => {
    const { result } = renderHook(() => useHarness('characters', 'preview'))

    act(() => {
      result.current.handleWorkspaceViewModeChange('edit')
    })

    expect(result.current.workspaceMode).toBe('characters')
    expect(result.current.workspaceViewMode).toBe('edit')
    expect(result.current.resetNavigation).toHaveBeenCalled()

    act(() => {
      result.current.handleWorkspaceViewModeChange('preview')
    })

    expect(result.current.workspaceMode).toBe('characters')
    expect(result.current.workspaceViewMode).toBe('preview')
  })
})
