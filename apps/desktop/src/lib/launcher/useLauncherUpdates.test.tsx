import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../app/localeContext'
import { NotificationProvider, clearNotifications } from '../app/notifications'
import {
  checkLauncherUpdates,
  loadCachedLauncherUpdates,
  loadLauncherNexusDiagnostics,
  subscribeLauncherUpdates,
  type LauncherNexusDiagnosticsResult,
  type LauncherSettings,
  type LauncherUpdateSummary,
  type LauncherUpdatesResult,
} from '../desktop'
import { useLauncherUpdates } from './useLauncherUpdates'

vi.mock('../desktop', async () => {
  const actual = await vi.importActual<typeof import('../desktop')>('../desktop')
  return {
    ...actual,
    checkLauncherUpdates: vi.fn(),
    loadCachedLauncherUpdates: vi.fn(),
    loadLauncherNexusDiagnostics: vi.fn(),
    subscribeLauncherUpdates: vi.fn(),
  }
})

const checkLauncherUpdatesMock = vi.mocked(checkLauncherUpdates)
const loadCachedLauncherUpdatesMock = vi.mocked(loadCachedLauncherUpdates)
const loadLauncherNexusDiagnosticsMock = vi.mocked(loadLauncherNexusDiagnostics)
const subscribeLauncherUpdatesMock = vi.mocked(subscribeLauncherUpdates)

function Wrapper({ children }: PropsWithChildren) {
  return (
    <LocaleProvider locale="zh-CN">
      <NotificationProvider>{children}</NotificationProvider>
    </LocaleProvider>
  )
}

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: null,
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    downloadPath: null,
    nexusApiKey: null,
    nexusCookie: null,
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
      endpoint: 'https://api-router.nexusmods.com/graphql',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
    publicHtml: {
      label: 'Nexus Public HTML',
      endpoint: 'https://www.nexusmods.com/stardewvalley',
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
      ...(overrides[routeId] ?? {}),
    })),
  }
}

describe('useLauncherUpdates', () => {
  afterEach(() => {
    cleanup()
    clearNotifications()
    vi.clearAllMocks()
  })

  it('uses force refresh only for manual refreshes', async () => {
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(createLauncherDiagnosticsResult())
    loadCachedLauncherUpdatesMock.mockResolvedValueOnce(null)
    subscribeLauncherUpdatesMock.mockReturnValue(() => {})
    checkLauncherUpdatesMock
      .mockResolvedValueOnce(createResult([createUpdate()]))
      .mockResolvedValueOnce(createResult([createUpdate({ latestVersion: '1.3.0' })]))

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(checkLauncherUpdatesMock).toHaveBeenCalledTimes(1)
    })

    expect(checkLauncherUpdatesMock).toHaveBeenNthCalledWith(1, {
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(checkLauncherUpdatesMock).toHaveBeenNthCalledWith(2, {
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: true,
    })
  })

  it('uses cached updates on mount without starting a new check', async () => {
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(createLauncherDiagnosticsResult())
    loadCachedLauncherUpdatesMock.mockResolvedValueOnce(
      createResult([createUpdate({ latestVersion: '1.4.0' })]),
    )
    subscribeLauncherUpdatesMock.mockReturnValue(() => {})

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })

    expect(loadCachedLauncherUpdatesMock).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    })
    expect(checkLauncherUpdatesMock).not.toHaveBeenCalled()
  })

  it('continues the background check when the cached updates snapshot is incomplete', async () => {
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(createLauncherDiagnosticsResult())
    const pending = new Promise<LauncherUpdatesResult>(() => {})
    loadCachedLauncherUpdatesMock.mockResolvedValueOnce(
      createResult([createUpdate({ latestVersion: '1.4.0' })], {
        isComplete: false,
      }),
    )
    subscribeLauncherUpdatesMock.mockReturnValue(() => {})
    checkLauncherUpdatesMock.mockReturnValueOnce(pending)

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.items).toEqual([
        createUpdate({
          latestVersion: '1.4.0',
        }),
      ])
    })

    await waitFor(() => {
      expect(checkLauncherUpdatesMock).toHaveBeenCalledTimes(1)
    })

    expect(checkLauncherUpdatesMock).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
  })

  it('applies partial update results from the shared subscription before the final check resolves', async () => {
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(createLauncherDiagnosticsResult())
    let subscriptionListener: ((result: LauncherUpdatesResult) => void) | null = null
    const pending = new Promise<LauncherUpdatesResult>(() => {})

    loadCachedLauncherUpdatesMock.mockResolvedValueOnce(null)
    subscribeLauncherUpdatesMock.mockImplementation((_modsPath, listener) => {
      subscriptionListener = listener
      return () => {}
    })
    checkLauncherUpdatesMock.mockReturnValueOnce(pending)

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(checkLauncherUpdatesMock).toHaveBeenCalledTimes(1)
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
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(createLauncherDiagnosticsResult())
    let subscriptionListener: ((result: LauncherUpdatesResult) => void) | null = null

    loadCachedLauncherUpdatesMock.mockResolvedValueOnce(createResult([createUpdate()]))
    subscribeLauncherUpdatesMock.mockImplementation((_modsPath, listener) => {
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
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(
      createLauncherDiagnosticsResult({
        publicGraphql: {
          status: 'warning',
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
        publicHtml: {
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
    loadCachedLauncherUpdatesMock.mockResolvedValueOnce(null)
    subscribeLauncherUpdatesMock.mockReturnValue(() => {})
    checkLauncherUpdatesMock.mockResolvedValue(createResult([createUpdate()]))

    const { result } = renderHook(() => useLauncherUpdates(createSettings()), { wrapper: Wrapper })

    await waitFor(() => {
      expect(loadLauncherNexusDiagnosticsMock).toHaveBeenCalledTimes(1)
    })

    expect(checkLauncherUpdatesMock).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.refresh()
    })

    expect(checkLauncherUpdatesMock).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: true,
    })
  })

  it('skips automatic update checks when automatic update checking is disabled but still allows manual refresh', async () => {
    loadCachedLauncherUpdatesMock.mockResolvedValueOnce(null)
    subscribeLauncherUpdatesMock.mockReturnValue(() => {})
    checkLauncherUpdatesMock.mockResolvedValue(createResult([createUpdate()]))

    const { result } = renderHook(
      () => useLauncherUpdates(createSettings({ autoCheckModUpdates: false })),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(subscribeLauncherUpdatesMock).toHaveBeenCalledTimes(1)
    })

    expect(loadLauncherNexusDiagnosticsMock).not.toHaveBeenCalled()
    expect(loadCachedLauncherUpdatesMock).not.toHaveBeenCalled()
    expect(checkLauncherUpdatesMock).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.refresh()
    })

    expect(checkLauncherUpdatesMock).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: true,
    })
  })
})
