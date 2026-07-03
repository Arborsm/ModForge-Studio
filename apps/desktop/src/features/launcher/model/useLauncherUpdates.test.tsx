import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@locales/localeContext'
import { NotificationProvider, clearNotifications } from '@shared/ui/notifications'
import type { LauncherNexusDiagnosticsResult, LauncherSettings, LauncherUpdateSummary, LauncherUpdatesResult } from '@features/launcher/api'
import { useLauncherUpdates } from '@features/launcher'
import { LauncherTestWrapper } from '@test/launcherTestWrapper'
import { createMockLauncherPort } from '@test/launcherTestPort'
import type { LauncherPort } from './launcherPort'

let launcherPort: LauncherPort

function Wrapper({ children }: PropsWithChildren) {
  return (
    <LauncherTestWrapper port={launcherPort}>
      <LocaleProvider locale="zh-CN">
        <NotificationProvider>{children}</NotificationProvider>
      </LocaleProvider>
    </LauncherTestWrapper>
  )
}

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: null,
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    downloadPath: null,
    nexusApiKey: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
    ...overrides,
  } as LauncherSettings
}

function createUpdate(overrides: Partial<LauncherUpdateSummary> = {}): LauncherUpdateSummary {
  return {
    modId: 101,
    name: 'NPC Adventures',
    currentVersion: '1.0.0',
    latestVersion: '1.2.0',
    absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: null,
    ...overrides,
  }
}

function createResult(updates: LauncherUpdateSummary[], overrides: Partial<LauncherUpdatesResult> = {}): LauncherUpdatesResult {
  return {
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    checkedAtMs: 123,
    updates,
    ...overrides,
  }
}

