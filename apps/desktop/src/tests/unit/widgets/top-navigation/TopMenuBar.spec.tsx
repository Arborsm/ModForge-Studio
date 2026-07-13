import type { ComponentProps } from 'react'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import TopMenuBar from '@widgets/top-navigation/ui/TopMenuBar'
import { editorCopy, getSettingsMenuCopy } from '@locales/api'
import { renderWithLocale } from '@test/renderWithLocale.tsx'

const copy = editorCopy['en-US']
const settingsMenuCopy = getSettingsMenuCopy('en-US')
const navCopy = copy.workbenchNavigation

function buildProjectMenu(
  overrides: Partial<NonNullable<ComponentProps<typeof TopMenuBar>['projectMenu']>> = {},
): NonNullable<ComponentProps<typeof TopMenuBar>['projectMenu']> {
  return {
    title: 'Festival Dialogue Pack',
    version: '1.0.0',
    uniqueId: 'Author.FestivalDialogue',
    recentProjects: [
      {
        draftStorageKey: 'festival-dialogue',
        title: 'Festival Dialogue Pack',
        uniqueId: 'Author.FestivalDialogue',
        isCurrent: true,
      },
    ],
    hasActiveProject: true,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
    onOpenProject: vi.fn(),
    onImportProject: vi.fn(),
    onProjectSettings: vi.fn(),
    onExportProject: vi.fn(),
    onCloseProject: vi.fn(),
    ...overrides,
  }
}

