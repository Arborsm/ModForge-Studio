import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import type { LauncherSettings } from '@platform/desktop'
import { createMockLauncherPort } from '@test/launcherTestPort'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LauncherDebugPage } from './LauncherDebugPage'

const reportAppEvent = vi.fn()
const clearLauncherImageCache = vi.fn()
const loadLauncherNexusDiagnostics = vi.fn()
const retryLauncherNexusDiagnosticsRoute = vi.fn()
const setLauncherNexusForceOffline = vi.fn()
const applyAppUiStatePatch = vi.fn()
const getAppUiStateSnapshot = vi.fn(() => ({
  launcher: {
    forceOffline: false,
  },
}))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function createNeverSettledPromise<T>() {
  return new Promise<T>(() => {})
}

vi.mock('@shared/lib/observability', () => ({
  reportAppEvent: (...args: unknown[]) => reportAppEvent(...args),
}))

vi.mock('@platform/desktop', () => ({
  canUseDesktopHost: () => true,
  clearLauncherImageCache: (...args: unknown[]) => clearLauncherImageCache(...args),
  loadLauncherNexusDiagnostics: (...args: unknown[]) => loadLauncherNexusDiagnostics(...args),
  retryLauncherNexusDiagnosticsRoute: (...args: unknown[]) => retryLauncherNexusDiagnosticsRoute(...args),
  setLauncherNexusForceOffline: (...args: unknown[]) => setLauncherNexusForceOffline(...args),
}))

vi.mock('@shared/lib/app-state', () => ({
  applyAppUiStatePatch: (...args: unknown[]) => applyAppUiStatePatch(...args),
  getAppUiStateSnapshot: () => getAppUiStateSnapshot(),
}))
const copy = editorCopy['zh-CN'].launcher
const downloads = {
  activeItems: [],
  startDebugSimulation: vi.fn(),
}

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: 'E:\\Games\\Stardew Valley',
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    downloadPath: 'E:\\Downloads\\Stardew',
    nexusApiKey: 'api-key',
    autoInstallDownloads: true,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
    ...overrides,
  } as LauncherSettings
}

function createSettingsState(settings: LauncherSettings = createSettings()) {
  return {
    settings,
    state: 'ready' as const,
    error: null,
    saveMessage: null,
    setSettings: vi.fn(),
    updateField: vi.fn(),
    save: vi.fn(async () => settings),
    refresh: vi.fn(async () => {}),
    pickDirectory: vi.fn(async () => null),
  }
}

function renderDebugPage(
  overrides?: Partial<ComponentProps<typeof LauncherDebugPage>>,
  port: LauncherPort = createMockLauncherPort(),
) {
  const settingsState = createSettingsState()
  const props = {
    debugEnabled: true,
    onToggleDebugMode: vi.fn(),
    downloads: downloads as never,
    settingsState: settingsState as never,
    ...overrides,
  }

  return renderWithLocale(
    <LauncherTestWrapper port={port}>
      <LauncherDebugPage {...props} />
    </LauncherTestWrapper>,
    'zh-CN',
  )
}

