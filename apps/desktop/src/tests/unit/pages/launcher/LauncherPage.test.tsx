import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { LauncherPage } from '@pages/launcher/LauncherPage'
import { renderWithLocale } from '@test/renderWithLocale.tsx'

const { loadGmcmProbeDiagnostics, publishNotification, dismissNotification } = vi.hoisted(() => ({
  loadGmcmProbeDiagnostics: vi.fn(),
  publishNotification: vi.fn(),
  dismissNotification: vi.fn(),
}))

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
      state: 'ready',
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

vi.mock('@features/launcher/model/useLauncherImageFetchNotifications', () => ({
  useLauncherImageFetchNotifications: () => {},
}))

vi.mock('@features/launcher/model/launcherPortContext', () => ({
  useLauncherPort: () => ({
    launchGame: vi.fn(),
    loadGmcmProbeDiagnostics,
  }),
}))

vi.mock('@shared/ui/notifications', () => ({
  publishNotification,
  dismissNotification,
}))

describe('LauncherPage', () => {
  beforeEach(() => {
    loadGmcmProbeDiagnostics.mockReset()
    publishNotification.mockReset()
    dismissNotification.mockReset()
  })

  it('checks GMCM availability before the configuration page is opened', async () => {
    const onLauncherPageChange = vi.fn()
    loadGmcmProbeDiagnostics.mockResolvedValue({
      status: 'warning',
      probeAssemblyPath: '/app/modforge-gmcm-probe.dll',
      dotnetPath: 'dotnet',
      dotnetAvailable: false,
      net6RuntimeAvailable: false,
      installedRuntimes: [],
      warnings: ['dotnet-host-missing'],
      repairActions: ['install-dotnet-6-runtime'],
    })

    renderWithLocale(
      <LauncherPage
        page="library"
        debugEnabled={false}
        desktopHost
        theme="dark"
        locale="zh-CN"
        onToggleTheme={vi.fn()}
        onAppModeChange={vi.fn()}
        onWorkspaceChange={vi.fn()}
        onLauncherPageChange={onLauncherPageChange}
        onMinimizeWindow={vi.fn()}
        onToggleMaximizeWindow={vi.fn()}
        onCloseWindow={vi.fn()}
        onOpenSettings={vi.fn()}
        onToggleDebugMode={vi.fn()}
      />,
    )

    await waitFor(() => expect(publishNotification).toHaveBeenCalled())
    const notification = publishNotification.mock.calls[0][0]
    expect(notification).toEqual(
      expect.objectContaining({
        variant: 'diagnostic',
        summary: expect.any(String),
        description: expect.any(String),
        note: expect.any(String),
        chips: expect.any(Array),
        action: expect.objectContaining({ tone: 'primary', closeOnClick: true }),
      }),
    )
    const route = document.createElement('div')
    const panel = document.createElement('section')
    const scrollIntoView = vi.fn()
    route.dataset.launcherRoute = 'configuration'
    route.className = 'launcher-shell-route-active'
    panel.dataset.testid = 'launcher-config-gmcm-probe'
    panel.tabIndex = -1
    panel.scrollIntoView = scrollIntoView
    route.append(panel)
    document.body.append(route)

    notification.action.callback()
    expect(onLauncherPageChange).toHaveBeenCalledWith('configuration')
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' }))
    expect(document.activeElement).toBe(panel)
    expect(panel.dataset.notificationTarget).toBe('true')
    route.remove()
  })
})
