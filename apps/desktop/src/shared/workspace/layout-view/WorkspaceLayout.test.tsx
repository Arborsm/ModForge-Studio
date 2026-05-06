import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceLayout, type WorkspacePanelConfig } from './WorkspaceLayout'
import { buildDefaultSnapshot, sanitizeStoredState } from '@shared/workspace/layoutState'
import type { WorkspaceStoredState } from '@shared/contracts'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function buildPanels(): WorkspacePanelConfig[] {
  return [
    {
      id: 'mods-trace',
      title: 'Patch Trace',
      subtitle: 'Applied patch flow for the selected target',
      content: <div>Trace body</div>,
      minWidth: 300,
      minHeight: 220,
      defaultDock: 'right-top',
      defaultDockHeight: 360,
    },
  ]
}

function createFloatingPanelState(panels: WorkspacePanelConfig[]) {
  const snapshot = buildDefaultSnapshot(panels)
  snapshot.panels['mods-trace'] = {
    ...snapshot.panels['mods-trace'],
    mode: 'floating',
    lastMode: 'floating',
    x: 140,
    y: 96,
    width: 360,
    height: 260,
  }

  return sanitizeStoredState(
    {
      ...snapshot,
      presets: {},
    },
    panels,
  )
}

describe('WorkspaceLayout floating panel chrome', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('treats the floating restore action as a no-drag click target and restores the panel to the sidebar', async () => {
    const panels = buildPanels()
    const storageKey = 'modforge:workspace-layout:test:floating-restore'
    const onLayoutMetaChange = vi.fn()
    const onPersistStateChange = vi.fn()
    const persistedState = createFloatingPanelState(panels)

    render(
      <WorkspaceLayout
        panels={panels}
        storageKey={storageKey}
        persistedState={persistedState}
        onPersistStateChange={onPersistStateChange}
        onLayoutMetaChange={onLayoutMetaChange}
      />,
    )

    const restoreButton = await screen.findByTitle('Restore to sidebar')
    expect(restoreButton.getAttribute('data-panel-no-drag')).toBe('true')

    fireEvent.click(restoreButton)

    await waitFor(() => {
      const latest = onLayoutMetaChange.mock.calls.at(-1)?.[0]
      expect(latest?.panelItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'mods-trace',
            mode: 'docked',
          }),
        ]),
      )
    })
    expect(onPersistStateChange).toHaveBeenCalledWith(
      storageKey,
      expect.objectContaining({
        panels: expect.objectContaining({
          'mods-trace': expect.objectContaining({
            mode: 'docked',
          }),
        }),
      }),
    )
  })

  it('does not bounce persisted layout state when the parent echoes it back', async () => {
    const panels = buildPanels()
    const storageKey = 'modforge:workspace-layout:test:controlled-echo'
    const onPersistStateChange = vi.fn()

    function ControlledHarness() {
      const [persistedState, setPersistedState] = useState<WorkspaceStoredState | null>(null)

      return (
        <WorkspaceLayout
          panels={panels}
          storageKey={storageKey}
          persistedState={persistedState}
          onPersistStateChange={(nextStorageKey, nextState) => {
            onPersistStateChange(nextStorageKey, nextState)
            setPersistedState(nextState)
          }}
        />
      )
    }

    render(<ControlledHarness />)

    await waitFor(() => {
      expect(onPersistStateChange).toHaveBeenCalledTimes(1)
    })
  })
})