function createLauncherDiagnosticsResult(
  overrides: Partial<Record<string, { status: 'loading' | 'warning' | 'success'; available: boolean; message: string }>> = {},
): LauncherNexusDiagnosticsResult {
  const defaults: Record<
    string,
    { label: string; endpoint: string; status: 'loading' | 'warning' | 'success'; available: boolean; message: string }
  > = {
    publicGraphql: {
      label: 'Nexus Public GraphQL',
      endpoint: 'https://api.nexusmods.com/v2/graphql',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
    nexusImages: {
      label: 'Nexus Image CDN',
      endpoint: 'https://staticdelivery.nexusmods.com/',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
    smapi: {
      label: 'SMAPI',
      endpoint: 'https://smapi.io/api/v3.0/mods',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
  }

  return {
    routes: Object.entries(defaults).map(([routeId, route]) => ({
      routeId,
      attempts: 1,
      maxAttempts: 3,
      ...route,
      ...overrides[routeId],
    })),
  }
}

describe('useLauncherUpdates', () => {
  beforeEach(() => {
    launcherPort = createMockLauncherPort({
      checkUpdates: vi.fn(),
      loadCachedUpdates: vi.fn().mockResolvedValue(null),
      loadNexusDiagnostics: vi.fn().mockResolvedValue(createLauncherDiagnosticsResult()),
      subscribeUpdates: vi.fn().mockReturnValue(() => {}),
    })
  })

  afterEach(() => {
    cleanup()
    clearNotifications()
    vi.clearAllMocks()
  })

  it('uses force refresh only for manual refreshes', async () => {
    vi.mocked(launcherPort.checkUpdates)
      .mockResolvedValueOnce(createResult([createUpdate()]))
      .mockResolvedValueOnce(createResult([createUpdate({ latestVersion: '1.3.0' })]))

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(launcherPort.checkUpdates).toHaveBeenCalledTimes(1)
    })

    expect(launcherPort.checkUpdates).toHaveBeenNthCalledWith(1, {
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(launcherPort.checkUpdates).toHaveBeenNthCalledWith(2, {
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: true,
    })
  })

  it('uses cached updates on mount without starting a new check', async () => {
    vi.mocked(launcherPort.loadCachedUpdates).mockResolvedValueOnce(createResult([createUpdate({ latestVersion: '1.4.0' })]))

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })

    expect(launcherPort.loadCachedUpdates).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    })
    expect(launcherPort.checkUpdates).not.toHaveBeenCalled()
  })

  it('continues the background check when the cached updates snapshot is incomplete', async () => {
    const pending = new Promise<LauncherUpdatesResult>(() => {})
    vi.mocked(launcherPort.loadCachedUpdates).mockResolvedValueOnce(
      createResult([createUpdate({ latestVersion: '1.4.0' })], {
        isComplete: false,
      }),
    )
    vi.mocked(launcherPort.checkUpdates).mockReturnValueOnce(pending)

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.items).toEqual([
        createUpdate({
          latestVersion: '1.4.0',
        }),
      ])
    })

    await waitFor(() => {
      expect(launcherPort.checkUpdates).toHaveBeenCalledTimes(1)
    })

    expect(launcherPort.checkUpdates).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
  })

  it('applies partial update results from the shared subscription before the final check resolves', async () => {
    let subscriptionListener: ((result: LauncherUpdatesResult) => void) | null = null
    const pending = new Promise<LauncherUpdatesResult>(() => {})

    vi.mocked(launcherPort.subscribeUpdates).mockImplementation((_modsPath, listener) => {
      subscriptionListener = listener
      return () => {}
    })
    vi.mocked(launcherPort.checkUpdates).mockReturnValueOnce(pending)

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(launcherPort.checkUpdates).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      subscriptionListener?.(
        createResult([
          createUpdate({
            latestVersion: '1.4.0',
          }),
        ]),
      )
    })

    expect(result.current.items).toEqual([
      createUpdate({
        latestVersion: '1.4.0',
      }),
    ])
  })

  it('selects newly added update items by default when the current list is fully selected', async () => {
    let subscriptionListener: ((result: LauncherUpdatesResult) => void) | null = null

    vi.mocked(launcherPort.loadCachedUpdates).mockResolvedValueOnce(createResult([createUpdate()]))
    vi.mocked(launcherPort.subscribeUpdates).mockImplementation((_modsPath, listener) => {
      subscriptionListener = listener
      return () => {}
    })

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.items).toEqual([createUpdate()])
    })

    const addedItem = createUpdate({
      modId: 102,
      name: 'Seasonal Portraits',
      absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Seasonal Portraits',
      modUrl: 'https://www.nexusmods.com/stardewvalley/mods/102',
    })

    await act(async () => {
      subscriptionListener?.(createResult([createUpdate(), addedItem]))
    })

    expect(result.current.items).toEqual([createUpdate(), addedItem])
    expect(result.current.selectedItems).toEqual([createUpdate(), addedItem])
    expect(result.current.selectedCount).toBe(2)
    expect(result.current.allSelected).toBe(true)
    expect(result.current.isSelected(addedItem)).toBe(true)
  })

  it('skips automatic update checks when all update routes are unavailable but still allows manual refresh', async () => {
    vi.mocked(launcherPort.loadNexusDiagnostics).mockResolvedValue(
      createLauncherDiagnosticsResult({
        publicGraphql: {
          status: 'warning',
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
        nexusImages: {
          status: 'warning',
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
        smapi: {
          status: 'warning',
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
      }),
    )
    vi.mocked(launcherPort.checkUpdates).mockResolvedValue(createResult([createUpdate()]))

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(launcherPort.loadNexusDiagnostics).toHaveBeenCalledTimes(1)
    })

    expect(launcherPort.checkUpdates).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.refresh()
    })

    expect(launcherPort.checkUpdates).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: true,
    })
  })

  it('skips automatic update checks when automatic update checking is disabled but still allows manual refresh', async () => {
    vi.mocked(launcherPort.checkUpdates).mockResolvedValue(createResult([createUpdate()]))

    const { result } = renderHook(() => useLauncherUpdates(createSettings({ autoCheckModUpdates: false })), { wrapper: Wrapper })

    await waitFor(() => {
      expect(launcherPort.subscribeUpdates).toHaveBeenCalledTimes(1)
    })

    expect(launcherPort.loadNexusDiagnostics).not.toHaveBeenCalled()
    expect(launcherPort.loadCachedUpdates).not.toHaveBeenCalled()
    expect(launcherPort.checkUpdates).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.refresh()
    })

    expect(launcherPort.checkUpdates).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: true,
    })
  })
})
