import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { WorkspaceStoredState } from '@shared/contracts'

const appUiStateMocks = vi.hoisted(() => ({
  applyAppUiStatePatch: vi.fn(),
  getAppUiStateSnapshot: vi.fn(),
}))

vi.mock('@shared/lib/app-state', () => appUiStateMocks)

import { useWorkspaceLayoutPersistence } from '@pages/workbench/model/useWorkspaceLayoutPersistence'

const storageKey = 'map-browser'

function createLayout(width: number) {
  return {
    panels: {},
    slots: {},
    chrome: { leftWidth: width },
    presets: {},
  } as unknown as WorkspaceStoredState
}

describe('useWorkspaceLayoutPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appUiStateMocks.applyAppUiStatePatch.mockResolvedValue(undefined)
  })

  it('does not overwrite a restored layout with the default layout reported before hydration', async () => {
    const restoredLayout = createLayout(0.32)
    const startupDefaultLayout = createLayout(0.24)
    appUiStateMocks.getAppUiStateSnapshot.mockReturnValue({ workspace: { modules: { [storageKey]: { layout: restoredLayout } } } })

    const { result, rerender } = renderHook(({ ready }) => useWorkspaceLayoutPersistence(ready, storageKey), {
      initialProps: { ready: false },
    })

    act(() => result.current.handleWorkspacePersistStateChange(storageKey, startupDefaultLayout))
    rerender({ ready: true })

    expect(result.current.workspaceLayouts[storageKey]).toEqual(restoredLayout)
    expect(appUiStateMocks.applyAppUiStatePatch).not.toHaveBeenCalled()
  })

  it('persists a committed layout immediately after hydration', () => {
    const initialLayout = createLayout(0.24)
    const latestLayout = createLayout(0.36)
    appUiStateMocks.getAppUiStateSnapshot.mockReturnValue({ workspace: { modules: { [storageKey]: { layout: initialLayout } } } })

    const { result } = renderHook(() => useWorkspaceLayoutPersistence(true, storageKey))

    act(() => result.current.handleWorkspacePersistStateChange(storageKey, latestLayout))

    expect(appUiStateMocks.applyAppUiStatePatch).toHaveBeenCalledTimes(1)
    expect(appUiStateMocks.applyAppUiStatePatch).toHaveBeenCalledWith({
      workspace: { modules: { [storageKey]: { layout: latestLayout } } },
    })
  })
})
