import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { LauncherPage } from '@pages/launcher/LauncherPage'
import { renderWithLocale } from '@test/renderWithLocale.tsx'

vi.mock('@pages/launcher/ui/LauncherShell', () => ({
  default: () => <div data-testid="launcher-shell" />,
}))

vi.mock('@pages/launcher/ui/LauncherDownloadsPopover', () => ({
  LauncherDownloadsPopover: () => <div data-testid="launcher-downloads-popover" />,
}))

vi.mock('@widgets/top-navigation', () => ({
  default: () => <div data-testid="top-menu-bar" />,
}))

vi.mock('@features/launcher/model/useLauncherRuntime', () => ({
  useLauncherRuntime: () => ({
    settingsState: {
      settings: {
        gamePath: null,
      },
    },
    updatesBadgeCount: 0,
    downloadsBadgeCount: 0,
    downloadsProgressPercent: null,
    downloadsHasFailure: false,
    downloads: {
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
      queueDownloads: vi.fn(),
      startDebugSimulation: vi.fn(),
      retryItem: vi.fn(),
      retryFailed: vi.fn(),
      removeItem: vi.fn(),
      removeCompleted: vi.fn(),
      clearAll: vi.fn(),
      markArchivesInstalled: vi.fn(),
    },
  }),
}))

vi.mock('@features/launcher/model/useLauncherUpdateProgressNotifications', () => ({
  useLauncherUpdateProgressNotifications: () => {},
}))

vi.mock('@features/launcher/model/launcherPortContext', () => ({
  useLauncherPort: () => ({
    launchGame: vi.fn(),
  }),
}))

describe('LauncherPage', () => {
  it('does not render a bottom status bar in launcher mode', () => {
    renderWithLocale(
      <LauncherPage
        page="library"
        debugEnabled={false}
        desktopHost={false}
        theme="dark"
        locale="en-US"
        onToggleTheme={vi.fn()}
        onAppModeChange={vi.fn()}
        onWorkspaceChange={vi.fn()}
        onLauncherPageChange={vi.fn()}
        onMinimizeWindow={vi.fn()}
        onToggleMaximizeWindow={vi.fn()}
        onCloseWindow={vi.fn()}
        onOpenSettings={vi.fn()}
        onToggleDebugMode={vi.fn()}
      />,
    )

    expect(screen.getByTestId('launcher-shell')).toBeTruthy()
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })
})
