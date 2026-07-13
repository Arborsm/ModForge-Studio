import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { WorkspaceLayout, type WorkspacePanelConfig } from '@shared/workspace/layout-view/WorkspaceLayout'
import type { WorkspaceStoredState } from '@shared/contracts'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function buildPanels(): WorkspacePanelConfig[] {
  return [
    {
      id: 'assets',
      area: 'left',
      title: 'Assets',
      subtitle: 'Files',
      content: <div>Assets body</div>,
      minWidth: 220,
      minHeight: 220,
    },
    {
      id: 'viewport',
      area: 'center',
      title: 'Viewport',
      subtitle: 'Map',
      content: <div>Viewport body</div>,
      minWidth: 360,
      minHeight: 220,
    },
    {
      id: 'inspector',
      area: 'right',
      title: 'Inspector',
      subtitle: 'Details',
      content: <div>Inspector body</div>,
      minWidth: 260,
      minHeight: 220,
    },
  ]
}

describe('WorkspaceLayout split-only chrome', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders fixed areas and only the three necessary edge split lines', () => {
    const { container } = render(<WorkspaceLayout panels={buildPanels()} storageKey="map-browser" />)

    expect(container.querySelectorAll('[data-workspace-panel]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-workspace-resizer]')).toHaveLength(2)
    expect(container.querySelector('[data-workspace-resizer="left"]')).toBeTruthy()
    expect(container.querySelector('[data-workspace-resizer="right"]')).toBeTruthy()
    expect(container.querySelector('[data-workspace-resizer="bottom"]')).toBeNull()
    expect(container.querySelector('[data-workspace-split-resizer]')).toBeNull()
    expect(container.querySelector('.workspace-panel-floating')).toBeNull()
    expect(container.querySelector('.workspace-drop-overlay')).toBeNull()
    expect(container.querySelector('.workspace-panel-grip')).toBeNull()
  })

  it('persists a changed side split only after the pointer interaction ends', async () => {
    const onPersistStateChange = vi.fn()
    const storageKey = 'map-browser'
    const { container } = render(
      <WorkspaceLayout panels={buildPanels()} storageKey={storageKey} onPersistStateChange={onPersistStateChange} />,
    )

    await waitFor(() => expect(onPersistStateChange).toHaveBeenCalledTimes(1))
    onPersistStateChange.mockClear()

    const resizer = container.querySelector<HTMLElement>('[data-workspace-resizer="left"]')!
    fireEvent.pointerDown(resizer, { pointerId: 7, clientX: 260, clientY: 300 })
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 340, clientY: 300 })
    expect(onPersistStateChange).not.toHaveBeenCalled()

    fireEvent.pointerUp(window, { pointerId: 7, clientX: 340, clientY: 300 })
    expect(onPersistStateChange).toHaveBeenCalledTimes(1)

    const latestState = onPersistStateChange.mock.calls[0][1] as WorkspaceStoredState
    expect(latestState.chrome.leftWidth).toBeGreaterThan(0.22)
    expect(latestState).not.toHaveProperty('panels')
  })

  it('supports a vertical split inside a fixed area without enabling panel dragging', async () => {
    const panels = [
      ...buildPanels(),
      {
        id: 'asset-preview',
        area: 'left' as const,
        title: 'Preview',
        subtitle: '',
        content: <div>Preview body</div>,
        minWidth: 220,
        minHeight: 180,
      },
    ]
    const onPersistStateChange = vi.fn()
    const { container } = render(<WorkspaceLayout panels={panels} storageKey="map-browser" onPersistStateChange={onPersistStateChange} />)

    await waitFor(() => expect(container.querySelector('[data-workspace-split-resizer="left"]')).toBeTruthy())
    const resizer = container.querySelector<HTMLElement>('[data-workspace-split-resizer="left"]')!
    fireEvent.pointerDown(resizer, { pointerId: 8, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 300, clientY: 380 })
    fireEvent.pointerUp(window, { pointerId: 8, clientX: 300, clientY: 380 })

    await waitFor(() => expect(onPersistStateChange).toHaveBeenCalled())
    const latestState = onPersistStateChange.mock.calls.at(-1)?.[1] as WorkspaceStoredState
    expect(latestState.chrome.leftSplit).toBeGreaterThan(0.44)
    expect(container.querySelector('.workspace-drag-preview')).toBeNull()
  })
})