function buildProps(overrides: Partial<ComponentProps<typeof TopMenuBar>> = {}): ComponentProps<typeof TopMenuBar> {
  return {
    appMode: 'workbench',
    onAppModeChange: vi.fn(),
    theme: 'dark',
    onToggleTheme: vi.fn(),
    statusTone: 'ready',
    desktopHost: false,
    onMinimizeWindow: vi.fn(),
    onToggleMaximizeWindow: vi.fn(),
    onCloseWindow: vi.fn(),
    settingsMenu: {
      onOpen: vi.fn(),
    },
    projectMenu: buildProjectMenu(),
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
    expect(screen.queryByRole('button', { name: copy.workbenchNavigation.title })).toBeNull()
  })

  it('renders the ModForge brand icon in the title bar', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps()} />)

    const brandIcon = container.querySelector<HTMLImageElement>('.top-menu-brand-icon')

    expect(brandIcon?.getAttribute('src')).toBe('/brand/modforge-logo-primary.svg')
    expect(brandIcon?.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders the project title menu in the title bar center slot', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps()} />)

    const center = container.querySelector('.top-menu-center')
    const titleButton = within(center as HTMLElement).getByRole('button', { name: /Festival Dialogue Pack/i })

    expect(titleButton.className).toContain('top-menu-project-title')
    expect(screen.queryByRole('navigation', { name: navCopy.recentPages })).toBeNull()
  })

  it('opens the project menu and routes create/open/close actions', () => {
    const projectMenu = buildProjectMenu()
    renderWithLocale(<TopMenuBar {...buildProps({ projectMenu })} />)

    fireEvent.click(screen.getByRole('button', { name: /Festival Dialogue Pack/i }))

    expect(screen.getByRole('menu', { name: navCopy.currentProjectLabel })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: navCopy.shellProjectMenuNew }))
    expect(projectMenu.onCreateProject).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Festival Dialogue Pack/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: navCopy.shellProjectMenuOpen }))
    expect(projectMenu.onOpenProject).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Festival Dialogue Pack/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: navCopy.shellProjectMenuClose }))
    expect(projectMenu.onCloseProject).toHaveBeenCalledTimes(1)
  })

  it('renders an empty center slot when projectMenu is absent in workbench mode', () => {
    const { container } = renderWithLocale(
      <TopMenuBar
        {...buildProps({
          projectMenu: undefined,
        })}
      />,
    )

    const center = container.querySelector('.top-menu-center')

    expect(center?.querySelector('.top-menu-project-title')).toBeNull()
    expect(center?.querySelector('.workbench-quick-dock-titlebar')).toBeNull()
    expect(screen.queryByRole('navigation', { name: copy.workbenchNavigation.recentPages })).toBeNull()
  })

  it('does not expose module navigation in the title bar', () => {
    renderWithLocale(<TopMenuBar {...buildProps()} />)

    expect(screen.queryByRole('link', { name: 'Translations' })).toBeNull()
  })

  it('keeps the workbench title bar free of the old gooey navigation when the shell theme is light', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps({ theme: 'light' })} />)

    expect(container.querySelector('.top-menu-gooey-nav')).toBeNull()
    expect(screen.queryByRole('button', { name: copy.workbenchNavigation.title })).toBeNull()
  })

  it('keeps settings in the shell controls instead of the left menu group', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps()} />)

    const shellControls = screen.getByRole('group', { name: 'Shell controls' })
    const modeControls = screen.getByRole('group', { name: copy.shell.modeLabel })

    expect(within(shellControls).getByRole('button', { name: settingsMenuCopy.title })).toBeTruthy()
    expect(within(modeControls).getByRole('button', { name: copy.shell.launcher })).toBeTruthy()
    expect(within(modeControls).getByRole('button', { name: copy.shell.workbench })).toBeTruthy()
    expect(within(shellControls).queryByRole('button', { name: copy.controls.toggleLocale })).toBeNull()
    expect(within(shellControls).queryByText(copy.localeShort['en-US'])).toBeNull()
    expect(within(shellControls).getAllByRole('button')).toHaveLength(2)
    expect(container.querySelector('.dock-chip')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Main menus' })).toBeNull()
  })

  it('keeps legacy history and view controls out of the title bar', () => {
    renderWithLocale(<TopMenuBar {...buildProps()} />)

    expect(screen.queryByRole('button', { name: navCopy.shellHistoryBack })).toBeNull()
    expect(screen.queryByRole('button', { name: navCopy.shellHistoryForward })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Main menus' })).toBeNull()
  })

  it('keeps a dedicated drag layer while preserving desktop window controls', () => {
    const { container } = renderWithLocale(<TopMenuBar {...buildProps()} desktopHost />)

    const dragLayer = container.querySelector('.top-menu-drag-layer[data-tauri-drag-region]')
    const noDragRegions = container.querySelectorAll('[data-top-menu-no-drag="true"]')

    expect(dragLayer).toBeTruthy()
    expect(noDragRegions.length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Minimize window' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Maximize window' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close window' })).toBeTruthy()
  })

  it('switches app mode from workbench to launcher through the mode control', () => {
    const props = buildProps()
    renderWithLocale(<TopMenuBar {...props} />)

    fireEvent.click(screen.getByRole('button', { name: copy.shell.launcher }))

    expect(props.onAppModeChange).toHaveBeenCalledWith('launcher')
  })

  it('marks the current app mode in the segmented control', () => {
    const { rerender } = renderWithLocale(<TopMenuBar {...buildProps()} />)

    expect(screen.getByRole('button', { name: copy.shell.launcher })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: copy.shell.workbench })).toHaveAttribute('aria-pressed', 'true')

    rerender(<TopMenuBar {...buildProps({ appMode: 'launcher' })} />)

    expect(screen.getByRole('button', { name: copy.shell.launcher })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: copy.shell.workbench })).toHaveAttribute('aria-pressed', 'false')
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
    expect(gooeyNav?.closest('[data-top-menu-no-drag="true"]')).toBeTruthy()
    expect(within(launcherNav).getByRole('button', { name: copy.launcher.pages.library })).toBeTruthy()
    expect(within(launcherNav).getByRole('button', { name: copy.launcher.pages.discover })).toBeTruthy()
    expect(within(launcherNav).getByRole('button', { name: copy.launcher.pages.updates })).toBeTruthy()
    expect(within(launcherNav).getByRole('button', { name: copy.launcher.pages.configuration })).toBeTruthy()
    expect(within(launcherNav).queryByRole('link', { name: copy.launcher.pages.library })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.launcher.downloads.title })?.getAttribute('aria-current')).not.toBe('page')
  })

  it('keeps launcher title bar controls marked as no-drag islands', () => {
    const launcherChrome = buildProps().launcherChrome!
    const { container } = renderWithLocale(
      <TopMenuBar
        {...buildProps({
          appMode: 'launcher',
          desktopHost: true,
          launcherChrome: {
            ...launcherChrome,
            downloadsBadgeCount: 3,
          },
        })}
      />,
    )

    const controls = [
      screen.getByRole('button', { name: copy.launcher.pages.library }),
      screen.getByRole('button', { name: copy.launcher.downloads.title }),
      screen.getByRole('button', { name: copy.controls.toggleTheme }),
      screen.getByRole('button', { name: copy.shell.workbench }),
      screen.getByRole('button', { name: `${settingsMenuCopy.title} Dialog` }),
      screen.getByRole('button', { name: 'Minimize window' }),
      screen.getByRole('button', { name: 'Maximize window' }),
      screen.getByRole('button', { name: 'Close window' }),
    ]

    for (const control of controls) {
      expect(control.closest('[data-top-menu-no-drag="true"]')).toBeTruthy()
    }

    expect(container.querySelector('.top-menu-drag-layer[data-tauri-drag-region]')).toBeTruthy()
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

    const updatesLink = screen.getByRole('button', { name: copy.launcher.pages.updates })
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

    expect(screen.getByRole('button', { name: copy.launcher.pages.configuration })).toBeTruthy()
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

    const settingsLink = screen.getAllByRole('button', { name: copy.launcher.pages.configuration }).at(-1)
    expect(settingsLink?.querySelector('.top-menu-warning-dot')).toBeNull()
  })
})
