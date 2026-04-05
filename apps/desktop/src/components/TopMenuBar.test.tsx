import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ComponentProps } from 'react'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TopMenuBar from './TopMenuBar'
import { editorCopy, getSettingsMenuCopy, getViewMenuCopy } from '../lib/editor-shell'
import { renderWithLocale } from '../test/renderWithLocale'

const copy = editorCopy['en-US']
const viewMenuCopy = getViewMenuCopy('en-US')
const settingsMenuCopy = getSettingsMenuCopy('en-US')
const topMenuStylesPath = existsSync(resolve(process.cwd(), 'src/styles/workspace/top-menu.css'))
  ? resolve(process.cwd(), 'src/styles/workspace/top-menu.css')
  : resolve(process.cwd(), 'apps/desktop/src/styles/workspace/top-menu.css')
const topMenuStyles = readFileSync(topMenuStylesPath, 'utf8')

function buildProps(): ComponentProps<typeof TopMenuBar> {
  return {
    workspaceMode: 'map',
    onWorkspaceChange: vi.fn(),
    theme: 'dark',
    onToggleTheme: vi.fn(),
    statusTone: 'ready',
    desktopHost: false,
    onMinimizeWindow: vi.fn(),
    onToggleMaximizeWindow: vi.fn(),
    onCloseWindow: vi.fn(),
    viewMenu: {
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
      onOpen: vi.fn(),
    },
    projectMenu: {
      onOpen: vi.fn(),
    },
  }
}

describe('TopMenuBar', () => {
  it('labels the workspace module navigation and marks the active module', () => {
    renderWithLocale(<TopMenuBar {...buildProps()} />)

    const moduleNav = screen.getByRole('navigation', { name: copy.center.moduleWorkspace })

    const activeModule = within(moduleNav).getByRole('button', { name: copy.nav.map })
    const inactiveModule = within(moduleNav).getByRole('button', { name: copy.nav.characters })

    expect(activeModule).toHaveAttribute('aria-current', 'page')
    expect(inactiveModule).not.toHaveAttribute('aria-current')
  })

  it('opens the view menu with expanded state and a labeled menu', () => {
    const props = buildProps()
    renderWithLocale(<TopMenuBar {...props} />)

    const viewButton = screen.getByRole('button', { name: viewMenuCopy.title })

    expect(viewButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(viewButton)

    expect(viewButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: viewMenuCopy.title })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Viewport/i }))

    expect(props.viewMenu.onTogglePanel).toHaveBeenCalledWith('viewport', false)
  })

  it('keeps settings in the shell controls instead of the left menu group', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps()} />)

    const shellControls = screen.getByRole('group', { name: 'Shell controls' })
    const mainMenus = screen.getByRole('navigation', { name: 'Main menus' })

    expect(within(shellControls).getByRole('button', { name: settingsMenuCopy.title })).toBeInTheDocument()
    expect(within(shellControls).queryByRole('button', { name: copy.controls.toggleLocale })).not.toBeInTheDocument()
    expect(within(shellControls).queryByText(copy.localeShort['en-US'])).not.toBeInTheDocument()
    expect(within(shellControls).getAllByRole('button')).toHaveLength(2)
    expect(container.querySelector('.dock-chip')).not.toBeInTheDocument()
    expect(within(mainMenus).queryByRole('button', { name: settingsMenuCopy.title })).not.toBeInTheDocument()
  })

  it('keeps only project and view menus in the title bar', () => {
    renderWithLocale(<TopMenuBar {...buildProps()} />)

    const mainMenus = screen.getByRole('navigation', { name: 'Main menus' })

    expect(within(mainMenus).getByRole('button', { name: copy.leftDock.project })).toBeInTheDocument()
    expect(within(mainMenus).getByRole('button', { name: viewMenuCopy.title })).toBeInTheDocument()
    expect(within(mainMenus).queryByRole('button', { name: copy.menus[1] })).not.toBeInTheDocument()
    expect(within(mainMenus).queryByRole('button', { name: copy.menus[3] })).not.toBeInTheDocument()
    expect(within(mainMenus).queryByRole('button', { name: copy.menus[4] })).not.toBeInTheDocument()
  })

  it('uses a centered title-bar grid with a dedicated drag layer while preserving desktop window controls', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps()} desktopHost />)

    const titleBar = container.querySelector('.top-menu-primary')
    const dragLayer = container.querySelector('.top-menu-drag-layer[data-tauri-drag-region]')
    const topMenuPrimaryRule = topMenuStyles.match(/\.top-menu-primary\s*\{([\s\S]*?)\n {2}\}/)?.[1] ?? ''

    expect(titleBar).toBeInTheDocument()
    expect(topMenuPrimaryRule).toBeTruthy()
    expect(topMenuPrimaryRule).toMatch(/pointer-events-none|pointer-events:\s*none/)
    expect(topMenuPrimaryRule).toMatch(/display:\s*grid|@apply[\s\S]*\bgrid\b/)
    expect(topMenuPrimaryRule).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)|@apply[\s\S]*grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/,
    )
    expect(dragLayer).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Minimize window' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Maximize window' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close window' })).toBeInTheDocument()
  })

  it('renders the top menu shell classes', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps()} />)

    expect(container.querySelector('.top-menu-bar')).toBeTruthy()
    expect(container.querySelector('.top-menu-primary')).toBeTruthy()
    expect(container.querySelector('.top-menu-workspace')).toBeTruthy()
  })
})
