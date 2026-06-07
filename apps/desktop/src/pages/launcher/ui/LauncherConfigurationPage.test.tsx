import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import type { LauncherLibraryModSummary, LauncherSettings } from '@features/launcher/api'
import {
  clearCachedLauncherConfigurationDiagnostics,
  writeCachedLauncherConfigurationApiKeyStatus,
  writeCachedLauncherConfigurationDiagnostics,
  writeCachedLauncherConfigurationLibraryScan,
  writeCachedLauncherConfigurationRuntimeInfo,
  writeCachedLauncherConfigurationSsoStatus,
} from '@features/launcher'
import { createMockLauncherPort } from '@test/launcherTestPort'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LauncherConfigurationPage } from './LauncherConfigurationPage'

const reportAppEvent = vi.fn()
const clearLauncherImageCache = vi.fn()
const loadLauncherNexusDiagnostics = vi.fn()
const restartLauncherNexusDiagnostics = vi.fn()
const retryLauncherNexusDiagnosticsRoute = vi.fn()
const setLauncherNexusForceOffline = vi.fn()
const applyAppUiStatePatch = vi.fn()
const getAppUiStateSnapshot = vi.fn(() => ({
  launcher: {
    forceOffline: false,
    forceNonPremium: false,
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

vi.mock('@features/launcher/api', () => ({
  clearLauncherImageCache: (...args: unknown[]) => clearLauncherImageCache(...args),
  loadLauncherNexusDiagnostics: (...args: unknown[]) => loadLauncherNexusDiagnostics(...args),
  restartLauncherNexusDiagnostics: (...args: unknown[]) => restartLauncherNexusDiagnostics(...args),
  retryLauncherNexusDiagnosticsRoute: (...args: unknown[]) => retryLauncherNexusDiagnosticsRoute(...args),
  setLauncherNexusForceOffline: (...args: unknown[]) => setLauncherNexusForceOffline(...args),
}))

vi.mock('@shared/lib/desktop', () => ({
  canUseDesktopHost: () => true,
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

function createLibraryMod(overrides: Partial<LauncherLibraryModSummary> = {}): LauncherLibraryModSummary {
  return {
    id: 'mod-1',
    labelKey: 'ModForge.CachedMod',
    name: 'Cached Mod',
    author: 'ModForge',
    version: '1.0.0',
    description: 'Cached mod.',
    uniqueId: 'ModForge.CachedMod',
    folderName: 'Cached Mod',
    absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Cached Mod',
    enabled: true,
    nexusModId: 101,
    updateKeys: ['Nexus:101'],
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: null,
    requiredDependencies: [],
    missingRequiredDependencies: [],
    ...overrides,
  }
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

function renderConfigurationPage(
  overrides?: Partial<ComponentProps<typeof LauncherConfigurationPage>>,
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
      <LauncherConfigurationPage {...props} />
    </LauncherTestWrapper>,
    'zh-CN',
  )
}

function expandDebugTools() {
  fireEvent.click(screen.getByRole('button', { name: copy.configuration.moreToolsAction }))
}

describe('LauncherConfigurationPage', () => {
  afterEach(() => {
    cleanup()
    reportAppEvent.mockReset()
    clearLauncherImageCache.mockReset()
    loadLauncherNexusDiagnostics.mockReset()
    restartLauncherNexusDiagnostics.mockReset()
    retryLauncherNexusDiagnosticsRoute.mockReset()
    setLauncherNexusForceOffline.mockReset()
    clearCachedLauncherConfigurationDiagnostics()
    applyAppUiStatePatch.mockReset()
    getAppUiStateSnapshot.mockReset()
    getAppUiStateSnapshot.mockReturnValue({
      launcher: {
        forceOffline: false,
        forceNonPremium: false,
      },
    })
    downloads.startDebugSimulation.mockReset()
    vi.useRealTimers()
  })

  it('renders localized debug tool sections', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderConfigurationPage()

    expect(document.querySelector('[data-loading-section="launcher-config-completion-rail"]')).toHaveClass('launcher-config-rail-panel')
    expect(document.querySelector('[data-loading-section="launcher-config-download-defaults"]')).toHaveClass('launcher-config-rail-panel')
    expect(screen.queryByTestId('launcher-config-summary')).toBeNull()
    expect(screen.queryByTestId('launcher-config-score-value')).toBeNull()
    expect(screen.getByRole('heading', { name: copy.settings.configurationGameTitle, level: 1 })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.settings.configurationRunDiagnostics })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.settings.configurationViewLogs })).toBeTruthy()
    expect(screen.getByTestId('launcher-config-completion-rail')).toBeTruthy()
    expect(screen.getByTestId('launcher-config-download-defaults')).toBeTruthy()
    expect(screen.getByRole('region', { name: copy.settings.pathsTitle })).toHaveClass('launcher-config-paths')
    expect(screen.getByRole('region', { name: copy.settings.nexusAccessTitle })).toHaveClass('launcher-config-nexus')
    expect(screen.getByRole('region', { name: copy.configuration.moreToolsTitle })).toHaveClass('launcher-config-tools')
    expect(screen.getByText(copy.settings.pathsTitle)).toBeTruthy()
    expect(screen.getByText(copy.settings.nexusAccessTitle)).toBeTruthy()
    expect(screen.queryByRole('region', { name: copy.diagnostics.title })).toBeNull()
    expect(screen.queryByRole('heading', { name: copy.settings.title, level: 2 })).toBeNull()
    expect(screen.queryByRole('heading', { name: copy.configuration.notificationsTitle, level: 2 })).toBeNull()
    expect(screen.queryByRole('heading', { name: copy.configuration.logsTitle, level: 2 })).toBeNull()
    expect(screen.queryByRole('heading', { name: copy.configuration.simulationTitle, level: 2 })).toBeNull()
  })

  it('renders design-matched path rows and wires them to the launcher settings state', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const settingsState = createSettingsState()

    renderConfigurationPage({ settingsState: settingsState as never })

    const pathsPanel = screen.getByRole('region', { name: copy.settings.pathsTitle })
    expect(pathsPanel.querySelectorAll('.launcher-config-path-row')).toHaveLength(3)
    expect(pathsPanel.querySelector('.launcher-config-path-row')).toHaveClass('loading-motion-child-reveal')
    expect(pathsPanel.textContent).not.toContain(copy.settings.gamePathHint)
    expect(pathsPanel.textContent).not.toContain(copy.settings.modsPathHint)
    expect(pathsPanel.textContent).not.toContain(copy.settings.downloadPathHint)
    expect(screen.getByTestId('launcher-config-gamePath-value').textContent).toContain('E:\\Games\\Stardew Valley')

    fireEvent.click(screen.getByRole('button', { name: `${copy.fields.gamePath} ${editorCopy['zh-CN'].controls.browse}` }))
    expect(settingsState.pickDirectory).toHaveBeenCalledWith('gamePath', copy.fields.gamePath)
  })

  it('renders the Nexus account dashboard from API validation data instead of static mock values', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const validateNexusApiKey = vi.fn().mockResolvedValue({
      userName: 'RealPilot',
      avatarUrl: 'https://staticdelivery.nexusmods.com/Images/Users/123/avatar.png',
      profileUrl: 'https://www.nexusmods.com/users/123',
      isPremium: true,
      premiumExpiresAt: '2026-12-31T23:59:59Z',
      dailyRemaining: 18742,
      hourlyRemaining: 500,
      dailyResetAt: null,
      hourlyResetAt: null,
    })

    renderConfigurationPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    expect(await screen.findByText('RealPilot')).toBeTruthy()
    const accountCard = screen.getByTestId('launcher-config-account-card')
    const completionRail = screen.getByTestId('launcher-config-completion-rail')
    const downloadDefaults = screen.getByTestId('launcher-config-download-defaults')
    const nexusPanel = screen.getByTestId('launcher-config-nexus')

    expect(accountCard.closest('.launcher-config-rail')).toBeTruthy()
    expect(accountCard.querySelector<HTMLImageElement>('.launcher-config-avatar-image')?.src).toBe(
      'https://staticdelivery.nexusmods.com/Images/Users/123/avatar.png',
    )
    expect(Boolean(completionRail.compareDocumentPosition(accountCard) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(Boolean(accountCard.compareDocumentPosition(downloadDefaults) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(nexusPanel.querySelector('.launcher-config-account-row')).toBeNull()
    expect(accountCard.textContent).not.toContain('18,742')
    expect(accountCard.textContent).not.toContain('500')
    expect(nexusPanel.textContent).toContain('18,742')
    expect(nexusPanel.textContent).toContain('500')
    expect(accountCard.textContent).toContain('Premium 到期：')

    fireEvent.click(within(accountCard).getByRole('button', { name: copy.diagnostics.validateApiKeyAction }))
    await waitFor(() => {
      expect(validateNexusApiKey).toHaveBeenCalledTimes(2)
    })
  })

  it('renders permanent Premium accounts without an expiry date', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const validateNexusApiKey = vi.fn().mockResolvedValue({
      userName: 'LifetimePilot',
      avatarUrl: null,
      profileUrl: 'https://www.nexusmods.com/users/124',
      isPremium: true,
      isLifetimePremium: true,
      premiumExpiresAt: null,
      dailyRemaining: 18742,
      hourlyRemaining: 500,
      dailyResetAt: null,
      hourlyResetAt: null,
    })

    renderConfigurationPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    const accountCard = await screen.findByTestId('launcher-config-account-card')

    expect(accountCard.textContent).toContain(copy.diagnostics.premiumLifetime)
    expect(accountCard.textContent).not.toContain('Premium 到期：')
  })

  it('uses a distinct free-account presentation instead of premium chrome', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const validateNexusApiKey = vi.fn().mockResolvedValue({
      userName: 'FreePilot',
      avatarUrl: null,
      profileUrl: null,
      isPremium: false,
      dailyRemaining: 18742,
      hourlyRemaining: 500,
      dailyResetAt: null,
      hourlyResetAt: null,
    })

    renderConfigurationPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    const accountCard = await screen.findByTestId('launcher-config-account-card')
    const tierBadge = within(accountCard).getByText(copy.diagnostics.premiumFree)

    expect(tierBadge).toHaveClass('launcher-config-tier-badge-free')
    expect(tierBadge.querySelector('svg')).toBeNull()
    expect(accountCard.querySelector('.launcher-config-premium-badge')).toBeNull()
  })

  it('renders configuration route icons with service-specific color classes', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderConfigurationPage()

    const nexusPanel = screen.getByTestId('launcher-config-nexus')
    for (const routeId of ['publicGraphql', 'nexusImages', 'smapi', 'privateGraphql', 'nexusApi']) {
      expect(nexusPanel.querySelector(`.launcher-config-api-icon-${routeId}`)).toBeTruthy()
    }
  })

  it('reuses cached Nexus API key validation when re-entering configuration', async () => {
    writeCachedLauncherConfigurationApiKeyStatus(
      {
        status: {
          userName: 'CachedPilot',
          avatarUrl: null,
          profileUrl: null,
          isPremium: true,
          dailyRemaining: 321,
          hourlyRemaining: 123,
          dailyResetAt: null,
          hourlyResetAt: null,
        },
        error: null,
      },
      {
        apiKeySignature: 'api-key',
      },
    )
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const validateNexusApiKey = vi.fn().mockRejectedValue(new Error('should not validate on cached entry'))

    renderConfigurationPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    expect(await screen.findByText('CachedPilot')).toBeTruthy()
    expect(validateNexusApiKey).not.toHaveBeenCalled()
    expect(screen.getByTestId('launcher-config-nexus').textContent).toContain('321')
    expect(screen.getByTestId('launcher-config-nexus').textContent).toContain('123')
  })

  it('does not round nearly full Nexus quota up to a misleading 100 percent label', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const validateNexusApiKey = vi.fn().mockResolvedValue({
      userName: 'PrecisePilot',
      avatarUrl: null,
      profileUrl: null,
      isPremium: true,
      dailyRemaining: 19_988,
      hourlyRemaining: 499,
      dailyResetAt: null,
      hourlyResetAt: null,
    })

    renderConfigurationPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    const nexusPanel = screen.getByTestId('launcher-config-nexus')
    await waitFor(() => {
      expect(nexusPanel.textContent).toContain('19,988')
    })
    expect(nexusPanel.textContent).toContain('99%')
    expect(nexusPanel.textContent).not.toContain('100%')
  })

  it('renders dynamic Nexus quota reset countdowns from API reset timestamps', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const nowSeconds = Math.floor(Date.now() / 1000)
    const validateNexusApiKey = vi.fn().mockResolvedValue({
      userName: 'ResetPilot',
      avatarUrl: null,
      profileUrl: null,
      isPremium: true,
      dailyRemaining: 19_988,
      hourlyRemaining: 499,
      dailyResetAt: nowSeconds + 2 * 60 * 60 + 30 * 60,
      hourlyResetAt: nowSeconds + 45 * 60,
    })

    renderConfigurationPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    const nexusPanel = screen.getByTestId('launcher-config-nexus')
    await waitFor(() => {
      expect(nexusPanel.textContent).toContain('距重置')
    })
    expect(nexusPanel.textContent?.match(/距重置/g)).toHaveLength(2)
    expect(nexusPanel.textContent).not.toContain('00:00 GMT')
  })

  it('falls back to the next reset window when Nexus does not return reset timestamps', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const validateNexusApiKey = vi.fn().mockResolvedValue({
      userName: 'FallbackResetPilot',
      avatarUrl: null,
      profileUrl: null,
      isPremium: true,
      dailyRemaining: 19_988,
      hourlyRemaining: 499,
      dailyResetAt: null,
      hourlyResetAt: null,
    })

    renderConfigurationPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    const nexusPanel = screen.getByTestId('launcher-config-nexus')
    await waitFor(() => {
      expect(nexusPanel.textContent).toContain('距重置')
    })
    expect(nexusPanel.textContent?.match(/距重置/g)).toHaveLength(2)
    expect(nexusPanel.textContent).not.toContain('00:00 GMT')
  })

  it('renders the header as a compact launcher context bar', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const scanLibrary = vi.fn().mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: Array.from({ length: 142 }, (_, index) => ({ id: String(index) })),
    })
    const loadRuntimeInfo = vi.fn().mockResolvedValue({
      gameVersion: '1.6.8',
      smapiVersion: '4.0.8',
    })

    renderConfigurationPage(undefined, createMockLauncherPort({ scanLibrary, loadRuntimeInfo } as Partial<LauncherPort>))

    expect(screen.queryByTestId('launcher-config-score-value')).toBeNull()
    expect(document.querySelector('.launcher-config-score-ring')).toBeNull()
    expect(screen.getByText(copy.settings.configurationBreadcrumb)).toBeTruthy()
    expect(await screen.findByText(copy.settings.configurationGameVersionTag('1.6.8'))).toBeTruthy()
    expect(screen.getByText(copy.settings.configurationSmapiVersionTag('4.0.8'))).toBeTruthy()
    expect(screen.getByText(copy.settings.configurationInstalledMods(142), { exact: false })).toBeTruthy()
    expect(screen.getByTestId('launcher-config-paths-step').querySelector('.launcher-config-step-mark')).toBeTruthy()
  })

  it('derives the configuration summary from the provided launcher settings and diagnostics', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
      ],
    })
    const settingsState = createSettingsState(
      createSettings({
        modsPath: null,
        downloadPath: null,
        nexusApiKey: null,
        autoCheckModUpdates: false,
        autoInstallDownloads: false,
        keepDownloadedArchives: true,
      }),
    )

    renderConfigurationPage({ settingsState: settingsState as never })

    expect(screen.getByTestId('launcher-config-paths-step').textContent).toContain('1 / 3')
    expect(screen.getByTestId('launcher-config-nexus-step')).toHaveClass('launcher-config-step-danger')
    expect(screen.getByTestId('launcher-config-download-defaults').textContent).toContain(copy.toggles.autoCheckModUpdates)
    expect(screen.getByText(copy.settings.configurationNeedsReview, { exact: false })).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByTestId('launcher-config-diagnostics-step')).toHaveClass('launcher-config-step-warn')
    })
    const nexusPanel = screen.getByTestId('launcher-config-nexus')
    expect(nexusPanel.textContent).toContain(copy.settings.nexusApiGraphql)
    expect(nexusPanel.textContent).toContain(copy.settings.nexusApiSlow)
  })

  it('uses cached configuration diagnostics when all cached routes are healthy', async () => {
    const cachedDiagnostics = {
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'success' as const,
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
        {
          routeId: 'nexusImages',
          label: 'Nexus Image CDN',
          endpoint: 'https://staticdelivery.nexusmods.com/',
          status: 'success' as const,
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    }
    writeCachedLauncherConfigurationDiagnostics(cachedDiagnostics, {
      apiKeySignature: 'api-key',
    })
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())

    renderConfigurationPage()

    expect(await screen.findByText(copy.settings.nexusApiGraphql)).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.settings.nexusApiGraphql, level: 3 }).closest('.launcher-config-api-row')).toHaveClass(
      'launcher-config-api-row-ok',
    )
    expect(loadLauncherNexusDiagnostics).not.toHaveBeenCalled()
    expect(restartLauncherNexusDiagnostics).not.toHaveBeenCalled()
  })

  it('reuses cached configuration summary data when re-entering configuration', async () => {
    writeCachedLauncherConfigurationLibraryScan(
      {
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
        mods: Array.from({ length: 9 }, (_, index) => createLibraryMod({ id: `cached-mod-${index}` })),
      },
      {
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      },
    )
    writeCachedLauncherConfigurationRuntimeInfo(
      {
        gameVersion: '1.6.9',
        smapiVersion: '4.1.0',
      },
      {
        gamePath: 'E:\\Games\\Stardew Valley',
      },
    )
    writeCachedLauncherConfigurationSsoStatus({
      status: 'authorized',
      errorKind: null,
      errorMessage: null,
      userName: 'CachedSso',
      isPremium: true,
      ssoId: 'cached-sso-id',
    })
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const scanLibrary = vi.fn().mockRejectedValue(new Error('should not scan on cached entry'))
    const loadRuntimeInfo = vi.fn().mockRejectedValue(new Error('should not load runtime on cached entry'))
    const getNexusSsoStatus = vi.fn().mockRejectedValue(new Error('should not load sso on cached entry'))

    renderConfigurationPage(
      undefined,
      createMockLauncherPort({
        scanLibrary,
        loadRuntimeInfo,
        getNexusSsoStatus,
      } as Partial<LauncherPort>),
    )

    expect(screen.getByText(copy.settings.configurationGameVersionTag('1.6.9'))).toBeTruthy()
    expect(screen.getByText(copy.settings.configurationSmapiVersionTag('4.1.0'))).toBeTruthy()
    expect(screen.getByText(copy.settings.configurationInstalledMods(9), { exact: false })).toBeTruthy()
    expect(scanLibrary).not.toHaveBeenCalled()
    expect(loadRuntimeInfo).not.toHaveBeenCalled()
    expect(getNexusSsoStatus).not.toHaveBeenCalled()
  })

  it('refreshes configuration diagnostics when a cached non-API route previously failed', async () => {
    writeCachedLauncherConfigurationDiagnostics(
      {
        routes: [
          {
            routeId: 'nexusImages',
            label: 'Nexus Image CDN',
            endpoint: 'https://staticdelivery.nexusmods.com/',
            status: 'warning' as const,
            attempts: 3,
            maxAttempts: 3,
            available: false,
            message: 'Failed after 3 attempts: timeout',
          },
        ],
      },
      {
        apiKeySignature: 'api-key',
      },
    )
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'nexusImages',
          label: 'Nexus Image CDN',
          endpoint: 'https://staticdelivery.nexusmods.com/',
          status: 'success' as const,
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })

    renderConfigurationPage()

    await waitFor(() => {
      expect(loadLauncherNexusDiagnostics).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: copy.settings.nexusApiImageCdn, level: 3 }).closest('.launcher-config-api-row'),
      ).toHaveClass('launcher-config-api-row-ok')
    })
  })

  it('renders Nexus REST status and API key data in the design-matched Nexus panel above More tools', async () => {
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
      avatarUrl: null,
      profileUrl: null,
      isPremium: false,
      dailyRemaining: 42,
      hourlyRemaining: 24,
      dailyResetAt: null,
      hourlyResetAt: null,
    })

    renderConfigurationPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    const nexusHeading = screen.getByRole('heading', { name: copy.settings.nexusAccessTitle, level: 2 })
    const apiHeading = await screen.findByRole('heading', { name: copy.settings.nexusApiRest, level: 3 })
    const moreButton = screen.getByRole('button', { name: copy.configuration.moreToolsAction })
    const apiRouteRow = apiHeading.closest('.launcher-config-api-row')
    const nexusPanel = screen.getByTestId('launcher-config-nexus')
    const accountCard = screen.getByTestId('launcher-config-account-card')

    expect(Boolean(nexusHeading.compareDocumentPosition(apiHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(Boolean(apiHeading.compareDocumentPosition(moreButton) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    await waitFor(() => {
      expect(accountCard.textContent).toContain('ApiPilot')
      expect(nexusPanel.textContent).toContain('42')
      expect(nexusPanel.textContent).toContain('24')
    })
    expect(apiRouteRow).toHaveClass('launcher-config-api-row-ok')
    expect(apiRouteRow).toHaveClass('loading-motion-child-reveal')
    expect(apiRouteRow?.textContent).toContain(copy.settings.nexusApiAvailable)
    expect(nexusPanel.textContent).not.toContain(copy.settings.nexusApiSsoMethod)
    expect(screen.queryByRole('heading', { name: copy.diagnostics.apiKeyTitle, level: 3 })).toBeNull()
    expect(validateNexusApiKey).toHaveBeenCalled()
  })

  it('keeps all Nexus route rows visible while diagnostics are still loading', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())

    renderConfigurationPage()

    const nexusPanel = screen.getByTestId('launcher-config-nexus')
    expect(nexusPanel.querySelectorAll('.launcher-config-api-row')).toHaveLength(5)
    expect(screen.getByRole('heading', { name: copy.settings.nexusApiRest, level: 3 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.settings.nexusApiGraphql, level: 3 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.settings.nexusApiImageCdn, level: 3 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'SMAPI', level: 3 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Nexus Private GraphQL', level: 3 })).toBeTruthy()
  })

  it('adds a left-to-right resolution sweep when a route finishes probing', async () => {
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

    renderConfigurationPage()

    const apiRouteRow = await screen.findByRole('heading', { name: copy.settings.nexusApiRest, level: 3 })
    expect(apiRouteRow.closest('.launcher-config-api-row')).toHaveClass('launcher-config-api-row-resolved')
    expect(apiRouteRow.closest('.launcher-config-api-row')).toHaveClass('launcher-config-api-row-ok')
  })

  it('clears the configured Nexus API key from the Nexus panel header', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const settingsState = createSettingsState()

    renderConfigurationPage({ settingsState: settingsState as never })

    fireEvent.click(screen.getByRole('button', { name: copy.settings.nexusClearApiKeyAction }))

    expect(settingsState.updateField).toHaveBeenCalledWith('nexusApiKey', null)
  })

  it('keeps SSO and diagnostics refresh in the Nexus panel header', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({ routes: [] })
    restartLauncherNexusDiagnostics.mockResolvedValue({ routes: [] })
    const startNexusSso = vi.fn().mockResolvedValue({ ssoId: 'test-sso-id', status: 'connecting' as const })
    const getNexusSsoStatus = vi.fn().mockResolvedValue({
      status: 'authorized' as const,
      errorKind: null,
      errorMessage: null,
      userName: 'SsoPilot',
      isPremium: true,
      ssoId: 'test-sso-id',
    })

    const settingsState = createSettingsState(createSettings({ nexusApiKey: null }))
    renderConfigurationPage({ settingsState: settingsState as never }, createMockLauncherPort({ startNexusSso, getNexusSsoStatus }))

    const nexusPanel = screen.getByRole('region', { name: copy.settings.nexusAccessTitle })
    fireEvent.click(screen.getByRole('button', { name: copy.settings.nexusSignInAction }))
    fireEvent.click(screen.getByRole('button', { name: copy.configuration.nexusDiagnosticsTitle }))

    await waitFor(() => {
      expect(startNexusSso).toHaveBeenCalled()
    })
    expect(nexusPanel.textContent).not.toContain(copy.configuration.forceOfflineEnableButton)
    expect(restartLauncherNexusDiagnostics).toHaveBeenCalled()
  })

  it('keeps the Nexus SSO action occupied while authorization is pending', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({ routes: [] })
    writeCachedLauncherConfigurationSsoStatus({
      status: 'idle',
      errorKind: null,
      errorMessage: null,
      userName: null,
      isPremium: false,
      ssoId: null,
    })
    const pendingStart = createDeferred<{ ssoId: string; status: 'connecting' }>()
    const startNexusSso = vi.fn().mockReturnValue(pendingStart.promise)

    const settingsState = createSettingsState(createSettings({ nexusApiKey: null }))
    renderConfigurationPage({ settingsState: settingsState as never }, createMockLauncherPort({ startNexusSso }))

    const signInButton = screen.getByRole('button', { name: copy.settings.nexusSignInAction })
    fireEvent.click(signInButton)

    expect(signInButton).toBeDisabled()
    expect(signInButton).toHaveAttribute('aria-busy', 'true')

    pendingStart.resolve({ ssoId: 'test-sso-id', status: 'connecting' })
    await waitFor(() => {
      expect(startNexusSso).toHaveBeenCalled()
    })
  })

  it('polls Nexus SSO until authorized and refreshes the saved credentials', async () => {
    vi.useFakeTimers()
    loadLauncherNexusDiagnostics.mockResolvedValue({ routes: [] })
    writeCachedLauncherConfigurationSsoStatus({
      status: 'idle',
      errorKind: null,
      errorMessage: null,
      userName: null,
      isPremium: false,
      ssoId: null,
    })
    const settingsState = createSettingsState(createSettings({ nexusApiKey: null }))
    const startNexusSso = vi.fn().mockResolvedValue({ ssoId: 'test-sso-id', status: 'connecting' as const })
    const getNexusSsoStatus = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'connecting' as const,
        errorKind: null,
        errorMessage: null,
        userName: null,
        isPremium: false,
        ssoId: 'test-sso-id',
      })
      .mockResolvedValueOnce({
        status: 'authorized' as const,
        errorKind: null,
        errorMessage: null,
        userName: 'SsoPilot',
        isPremium: true,
        ssoId: 'test-sso-id',
      })
    const validateNexusApiKey = vi.fn().mockResolvedValue({
      userName: 'SsoPilot',
      avatarUrl: null,
      profileUrl: null,
      isPremium: true,
      dailyRemaining: 950,
      hourlyRemaining: 450,
      dailyResetAt: null,
      hourlyResetAt: null,
    })

    renderConfigurationPage(
      { settingsState: settingsState as never },
      createMockLauncherPort({ startNexusSso, getNexusSsoStatus, validateNexusApiKey }),
    )

    await act(async () => {
      const signInButtons = screen.getAllByRole('button', { name: copy.settings.nexusSignInAction })
      fireEvent.click(signInButtons[signInButtons.length - 1]!)
      await Promise.resolve()
    })

    expect(getNexusSsoStatus).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await Promise.resolve()
    })

    expect(settingsState.refresh).toHaveBeenCalled()
    expect(validateNexusApiKey).toHaveBeenCalled()
  })

  it('restarts diagnostics asynchronously when the header refresh action is clicked', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    restartLauncherNexusDiagnostics.mockResolvedValue({ routes: [] })

    renderConfigurationPage()

    fireEvent.click(screen.getByRole('button', { name: copy.settings.configurationRunDiagnostics }))

    await waitFor(() => {
      expect(restartLauncherNexusDiagnostics).toHaveBeenCalled()
    })
  })

  it('keeps the NexusMods BBCode renderer tucked inside the hidden debug menu until expanded', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())

    renderConfigurationPage()

    expect(screen.queryByTestId('launcher-debug-bbcode-preview')).toBeNull()
    expandDebugTools()
    expect(screen.getByRole('heading', { name: copy.configuration.bbcodePreviewTitle, level: 2 })).toBeTruthy()
    expect(screen.queryByTestId('launcher-debug-bbcode-preview')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: copy.configuration.bbcodePreviewExpandAction }))

    const preview = await screen.findByTestId('launcher-debug-bbcode-preview')
    expect(preview.textContent).toContain('Stardew Valley Expanded')
    expect(preview.textContent).toContain('I aim to give you, the player')
    expect(preview.textContent).toContain('Starting a new save file is required')
    expect(preview.textContent).toContain('Please read the Installation Guide on GitHub!')
    expect(preview.textContent).toContain('Stardew Valley Expanded Discord Server')
    expect(preview.textContent).not.toContain('<br')
    expect(preview.textContent).not.toContain('[size=')
    expect(preview.textContent).not.toContain('[color=')
    expect(preview.textContent).not.toContain('[img width=')
    expect(preview.querySelector('.nexusmods-bbcode-align-center')).toBeTruthy()
    expect(preview.querySelector('img')).toBeTruthy()
  })

  it('explains each Nexus route responsibility and keeps raw API error details visible in the Nexus panel', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })
    const validateNexusApiKey = vi.fn().mockRejectedValue(new Error('HTTP 503: upstream unavailable'))

    renderConfigurationPage(undefined, createMockLauncherPort({ validateNexusApiKey }))

    expect(await screen.findByText(copy.settings.nexusApiGraphql)).toBeTruthy()
    expect(screen.getByText('浏览目录、搜索和公开详情查询')).toBeTruthy()
    expect(await screen.findByText('Log: HTTP 503: upstream unavailable')).toBeTruthy()
    expect(screen.getByTestId('launcher-config-account-card').textContent).toContain(copy.diagnostics.premiumFree.toUpperCase())
    expect(screen.queryByRole('button', { name: copy.settings.nexusSignInAction })).toBeNull()
  })

  it('renders every diagnostics route in the design-matched Nexus route list', async () => {
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
        {
          routeId: 'privateGraphql',
          label: 'Nexus Private GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
        {
          routeId: 'smapi',
          label: 'SMAPI metadata',
          endpoint: 'https://smapi.io/api/v3.0/mods',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
      ],
    })

    renderConfigurationPage()

    expect(await screen.findByRole('heading', { name: copy.settings.nexusApiRest, level: 3 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Nexus Private GraphQL', level: 3 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'SMAPI metadata', level: 3 })).toBeTruthy()
    expect(screen.getByText(copy.configuration.nexusDiagnosticsRouteResponsibilities.privateGraphql)).toBeTruthy()
    expect(screen.getByText(copy.configuration.nexusDiagnosticsRouteResponsibilities.smapi)).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.settings.nexusApiImageCdn, level: 3 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.settings.nexusApiGraphql, level: 3 }).closest('.launcher-config-api-row')).toHaveClass(
      'launcher-config-api-row-loading',
    )
    expect(screen.getByRole('heading', { name: copy.settings.nexusApiImageCdn, level: 3 }).closest('.launcher-config-api-row')).toHaveClass(
      'launcher-config-api-row-loading',
    )
    expect(screen.getByRole('heading', { name: copy.settings.nexusApiRest, level: 3 }).closest('.launcher-config-api-row')).toHaveClass(
      'launcher-config-api-row-ok',
    )
    expect(screen.getByTestId('launcher-config-nexus').querySelectorAll('.launcher-config-api-row')).toHaveLength(5)
  })

  it('does not mark the Nexus REST row as success when API validation still failed after SSO', async () => {
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

    renderConfigurationPage(undefined, port)

    expect(await screen.findByText('Log: network timeout')).toBeTruthy()

    const apiRouteRow = screen.getByRole('heading', { name: copy.settings.nexusApiRest, level: 3 }).closest('.launcher-config-api-row')
    const privateGraphqlRouteRow = screen
      .getByRole('heading', { name: 'Nexus Private GraphQL', level: 3 })
      .closest('.launcher-config-api-row')
    expect(apiRouteRow).not.toHaveClass('launcher-config-api-row-ok')
    expect(apiRouteRow).toHaveClass('launcher-config-api-row-danger')
    expect(privateGraphqlRouteRow).not.toHaveClass('launcher-config-api-row-loading')
    expect(privateGraphqlRouteRow).toHaveClass('launcher-config-api-row-danger')
  })

  it('keeps debug utilities collapsed until more is requested', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const { container } = renderConfigurationPage()

    expect(screen.queryByRole('heading', { name: copy.configuration.notificationsTitle, level: 2 })).toBeNull()
    expect(screen.queryByRole('heading', { name: copy.configuration.nexusDiagnosticsTitle, level: 2 })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.configuration.forceOfflineEnableButton })).toBeNull()
    expect(screen.getByRole('button', { name: copy.configuration.nexusDiagnosticsTitle })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.settings.nexusApiRest, level: 3 })).toBeTruthy()
    expect(screen.queryByText('Nexus Public GraphQL')).toBeNull()

    const moreButton = screen.getByRole('button', { name: copy.configuration.moreToolsAction })
    expect(moreButton.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(moreButton)

    expect(screen.getByRole('button', { name: copy.configuration.lessToolsAction }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByRole('heading', { name: copy.configuration.nexusDiagnosticsTitle, level: 2 })).toBeNull()
    expect(screen.getByText(copy.configuration.notificationsOverviewTitle)).toBeTruthy()
    expect(screen.getByText(copy.configuration.logsOverviewTitle)).toBeTruthy()
    expect(container.querySelector('.launcher-debug-tool-card')).toBeTruthy()
    expect(container.querySelectorAll('.launcher-debug-stat-card')).toHaveLength(2)
    expect(container.querySelector('.launcher-debug-overview-divider')).toBeNull()
    expect(screen.getByRole('heading', { name: copy.configuration.forceOfflineEnableButton, level: 2 })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.configuration.forceOfflineEnableButton })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.configuration.forceNonPremiumEnableButton, level: 2 })).toBeTruthy()
    expect(screen.getByRole('switch', { name: copy.configuration.forceNonPremiumEnableButton })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.configuration.notificationsTitle, level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.configuration.logsTitle, level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.configuration.simulationTitle, level: 2 })).toBeTruthy()
  })

  it('renders expanded debug utility icons with tool-specific color classes', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const { container } = renderConfigurationPage()

    expandDebugTools()

    for (const iconClassName of [
      'launcher-debug-icon-debug-mode',
      'launcher-debug-icon-offline',
      'launcher-debug-icon-account',
      'launcher-debug-icon-notifications',
      'launcher-debug-icon-logs',
      'launcher-debug-icon-cache',
      'launcher-debug-icon-code',
      'launcher-debug-icon-download',
    ]) {
      expect(container.querySelector(`.${iconClassName}`)).toBeTruthy()
    }
  })

  it('groups expanded debug utilities into state, feedback, and module sections', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderConfigurationPage()

    expandDebugTools()

    expect(screen.getByText(copy.configuration.debugToolsStateGroupTitle)).toHaveClass('launcher-debug-section-title')
    expect(screen.getByText(copy.configuration.debugToolsFeedbackGroupTitle)).toHaveClass('launcher-debug-section-title')
    expect(screen.getByText(copy.configuration.debugToolsModulesGroupTitle)).toHaveClass('launcher-debug-section-title')
  })

  it('uses switches for state toggles in expanded debug utilities', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderConfigurationPage()

    expandDebugTools()

    expect(screen.getByRole('switch', { name: copy.configuration.debugOnlyTitle })).toBeTruthy()
    expect(screen.getByRole('switch', { name: copy.configuration.forceNonPremiumEnableButton })).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.configuration.forceNonPremiumEnableButton })).toBeNull()
  })

  it('keeps notification and log test actions in the right-side action layout', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderConfigurationPage()

    expandDebugTools()

    const notificationCard = screen
      .getByRole('heading', { name: copy.configuration.notificationsTitle, level: 2 })
      .closest('.launcher-debug-tool-card')
    const logCard = screen.getByRole('heading', { name: copy.configuration.logsTitle, level: 2 }).closest('.launcher-debug-tool-card')

    expect(notificationCard?.querySelector('.launcher-debug-tool-header-actions')).toContainElement(
      screen.getByRole('button', { name: copy.configuration.notificationButtons.debug }),
    )
    expect(notificationCard?.querySelector('.launcher-debug-tool-tray')).toBeNull()
    expect(logCard?.querySelector('.launcher-debug-tool-header-actions')).toContainElement(
      screen.getByRole('button', { name: copy.configuration.logButtons.debug }),
    )
    expect(logCard?.querySelector('.launcher-debug-tool-tray')).toBeNull()
  })

  it('places debug tool icons beside the title instead of the action controls', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderConfigurationPage()

    expandDebugTools()

    const notificationCard = screen
      .getByRole('heading', { name: copy.configuration.notificationsTitle, level: 2 })
      .closest('.launcher-debug-tool-card')

    expect(notificationCard?.querySelector('.launcher-debug-tool-copy .launcher-debug-tool-badge')).toBeTruthy()
    expect(notificationCard?.querySelector('.launcher-debug-tool-header-side .launcher-debug-tool-badge')).toBeNull()
  })

  it('shows download simulation parameters as card copy instead of a right-side chip', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderConfigurationPage()

    expandDebugTools()

    const simulationCard = screen
      .getByRole('heading', { name: copy.configuration.simulationTitle, level: 2 })
      .closest('.launcher-debug-tool-card')

    expect(simulationCard?.querySelector('.launcher-debug-tool-subtitle')?.textContent).toBe(copy.configuration.simulationParametersLabel)
    expect(simulationCard?.querySelector('.launcher-debug-tool-header-actions')).toContainElement(
      screen.getByRole('button', { name: copy.configuration.simulationButtonIdle }),
    )
    expect(simulationCard?.querySelector('.dock-chip')).toBeNull()
  })

  it('renders a debug mode switch and calls the toggle handler', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const onToggleDebugMode = vi.fn()

    renderConfigurationPage({ onToggleDebugMode })
    expandDebugTools()

    const toggle = screen.getByRole('switch', { name: copy.configuration.debugOnlyTitle })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)

    expect(onToggleDebugMode).toHaveBeenCalledTimes(1)
  })

  it('emits a debug notification test event', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderConfigurationPage()
    expandDebugTools()

    fireEvent.click(screen.getByRole('button', { name: copy.configuration.notificationButtons.debug }))

    expect(reportAppEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
        title: copy.configuration.notificationButtons.debug,
        debugDiagnosticsEnabled: true,
      }),
    )
  })

  it('emits a warning log test event without showing a notification', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderConfigurationPage()
    expandDebugTools()

    fireEvent.click(screen.getByRole('button', { name: copy.configuration.logButtons.warning }))

    expect(reportAppEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warning',
        title: copy.configuration.logButtons.warning,
        notify: false,
      }),
    )
  })

  it('starts a simulated launcher download from the configuration page', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderConfigurationPage()
    expandDebugTools()

    fireEvent.click(screen.getByRole('button', { name: copy.configuration.simulationButtonIdle }))

    expect(downloads.startDebugSimulation).toHaveBeenCalledTimes(1)
  })

  it('clears the launcher image cache from the configuration page', () => {
    clearLauncherImageCache.mockResolvedValue(undefined)
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())

    renderConfigurationPage()
    fireEvent.click(screen.getByRole('button', { name: copy.configuration.moreToolsAction }))

    fireEvent.click(screen.getByRole('button', { name: copy.configuration.clearImageCacheButton }))

    expect(clearLauncherImageCache).toHaveBeenCalledTimes(1)
  })

  it('uses the Nexus header refresh control while diagnostics are still pending', async () => {
    const pending = createDeferred<{ routes: never[] }>()
    loadLauncherNexusDiagnostics.mockReturnValue(pending.promise)
    restartLauncherNexusDiagnostics.mockResolvedValue({ routes: [] })

    renderConfigurationPage()

    fireEvent.click(screen.getByRole('button', { name: copy.configuration.nexusDiagnosticsTitle }))

    await waitFor(() => {
      expect(loadLauncherNexusDiagnostics).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(restartLauncherNexusDiagnostics).toHaveBeenCalled()
    })
  })

  it('renders warning and success statuses for Nexus diagnostics routes', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
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

    renderConfigurationPage()

    await waitFor(() => {
      expect(screen.getByText(copy.settings.nexusApiGraphql)).toBeTruthy()
    })
    const warningRouteRow = screen
      .getByRole('heading', { name: copy.settings.nexusApiGraphql, level: 3 })
      .closest('.launcher-config-api-row')
    const successRouteRow = screen
      .getByRole('heading', { name: copy.settings.nexusApiImageCdn, level: 3 })
      .closest('.launcher-config-api-row')

    expect(warningRouteRow).toHaveClass('launcher-config-api-row-warn')
    expect(successRouteRow).toHaveClass('launcher-config-api-row-ok')
    expect(warningRouteRow?.textContent).toContain(copy.settings.nexusApiSlow)
    expect(successRouteRow?.textContent).toContain(copy.settings.nexusApiAvailable)
  })

  it('refreshes Nexus diagnostics from the header control without opening the debug drawer', async () => {
    const diagnosticResult = {
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
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
    }
    loadLauncherNexusDiagnostics.mockResolvedValue(diagnosticResult)
    restartLauncherNexusDiagnostics.mockResolvedValue({ routes: [] })
    const onDiagnosticsUpdate = vi.fn()

    renderWithLocale(
      <LauncherTestWrapper port={createMockLauncherPort()}>
        <LauncherConfigurationPage
          debugEnabled={true}
          onToggleDebugMode={vi.fn()}
          onLauncherDiagnosticsUpdate={onDiagnosticsUpdate}
          downloads={downloads as never}
          settingsState={createSettingsState() as never}
        />
      </LauncherTestWrapper>,
      'zh-CN',
    )

    fireEvent.click(screen.getByRole('button', { name: copy.configuration.nexusDiagnosticsTitle }))

    await waitFor(() => {
      expect(loadLauncherNexusDiagnostics).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(restartLauncherNexusDiagnostics).toHaveBeenCalled()
    })
    expect(retryLauncherNexusDiagnosticsRoute).not.toHaveBeenCalled()
    expect(screen.getByText(copy.settings.nexusApiImageCdn)).toBeTruthy()
    expect(onDiagnosticsUpdate).toHaveBeenCalledWith({ routes: [] })
  })

  it('renders route status labels directly in the pill without an extra clipping wrapper', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
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

    renderConfigurationPage()

    const warningRouteRow = (await screen.findByRole('heading', { name: copy.settings.nexusApiGraphql, level: 3 })).closest(
      '.launcher-config-api-row',
    )
    const successRouteRow = screen
      .getByRole('heading', { name: copy.settings.nexusApiImageCdn, level: 3 })
      .closest('.launcher-config-api-row')
    const warningLabel = warningRouteRow?.querySelector('.launcher-config-status-tag-warn')
    const successLabel = successRouteRow?.querySelector('.launcher-config-status-tag-ok')

    expect(warningLabel?.className).toContain('launcher-config-status-tag-warn')
    expect(successLabel?.className).toContain('launcher-config-status-tag-ok')
    expect(warningLabel?.querySelector('.launcher-debug-route-status-copy')).toBeNull()
    expect(successLabel?.querySelector('.launcher-debug-route-status-copy')).toBeNull()
  })

  it('renders Nexus routes in design-matched API rows inside the Nexus panel', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })

    renderConfigurationPage()

    const nexusSection = screen.getByRole('region', { name: copy.settings.nexusAccessTitle })
    const routeTitle = await screen.findByRole('heading', { name: copy.settings.nexusApiGraphql, level: 3 })
    const routeRow = routeTitle.closest('.launcher-config-api-row')

    expect(nexusSection).toHaveClass('launcher-config-nexus')
    expect(routeRow).toBeTruthy()
    expect(routeRow?.querySelector('.launcher-config-api-name')).toBeTruthy()
    expect(routeRow?.querySelector('.launcher-config-api-desc')).toBeTruthy()
    expect(routeRow?.querySelector('.launcher-config-status-tag')).toBeTruthy()
    expect(routeRow?.querySelector('.launcher-debug-route-detail-row')).toBeNull()
    expect(routeRow?.querySelector('.launcher-debug-route-chip')).toBeNull()
  })

  it('groups route status labels with their result details instead of a separate table column', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })

    renderConfigurationPage()

    const routeTitle = await screen.findByRole('heading', { name: copy.settings.nexusApiGraphql, level: 3 })
    const routeRow = routeTitle.closest('.launcher-config-api-row')

    expect(routeRow?.querySelector('.launcher-config-status-tag-ok')?.textContent).toBe(copy.settings.nexusApiAvailable)
    expect(routeRow?.querySelector('.launcher-config-api-desc')?.textContent).toContain('浏览目录')
    expect(routeRow?.querySelector(':scope > .launcher-debug-route-status')).toBeNull()
  })

  it('persists and applies the launcher force-offline override from the configuration page', async () => {
    loadLauncherNexusDiagnostics.mockResolvedValue({ routes: [] })
    setLauncherNexusForceOffline.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Forced offline by debug override.',
        },
      ],
    })
    applyAppUiStatePatch.mockResolvedValue(undefined)

    renderConfigurationPage()

    expandDebugTools()
    fireEvent.click(await screen.findByRole('button', { name: copy.configuration.forceOfflineEnableButton }))

    await waitFor(() => {
      expect(applyAppUiStatePatch).toHaveBeenCalledWith({
        launcher: {
          forceOffline: true,
        },
      })
      expect(setLauncherNexusForceOffline).toHaveBeenCalledWith(true)
    })
    await waitFor(() => {
      expect(screen.getByTestId('launcher-config-diagnostics-step')).toHaveClass('launcher-config-step-warn')
    })
    expect(screen.getByRole('heading', { name: copy.settings.nexusApiGraphql, level: 3 }).closest('.launcher-config-api-row')).toHaveClass(
      'launcher-config-api-row-warn',
    )
  })

  it('persists the force non-Premium override and refreshes the account as a free user', async () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const validateNexusApiKey = vi.fn().mockResolvedValue({
      userName: 'PremiumTester',
      avatarUrl: null,
      profileUrl: null,
      isPremium: true,
      dailyRemaining: 12_000,
      hourlyRemaining: 450,
      dailyResetAt: null,
      hourlyResetAt: null,
    })
    applyAppUiStatePatch.mockResolvedValue(undefined)

    renderConfigurationPage(undefined, createMockLauncherPort({ validateNexusApiKey }))
    expandDebugTools()
    fireEvent.click(await screen.findByRole('switch', { name: copy.configuration.forceNonPremiumEnableButton }))

    await waitFor(() => {
      expect(applyAppUiStatePatch).toHaveBeenCalledWith({
        launcher: {
          forceNonPremium: true,
        },
      })
    })
    await waitFor(() => {
      expect(screen.getByText(copy.diagnostics.premiumFree)).toBeTruthy()
    })
  })
})
