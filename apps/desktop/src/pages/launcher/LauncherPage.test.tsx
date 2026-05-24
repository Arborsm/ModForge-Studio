import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LauncherPage } from './LauncherPage'
import { renderWithLocale } from '@test/renderWithLocale.tsx'

vi.mock('./ui/LauncherShell', () => ({
  default: () => <div data-testid="launcher-shell" />,
}))

vi.mock('./ui/LauncherDownloadsPopover', () => ({
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
    downloads: {
      downloadProgressPercent: null,
      downloadsHasFailure: false,
      badgeCount: 0,
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
