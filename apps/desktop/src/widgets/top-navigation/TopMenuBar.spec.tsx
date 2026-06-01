import type { ComponentProps } from 'react'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TopMenuBar from './ui/TopMenuBar'
import { editorCopy, getSettingsMenuCopy, getViewMenuCopy } from '@locales/editor-shell'
import { renderWithLocale } from '@test/renderWithLocale.tsx'

const copy = editorCopy['en-US']
const viewMenuCopy = getViewMenuCopy('en-US')
const settingsMenuCopy = getSettingsMenuCopy('en-US')

function buildProps(overrides: Partial<ComponentProps<typeof TopMenuBar>> = {}): ComponentProps<typeof TopMenuBar> {
  return {
    appMode: 'workbench',
    onAppModeChange: vi.fn(),
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
    launcherChrome: {
      page: 'library',
      visiblePages: ['library', 'discover', 'updates', 'configuration'],
      onPageChange: vi.fn(),
      updatesBadgeCount: 0,
      downloadsBadgeCount: 0,
      downloadsProgressPercent: null,
      downloadsHasFailure: false,
      settingsWarning: false,
      settingsWarningLabel: 'Launcher setup incomplete',
      downloadsPopover: <div>Downloads popover</div>,
    },
    ...overrides,
  }
}

describe('TopMenuBar', () => {
  afterEach(() => {
    cleanup()
  })

  it('removes the old workbench module navigation from the title bar', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps()} />)

    expect(screen.queryByRole('navigation', { name: copy.center.moduleWorkspace })).toBeNull()
    expect(container.querySelector('.top-menu-gooey-nav')).toBeNull()
    expect(screen.queryByRole('button', { name: copy.workbenchNavigation.openLaunchpad })).toBeNull()
  })

  it('renders the workbench quick dock in the title bar center slot', () => {
    const { container } = renderWithLocale(
      <TopMenuBar
        {...buildProps({
          workbenchQuickDock: (
            <nav className="workbench-quick-dock workbench-quick-dock-titlebar" aria-label={copy.workbenchNavigation.recentPages}>
              <button type="button">Dock</button>
            </nav>
          ),
        })}
      />,
    )

    const center = container.querySelector('.top-menu-center')

    expect(center?.querySelector('.workbench-quick-dock-titlebar')).toBeTruthy()
    expect(screen.getByRole('navigation', { name: copy.workbenchNavigation.recentPages })).toBeTruthy()
  })

  it('does not route workspace changes from the title bar module navigation anymore', () => {
    const props = buildProps()
    renderWithLocale(<TopMenuBar {...props} />)

    expect(screen.queryByRole('link', { name: 'Translations' })).toBeNull()
    expect(props.onWorkspaceChange).not.toHaveBeenCalled()
  })

  it('keeps the workbench title bar free of the old gooey navigation when the shell theme is light', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps({ theme: 'light' })} />)

    expect(container.querySelector('.top-menu-gooey-nav')).toBeNull()
    expect(screen.queryByRole('button', { name: copy.workbenchNavigation.openLaunchpad })).toBeNull()
  })

  it('opens the view menu with expanded state and a labeled menu', () => {
    const props = buildProps()
    renderWithLocale(<TopMenuBar {...props} />)

    const viewButton = screen.getByRole('button', { name: viewMenuCopy.title })

    expect(viewButton.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(viewButton)

    expect(viewButton.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu', { name: viewMenuCopy.title })).toBeTruthy()

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Viewport/i }))

    expect(props.viewMenu.onTogglePanel).toHaveBeenCalledWith('viewport', false)
  })

  it('keeps settings in the shell controls instead of the left menu group', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps()} />)

    const shellControls = screen.getByRole('group', { name: 'Shell controls' })
    const mainMenus = screen.getByRole('navigation', { name: 'Main menus' })

    expect(within(shellControls).getByRole('button', { name: settingsMenuCopy.title })).toBeTruthy()
    expect(within(shellControls).getByRole('button', { name: copy.shell.launcher })).toBeTruthy()
    expect(within(shellControls).queryByRole('button', { name: copy.controls.toggleLocale })).toBeNull()
    expect(within(shellControls).queryByText(copy.localeShort['en-US'])).toBeNull()
    expect(within(shellControls).getAllByRole('button')).toHaveLength(3)
    expect(container.querySelector('.dock-chip')).toBeNull()
    expect(within(mainMenus).queryByRole('button', { name: settingsMenuCopy.title })).toBeNull()
  })

  it('keeps only project and view menus in the title bar', () => {
    renderWithLocale(<TopMenuBar {...buildProps()} />)

    const mainMenus = screen.getByRole('navigation', { name: 'Main menus' })

    expect(within(mainMenus).getByRole('button', { name: copy.leftDock.project })).toBeTruthy()
    expect(within(mainMenus).getByRole('button', { name: viewMenuCopy.title })).toBeTruthy()
    expect(within(mainMenus).queryByRole('button', { name: copy.menus[1] })).toBeNull()
    expect(within(mainMenus).queryByRole('button', { name: copy.menus[3] })).toBeNull()
    expect(within(mainMenus).queryByRole('button', { name: copy.menus[4] })).toBeNull()
  })

  it('keeps a dedicated drag layer while preserving desktop window controls', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps()} desktopHost />)

    const dragLayer = container.querySelector('.top-menu-drag-layer[data-tauri-drag-region]')

    expect(dragLayer).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Minimize window' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Maximize window' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close window' })).toBeTruthy()
  })

  it('switches app mode from workbench to launcher through shell controls', () => {
    const props = buildProps()
    renderWithLocale(<TopMenuBar {...props} />)

    fireEvent.click(screen.getByRole('button', { name: copy.shell.launcher }))

    expect(props.onAppModeChange).toHaveBeenCalledWith('launcher')
  })

  it('hides workspace module navigation while launcher mode is active', () => {
    renderWithLocale(<TopMenuBar {...buildProps({ appMode: 'launcher' })} />)

    expect(screen.queryByRole('navigation', { name: copy.center.moduleWorkspace })).toBeNull()
    expect(screen.getByRole('button', { name: copy.shell.workbench })).toBeTruthy()
  })

  it('renders launcher page navigation in the title bar without a downloads page tab', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps({ appMode: 'launcher', theme: 'light' })} />)

    const launcherNav = screen.getByRole('navigation', { name: copy.launcher.navigation })
    const gooeyNav = container.querySelector('.top-menu-gooey-nav')

    expect(gooeyNav?.getAttribute('data-variant')).toBe('light')
    expect(within(launcherNav).getByRole('link', { name: copy.launcher.pages.library })).toBeTruthy()
    expect(within(launcherNav).getByRole('link', { name: copy.launcher.pages.discover })).toBeTruthy()
    expect(within(launcherNav).getByRole('link', { name: copy.launcher.pages.updates })).toBeTruthy()
    expect(within(launcherNav).getByRole('link', { name: copy.launcher.pages.configuration })).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.launcher.downloads.title })?.getAttribute('aria-current')).not.toBe('page')
  })

  it('renders an updates count badge on the updates tab and caps large values', () => {
    const launcherChrome = buildProps().launcherChrome!
    renderWithLocale(
      <TopMenuBar
        {...buildProps({
          appMode: 'launcher',
          launcherChrome: {
            ...launcherChrome,
            updatesBadgeCount: 125,
          },
        })}
      />,
    )

    const updatesLink = screen.getByRole('link', { name: copy.launcher.pages.updates })
    const badge = updatesLink.querySelector('.gooey-nav-item-badge')
    const overlayText = document.querySelector('.top-menu-gooey-nav .effect.text')

    expect(badge?.textContent).toBe('99+')
    expect(overlayText?.textContent).not.toContain('99+')
  })

  it('keeps the launcher configuration page tab visible when debug mode is disabled', () => {
    const launcherChrome = buildProps().launcherChrome!
    renderWithLocale(
      <TopMenuBar
        {...buildProps({
          appMode: 'launcher',
          launcherChrome: {
            ...launcherChrome,
            visiblePages: ['library', 'discover', 'updates', 'configuration'],
          },
        })}
      />,
    )

    expect(screen.getByRole('link', { name: copy.launcher.pages.configuration })).toBeTruthy()
  })

  it('opens the downloads popup as a non-modal launcher popover', () => {
    const launcherChrome = buildProps().launcherChrome!
    const props = buildProps({
      appMode: 'launcher',
      launcherChrome: {
        ...launcherChrome,
        downloadsBadgeCount: 3,
      },
    })

    renderWithLocale(<TopMenuBar {...props} />)

    const shellControls = screen.getByRole('group', { name: 'Shell controls' })
    fireEvent.click(within(shellControls).getByRole('button', { name: copy.launcher.downloads.title }))

    const popover = screen.getByRole('dialog', { name: copy.launcher.downloads.title })

    expect(popover).toBeTruthy()
    expect(popover.getAttribute('aria-modal')).toBeNull()
    expect(popover.getAttribute('class') ?? '').toContain('pointer-events-auto')
    expect(screen.getByText('Downloads popover')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Launch Game' })).toBeNull()
    expect(document.querySelector('.top-menu-float-backdrop')).toBeNull()
    expect(screen.queryByRole('button', { name: copy.launcher.actions.closeDialog })).toBeNull()
  })

  it('renders an aggregate download progress ring in the launcher shell controls', () => {
    const launcherChrome = buildProps().launcherChrome!
    renderWithLocale(
      <TopMenuBar
        {...buildProps({
          appMode: 'launcher',
          launcherChrome: {
            ...launcherChrome,
            downloadsProgressPercent: 50,
          },
        })}
      />,
    )

    const shellControls = screen.getByRole('group', { name: 'Shell controls' })
    const progressRing = within(shellControls).getByRole('progressbar', { name: /downloads progress/i })

    expect(progressRing.getAttribute('aria-valuenow')).toBe('50')
  })

  it('does not render the launcher setup warning marker beside the configuration page label', () => {
    const launcherChrome = buildProps().launcherChrome!
    renderWithLocale(
      <TopMenuBar
        {...buildProps({
          appMode: 'launcher',
          launcherChrome: {
            ...launcherChrome,
            settingsWarning: true,
          },
        })}
      />,
    )

    const settingsLink = screen.getAllByRole('link', { name: copy.launcher.pages.configuration }).at(-1)
    expect(settingsLink?.querySelector('.top-menu-warning-dot')).toBeNull()
  })
})
