/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceLayout, type WorkspacePanelConfig } from './WorkspaceLayout'
import { STORAGE_VERSION } from './workspace/layoutConstants'
import { buildDefaultSnapshot } from './workspace/layoutState'

const stylesPath = existsSync(resolve(process.cwd(), 'src/styles/globals.css'))
  ? resolve(process.cwd(), 'src/styles/globals.css')
  : resolve(process.cwd(), 'apps/desktop/src/styles/globals.css')

const styles = readFileSync(stylesPath, 'utf8')

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

function seedFloatingPanelState(storageKey: string, panels: WorkspacePanelConfig[]) {
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

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: STORAGE_VERSION,
      ...snapshot,
      presets: {},
    }),
  )
}

describe('WorkspaceLayout floating panel chrome', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('treats the floating restore action as a no-drag click target and restores the panel to the sidebar', async () => {
    const panels = buildPanels()
    const storageKey = 'modforge:workspace-layout:test:floating-restore'
    const onLayoutMetaChange = vi.fn()

    seedFloatingPanelState(storageKey, panels)

    render(<WorkspaceLayout panels={panels} storageKey={storageKey} onLayoutMetaChange={onLayoutMetaChange} />)

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
  })

  it('shows a grab cursor on draggable panel headers', () => {
    expect(styles).not.toMatch(/\.workspace-panel-header\s*\{[^}]*cursor:\s*grab;/s)
    expect(styles).not.toMatch(/\.workspace-panel-title\s*\{[^}]*cursor:\s*inherit;/s)
    expect(styles).not.toMatch(/\.workspace-panel-subtitle\s*\{[^}]*cursor:\s*inherit;/s)
    expect(styles).toMatch(/\.workspace-panel-grip\s*\{[^}]*cursor:\s*grab;/s)
    expect(styles).toMatch(/\.workspace-panel-grip:active\s*\{[^}]*cursor:\s*grabbing;/s)
  })

  it('keeps the grab cursor only on the floating header grip icon', async () => {
    const panels = buildPanels()
    const storageKey = 'modforge:workspace-layout:test:floating-grip-cursor'

    seedFloatingPanelState(storageKey, panels)

    render(<WorkspaceLayout panels={panels} storageKey={storageKey} />)

    const title = await screen.findByText('Patch Trace')
    const subtitle = await screen.findByText('Applied patch flow for the selected target')
    const grip = title.closest('header')?.querySelector('.workspace-panel-grip') as HTMLElement | null
    const headerMain = title.closest('.workspace-panel-header-main') as HTMLElement | null

    expect(grip?.className).toContain('cursor-grab')
    expect(grip?.className).toContain('active:cursor-grabbing')
    expect(headerMain?.className).not.toContain('cursor-grab')
    expect(title.className).not.toContain('cursor-grab')
    expect(subtitle.className).not.toContain('cursor-grab')
  })
})
