import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LauncherShell from './LauncherShell'
import { renderWithLocale } from '../../test/renderWithLocale'

const settingsPageSpy = vi.fn()

vi.mock('./pages/LauncherLibraryPage', () => ({
  LauncherLibraryPage: ({ launchGameLabel }: { launchGameLabel: string }) => <div>{`library-page:${launchGameLabel}`}</div>,
}))

vi.mock('./pages/LauncherDiscoverPage', () => ({
  LauncherDiscoverPage: () => <div>discover-page</div>,
}))

vi.mock('./pages/LauncherUpdatesPage', () => ({
  LauncherUpdatesPage: () => <div>updates-page</div>,
}))

vi.mock('./pages/LauncherDebugPage', () => ({
  LauncherDebugPage: (props: { debugEnabled: boolean; onToggleDebugMode: () => void; downloads: unknown }) => {
    settingsPageSpy(props)
    return <div>settings-page</div>
  },
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
  downloadProgressPercent: null,
  queueDownload: vi.fn(),
  startDebugSimulation: vi.fn(),
  retryItem: vi.fn(),
  retryFailed: vi.fn(),
  removeItem: vi.fn(),
  removeCompleted: vi.fn(),
  installItem: vi.fn(),
  installAllReady: vi.fn(),
  clearAll: vi.fn(),
}

describe('LauncherShell', () => {
  afterEach(() => {
    cleanup()
    settingsPageSpy.mockReset()
  })

  it('routes the library page without rendering an in-page launcher navigation rail', () => {
    const { container } = renderWithLocale(
      <LauncherShell
        page="library"
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
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
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
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
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
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
    const onToggleDebugMode = vi.fn()

    renderWithLocale(
      <LauncherShell
        page="debug"
        debugEnabled={true}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={onToggleDebugMode}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(screen.getByText('settings-page')).toBeTruthy()
    expect(settingsPageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        debugEnabled: true,
        downloads,
        onToggleDebugMode,
      }),
    )
  })

  it('falls back to the library page when the debug page is requested while debug mode is disabled', () => {
    renderWithLocale(
      <LauncherShell
        page="debug"
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(screen.queryByText('settings-page')).toBeNull()
    expect(screen.getByText('library-page:Launch Game')).toBeTruthy()
  })

  it('does not render a downloads page entry inside the shell', () => {
    renderWithLocale(
      <LauncherShell
        page="library"
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
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
