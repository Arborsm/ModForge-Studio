import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LauncherShell from './LauncherShell'
import { renderWithLocale } from '../../test/renderWithLocale'

vi.mock('./pages/LauncherLibraryPage', () => ({
  LauncherLibraryPage: ({ launchGameLabel }: { launchGameLabel: string }) => <div>{`library-page:${launchGameLabel}`}</div>,
}))

vi.mock('./pages/LauncherDiscoverPage', () => ({
  LauncherDiscoverPage: () => <div>discover-page</div>,
}))

vi.mock('./pages/LauncherUpdatesPage', () => ({
  LauncherUpdatesPage: () => <div>updates-page</div>,
}))

vi.mock('./pages/LauncherSettingsPage', () => ({
  LauncherSettingsPage: () => <div>settings-page</div>,
}))

const settingsState = {
  settings: {
    gamePath: null,
    modsPath: null,
    downloadPath: null,
    nexusApiKey: null,
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
  },
  state: 'ready' as const,
  error: null,
  saveMessage: null,
  setSettings: vi.fn(),
  updateField: vi.fn(),
  save: vi.fn(async () => null),
  refresh: vi.fn(async () => {}),
  pickDirectory: vi.fn(async () => null),
}

const downloads = {
  items: [],
  queuedItems: [],
  activeItems: [],
  readyToInstall: [],
  installedItems: [],
  failedItems: [],
  removableItems: [],
  counts: {
    queued: 0,
    downloading: 0,
    completed: 0,
    failed: 0,
    readyToInstall: 0,
  },
  queueDownload: vi.fn(),
  retryItem: vi.fn(),
  retryFailed: vi.fn(),
  removeItem: vi.fn(),
  removeCompleted: vi.fn(),
  installItem: vi.fn(),
  installAllReady: vi.fn(),
  clearAll: vi.fn(),
}

describe('LauncherShell', () => {
  it('routes the library page without rendering an in-page launcher navigation rail', () => {
    const { container } = renderWithLocale(
      <LauncherShell
        page="library"
        settingsState={settingsState as never}
        downloads={downloads as never}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(screen.getByText('library-page:Launch Game')).toBeTruthy()
    expect(container.querySelector('.launcher-shell-page-nav')).toBeNull()
  })

  it('routes the discover page', () => {
    renderWithLocale(
      <LauncherShell
        page="discover"
        settingsState={settingsState as never}
        downloads={downloads as never}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(screen.getByText('discover-page')).toBeTruthy()
  })

  it('routes the updates page', () => {
    renderWithLocale(
      <LauncherShell
        page="updates"
        settingsState={settingsState as never}
        downloads={downloads as never}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(screen.getByText('updates-page')).toBeTruthy()
  })

  it('routes the settings page', () => {
    renderWithLocale(
      <LauncherShell
        page="settings"
        settingsState={settingsState as never}
        downloads={downloads as never}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(screen.getByText('settings-page')).toBeTruthy()
  })

  it('does not render a downloads page entry inside the shell', () => {
    renderWithLocale(
      <LauncherShell
        page="library"
        settingsState={settingsState as never}
        downloads={downloads as never}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(within(document.body).queryByText('downloads-page')).toBeNull()
  })
})