describe('LauncherDebugPage', () => {
  afterEach(() => {
    cleanup()
    reportAppEvent.mockReset()
    clearLauncherImageCache.mockReset()
    loadLauncherNexusDiagnostics.mockReset()
    retryLauncherNexusDiagnosticsRoute.mockReset()
    setLauncherNexusForceOffline.mockReset()
    applyAppUiStatePatch.mockReset()
    getAppUiStateSnapshot.mockReset()
    getAppUiStateSnapshot.mockReturnValue({
      launcher: {
        forceOffline: false,
      },
    })
    downloads.startDebugSimulation.mockReset()
  })

  it('renders localized debug tool sections', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderDebugPage()

    expect(screen.getByRole('heading', { name: copy.debug.title, level: 2 })).toBeTruthy()
    expect(screen.getByRole('region', { name: copy.settings.title })).toHaveClass('launcher-config-main')
    expect(screen.getByRole('region', { name: copy.diagnostics.title })).toHaveClass('launcher-config-network')
    expect(screen.getByRole('region', { name: copy.debug.moreToolsTitle })).toHaveClass('launcher-config-tools')
    expect(screen.queryByRole('heading', { name: copy.settings.title, level: 2 })).toBeNull()
    expect(screen.getByText(copy.settings.pathsTitle)).toBeTruthy()
    expect(screen.getByText(copy.settings.nexusAccessTitle)).toBeTruthy()
    expect(screen.getByText(copy.settings.downloadBehaviorTitle)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: copy.debug.notificationsTitle, level: 2 })).toBeNull()
    expect(screen.queryByRole('heading', { name: copy.debug.logsTitle, level: 2 })).toBeNull()
    expect(screen.queryByRole('heading', { name: copy.debug.simulationTitle, level: 2 })).toBeNull()
  })

  it('merges Nexus REST route diagnostics with API key status above the More tools toggle', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'nexusApi',
          label: 'Nexus REST API',
          endpoint: 'https://api.nexusmods.com/v1/games/stardewvalley/mods/trending.json',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })
    const validateNexusApiKey = vi.fn().mockResolvedValue({
      userName: 'ApiPilot',
      isPremium: false,
      dailyRemaining: 42,
      hourlyRemaining: 24,
      dailyResetAt: null,
      hourlyResetAt: null,
    })

    renderDebugPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    const diagnosticsHeading = screen.getByRole('heading', { name: copy.debug.nexusDiagnosticsTitle, level: 2 })
    const apiHeading = await screen.findByRole('heading', { name: 'Nexus REST API', level: 3 })
    const moreButton = screen.getByRole('button', { name: copy.debug.moreToolsAction })
    const apiRouteRow = apiHeading.closest('.launcher-debug-route-row')

    expect(Boolean(diagnosticsHeading.compareDocumentPosition(apiHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(Boolean(apiHeading.compareDocumentPosition(moreButton) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(apiRouteRow?.closest('.launcher-debug-route-list')).toBeTruthy()
    expect(apiRouteRow?.textContent).toContain('Connected after 1 attempt.')
    await waitFor(() => {
      expect(apiRouteRow?.textContent).toContain(`ApiPilot · ${copy.diagnostics.premiumFree}`)
      expect(apiRouteRow?.textContent).toContain(copy.diagnostics.quotaRemaining('42'))
    })
    expect(screen.queryByRole('heading', { name: copy.diagnostics.apiKeyTitle, level: 3 })).toBeNull()
    expect(validateNexusApiKey).toHaveBeenCalled()
  })

  it('explains each Nexus route responsibility and keeps API quota plus raw error details visible', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })
    const validateNexusApiKey = vi.fn().mockRejectedValue(new Error('HTTP 503: upstream unavailable'))

    renderDebugPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    expect(await screen.findByText('Nexus Public GraphQL')).toBeTruthy()
    expect(screen.getByText('浏览目录、搜索和公开详情查询')).toBeTruthy()
    expect(await screen.findByText(copy.diagnostics.errors.serviceUnavailable.title)).toBeTruthy()
    expect(screen.getByText('Log: HTTP 503: upstream unavailable')).toBeTruthy()
    expect(screen.getByText(copy.diagnostics.apiKeyUnchecked)).toBeTruthy()
  })

  it('does not mark the Nexus API row as success when API validation still failed after SSO', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const validateNexusApiKey = vi.fn().mockRejectedValue(new Error('network timeout'))
    const port = createMockLauncherPort({
      validateNexusApiKey,
      getNexusSsoStatus: vi.fn().mockResolvedValue({
        status: 'authorized' as const,
        errorKind: null,
        errorMessage: null,
        userName: 'SsoPilot',
        isPremium: true,
        ssoId: 'test-sso-id',
      }),
    })

    renderDebugPage(undefined, port)

    expect(await screen.findByText(copy.diagnostics.errors.network.title)).toBeTruthy()
    expect(screen.getByText(copy.diagnostics.ssoAuthorized)).toBeTruthy()

    const apiRouteRow = screen
      .getByRole('heading', { name: copy.diagnostics.apiKeyTitle, level: 3 })
      .closest('.launcher-debug-route-row')
    expect(apiRouteRow).not.toHaveClass('launcher-debug-route-row-success')
    expect(apiRouteRow).toHaveClass('launcher-debug-route-row-error')
  })

  it('keeps debug utilities collapsed until more is requested', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const { container } = renderDebugPage()

    expect(screen.queryByRole('heading', { name: copy.debug.notificationsTitle, level: 2 })).toBeNull()
    expect(screen.getByRole('heading', { name: copy.debug.nexusDiagnosticsTitle, level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.diagnostics.apiKeyTitle, level: 3 })).toBeTruthy()
    expect(screen.queryByText('Nexus Public GraphQL')).toBeNull()

    const moreButton = screen.getByRole('button', { name: copy.debug.moreToolsAction })
    expect(moreButton.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(moreButton)

    expect(screen.getByRole('button', { name: copy.debug.lessToolsAction }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(copy.debug.notificationsOverviewTitle)).toBeTruthy()
    expect(screen.getByText(copy.debug.logsOverviewTitle)).toBeTruthy()
    expect(container.querySelectorAll('.launcher-debug-stat-card')).toHaveLength(2)
    expect(container.querySelector('.launcher-debug-overview-divider')).toBeNull()
    expect(screen.getByRole('heading', { name: copy.debug.notificationsTitle, level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.debug.logsTitle, level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.debug.simulationTitle, level: 2 })).toBeTruthy()
  })

  it('renders a debug mode switch and calls the toggle handler', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const onToggleDebugMode = vi.fn()

    renderDebugPage({ onToggleDebugMode })
    fireEvent.click(screen.getByRole('button', { name: copy.debug.moreToolsAction }))

    const toggle = screen.getByRole('switch', { name: copy.debug.debugOnlyTitle })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)

    expect(onToggleDebugMode).toHaveBeenCalledTimes(1)
  })

  it('emits a debug notification test event', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderDebugPage()
    fireEvent.click(screen.getByRole('button', { name: copy.debug.moreToolsAction }))

    fireEvent.click(screen.getByRole('button', { name: copy.debug.notificationButtons.debug }))

    expect(reportAppEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
        title: copy.debug.notificationButtons.debug,
        debugDiagnosticsEnabled: true,
      }),
    )
  })

  it('emits a warning log test event without showing a notification', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderDebugPage()
    fireEvent.click(screen.getByRole('button', { name: copy.debug.moreToolsAction }))

    fireEvent.click(screen.getByRole('button', { name: copy.debug.logButtons.warning }))

    expect(reportAppEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warning',
        title: copy.debug.logButtons.warning,
        notify: false,
      }),
    )
  })

  it('starts a simulated launcher download from the debug page', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderDebugPage()
    fireEvent.click(screen.getByRole('button', { name: copy.debug.moreToolsAction }))

    fireEvent.click(screen.getByRole('button', { name: copy.debug.simulationButtonIdle }))

    expect(downloads.startDebugSimulation).toHaveBeenCalledTimes(1)
  })

  it('clears the launcher image cache from the debug page', () => {
    clearLauncherImageCache.mockResolvedValue(undefined)
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())

    renderDebugPage()
    fireEvent.click(screen.getByRole('button', { name: copy.debug.moreToolsAction }))

    fireEvent.click(screen.getByRole('button', { name: copy.debug.clearImageCacheButton }))

    expect(clearLauncherImageCache).toHaveBeenCalledTimes(1)
  })

  it('shows a loading message while Nexus diagnostics are still pending', () => {
    const pending = createDeferred<{ routes: never[] }>()
    loadLauncherNexusDiagnostics.mockReturnValue(pending.promise)

    renderDebugPage()

    expect(screen.getByText(copy.debug.nexusDiagnosticsLoading)).toBeTruthy()
  })

  it('renders warning and success statuses for Nexus diagnostics routes', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
        {
          routeId: 'nexusImages',
          label: 'Nexus Image CDN',
          endpoint: 'https://staticdelivery.nexusmods.com/',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })

    renderDebugPage()

    await waitFor(() => {
      expect(screen.getByText('Nexus Public GraphQL')).toBeTruthy()
    })
    const warningRouteRow = screen.getByRole('heading', { name: 'Nexus Public GraphQL', level: 3 }).closest('.launcher-debug-route-row')
    const successRouteRow = screen.getByRole('heading', { name: 'Nexus Image CDN', level: 3 }).closest('.launcher-debug-route-row')

    expect(warningRouteRow?.querySelector('.launcher-debug-route-status-warning')?.textContent).toBe('warning')
    expect(successRouteRow?.querySelector('.launcher-debug-route-status-success')?.textContent).toBe('success')
    expect(screen.getByText('Failed after 3 attempts: timeout')).toBeTruthy()
  })

  it('retries only the selected Nexus diagnostics route from the debug page', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
        {
          routeId: 'nexusImages',
          label: 'Nexus Image CDN',
          endpoint: 'https://staticdelivery.nexusmods.com/',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })
    retryLauncherNexusDiagnosticsRoute.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })
    const onDiagnosticsUpdate = vi.fn()

    renderWithLocale(
      <LauncherTestWrapper port={createMockLauncherPort()}>
        <LauncherDebugPage
          debugEnabled={true}
          onToggleDebugMode={vi.fn()}
          onLauncherDiagnosticsUpdate={onDiagnosticsUpdate}
          downloads={downloads as never}
          settingsState={createSettingsState() as never}
        />
      </LauncherTestWrapper>,
      'zh-CN',
    )

    const retryButton = await screen.findByRole('button', { name: `${copy.actions.retry} Nexus Public GraphQL` })
    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(retryLauncherNexusDiagnosticsRoute).toHaveBeenCalledWith('publicGraphql')
    })
    expect(loadLauncherNexusDiagnostics).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByText('Failed after 3 attempts: timeout')).toBeNull()
    })
    expect(screen.getByText('Nexus Image CDN')).toBeTruthy()
    expect(onDiagnosticsUpdate).toHaveBeenLastCalledWith({
      routes: expect.arrayContaining([
        expect.objectContaining({
          routeId: 'publicGraphql',
          status: 'success',
          available: true,
        }),
        expect.objectContaining({
          routeId: 'nexusImages',
          status: 'success',
          available: true,
        }),
      ]),
    })
  })

  it('renders route status labels directly in the pill without an extra clipping wrapper', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
        {
          routeId: 'nexusImages',
          label: 'Nexus Image CDN',
          endpoint: 'https://staticdelivery.nexusmods.com/',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })

    renderDebugPage()

    const warningRouteRow = (await screen.findByRole('heading', { name: 'Nexus Public GraphQL', level: 3 })).closest('.launcher-debug-route-row')
    const successRouteRow = screen.getByRole('heading', { name: 'Nexus Image CDN', level: 3 }).closest('.launcher-debug-route-row')
    const warningLabel = warningRouteRow?.querySelector('.launcher-debug-route-status-warning')
    const successLabel = successRouteRow?.querySelector('.launcher-debug-route-status-success')

    expect(warningLabel?.className).toContain('launcher-debug-route-status-warning')
    expect(successLabel?.className).toContain('launcher-debug-route-status-success')
    expect(warningLabel?.querySelector('.launcher-debug-route-status-copy')).toBeNull()
    expect(successLabel?.querySelector('.launcher-debug-route-status-copy')).toBeNull()
  })

  it('renders Nexus routes in compact diagnostic rows inside the network section', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })

    renderDebugPage()

    const networkSection = screen.getByRole('region', { name: copy.diagnostics.title })
    const routeTitle = await screen.findByRole('heading', { name: 'Nexus Public GraphQL', level: 3 })
    const routeRow = routeTitle.closest('.launcher-debug-route-row')

    expect(networkSection).toHaveClass('launcher-config-network')
    expect(routeRow).toBeTruthy()
    expect(routeRow?.querySelector('.launcher-debug-route-main')).toBeTruthy()
    expect(routeRow?.querySelector('.launcher-debug-route-details')).toBeTruthy()
    expect(routeRow?.querySelector('.launcher-debug-route-message')).toBeTruthy()
    expect(routeRow?.querySelector('.launcher-debug-route-meta')).toBeTruthy()
    expect(routeRow?.querySelector('.launcher-debug-route-detail-row')).toBeNull()
    expect(routeRow?.querySelector('.launcher-debug-route-chip')).toBeNull()
  })

  it('groups route status labels with their result details instead of a separate table column', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })

    renderDebugPage()

    const routeTitle = await screen.findByRole('heading', { name: 'Nexus Public GraphQL', level: 3 })
    const routeRow = routeTitle.closest('.launcher-debug-route-row')
    const details = routeRow?.querySelector('.launcher-debug-route-details')

    expect(details?.querySelector('.launcher-debug-route-status-success')?.textContent).toBe('success')
    expect(details?.querySelector('.launcher-debug-route-message')?.textContent).toContain('Connected after 1 attempt.')
    expect(routeRow?.querySelector(':scope > .launcher-debug-route-status')).toBeNull()
  })

  it('persists and applies the launcher force-offline override from the debug page', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({ routes: [] })
    setLauncherNexusForceOffline.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Forced offline by debug override.',
        },
      ],
    })
    applyAppUiStatePatch.mockResolvedValue(undefined)

    renderDebugPage()

    fireEvent.click(await screen.findByRole('button', { name: copy.debug.forceOfflineEnableButton }))

    await waitFor(() => {
      expect(applyAppUiStatePatch).toHaveBeenCalledWith({
        launcher: {
          forceOffline: true,
        },
      })
      expect(setLauncherNexusForceOffline).toHaveBeenCalledWith(true)
    })
    expect(await screen.findByText('Forced offline by debug override.')).toBeTruthy()
  })
})
