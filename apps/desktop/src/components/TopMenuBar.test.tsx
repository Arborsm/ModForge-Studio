import type { ComponentProps } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TopMenuBar from './TopMenuBar'
import { editorCopy, getSettingsMenuCopy, getViewMenuCopy } from '../lib/editor-shell'

const copy = editorCopy['en-US']
const viewMenuCopy = getViewMenuCopy('en-US')
const settingsMenuCopy = getSettingsMenuCopy('en-US')

function buildProps(): ComponentProps<typeof TopMenuBar> {
  return {
    copy,
    workspaceMode: 'map',
    onWorkspaceChange: vi.fn(),
    theme: 'dark',
    onToggleTheme: vi.fn(),
    locale: 'en-US',
    onToggleLocale: vi.fn(),
    statusTone: 'ready',
    desktopHost: false,
    onMinimizeWindow: vi.fn(),
    onToggleMaximizeWindow: vi.fn(),
    onCloseWindow: vi.fn(),
    viewMenu: {
      title: viewMenuCopy.title,
      resetLabel: viewMenuCopy.resetLabel,
      savePresetLabel: viewMenuCopy.savePresetLabel,
      panelsLabel: viewMenuCopy.panelsLabel,
      presetsLabel: viewMenuCopy.presetsLabel,
      emptyPresetsLabel: viewMenuCopy.emptyPresetsLabel,
      panelItems: [
        {
          id: 'viewport',
          title: 'Viewport',
          visible: true,
          mode: 'docked' as const,
          dock: 'center' as const,
        },
      ],
      presetNames: [],
      onTogglePanel: vi.fn(),
      onResetLayout: vi.fn(),
      onSavePreset: vi.fn(),
      onLoadPreset: vi.fn(),
      onDeletePreset: vi.fn(),
    },
    settingsMenu: {
      title: settingsMenuCopy.title,
      onOpen: vi.fn(),
    },
    projectMenu: {
      title: copy.leftDock.project,
      onOpen: vi.fn(),
    },
  }
}

describe('TopMenuBar', () => {
  it('labels the workspace module navigation and marks the active module', () => {
    render(<TopMenuBar {...buildProps()} />)

    const moduleNav = screen.getByRole('navigation', { name: copy.center.moduleWorkspace })

    const activeModule = within(moduleNav).getByRole('button', { name: copy.nav.map })
    const inactiveModule = within(moduleNav).getByRole('button', { name: copy.nav.characters })

    expect(activeModule).toHaveAttribute('aria-current', 'page')
    expect(inactiveModule).not.toHaveAttribute('aria-current')
  })

  it('opens the view menu with expanded state and a labeled menu', () => {
    const props = buildProps()
    render(<TopMenuBar {...props} />)

    const viewButton = screen.getByRole('button', { name: viewMenuCopy.title })

    expect(viewButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(viewButton)

    expect(viewButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: viewMenuCopy.title })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Viewport/i }))

    expect(props.viewMenu.onTogglePanel).toHaveBeenCalledWith('viewport', false)
  })
})
