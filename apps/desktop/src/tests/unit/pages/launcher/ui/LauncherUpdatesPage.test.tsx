import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type {
  LauncherNexusDiagnosticsResult,
  LauncherRemoteModDetail,
  LauncherSettings,
  LauncherUpdateProgressPayload,
  LauncherUpdateSummary,
  LauncherUpdatesResult,
} from '@features/launcher/api'
import {
  checkLauncherUpdates,
  loadCachedLauncherUpdates,
  loadLauncherNexusDiagnostics,
  loadLauncherRemoteModDetail,
  subscribeLauncherUpdates,
} from '@features/launcher/api'
import { LocaleProvider } from '@locales/provider'
import { NotificationProvider, clearNotifications } from '@shared/ui/notifications'
import { LauncherTestWrapper } from '@test/launcherTestWrapper'
import { createMockLauncherPort } from '@test/launcherTestPort'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import { useLauncherUpdateProgressNotifications } from '@features/launcher'
import { LauncherUpdatesPage } from '@pages/launcher/ui/LauncherUpdatesPage'

const eventListeners = new Map<string, (event: { payload: unknown }) => void>()

vi.mock('@features/launcher/api', async () => {
  const actual = await vi.importActual<typeof import('@features/launcher/api')>('@features/launcher/api')
  return {
    ...actual,
    checkLauncherUpdates: vi.fn(),
    isLauncherRemoteModIdInvalid: vi.fn(() => false),
    loadCachedLauncherUpdates: vi.fn(),
    loadLauncherNexusDiagnostics: vi.fn(),
    loadLauncherRemoteModDetail: vi.fn(),
    listenToLauncherUpdateProgress: vi.fn(async (listener: (payload: unknown) => void) => {
      eventListeners.set('launcher://update-check-progress', (event: { payload: unknown }) => {
        listener(event.payload)
      })
      return () => {
        eventListeners.delete('launcher://update-check-progress')
      }
    }),
    openLauncherUrl: vi.fn(),
    subscribeLauncherUpdates: vi.fn(),
  }
})

vi.mock('@features/launcher', async () => {
  const actual = await vi.importActual<typeof import('@features/launcher')>('@features/launcher')
  return {
    ...actual,
    useLauncherImage: () => ({
      imageUrl: null,
      error: null,
      loading: false,
    }),
  }
})

const checkLauncherUpdatesMock = vi.mocked(checkLauncherUpdates)
const loadCachedLauncherUpdatesMock = vi.mocked(loadCachedLauncherUpdates)
const loadLauncherNexusDiagnosticsMock = vi.mocked(loadLauncherNexusDiagnostics)
const loadLauncherRemoteModDetailMock = vi.mocked(loadLauncherRemoteModDetail)
const subscribeLauncherUpdatesMock = vi.mocked(subscribeLauncherUpdates)
let launcherPort: LauncherPort

function UpdateProgressNotificationBridge() {
  useLauncherUpdateProgressNotifications()
  return null
}

function renderWithProviders(ui: ReactElement) {
  return render(
    <LauncherTestWrapper port={launcherPort}>
      <LocaleProvider locale="zh-CN">
        <NotificationProvider>
          <UpdateProgressNotificationBridge />
          {ui}
        </NotificationProvider>
      </LocaleProvider>
    </LauncherTestWrapper>,
  )
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
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
  }
}

function createUpdate(overrides: Partial<LauncherUpdateSummary> = {}): LauncherUpdateSummary {
  return {
    modId: 101,
    name: 'NPC Adventures',
    author: 'Pathoschild',
    currentVersion: '1.0.0',
    latestVersion: '1.2.0',
    absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: null,
    updatedAt: '2026-04-09T08:00:00.000Z',
    fileSize: 13_107_200,
    ...overrides,
  }
}

function createResult(updates: LauncherUpdateSummary[]): LauncherUpdatesResult {
  return {
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    checkedAtMs: 123,
    updates,
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

function createRemoteDetail(overrides: Partial<LauncherRemoteModDetail> = {}): LauncherRemoteModDetail {
  return {
    modId: 101,
    title: 'NPC Adventures',
    summary: 'Help villagers travel farther and react smarter.',
    author: 'Pathoschild',
    version: '1.2.0',
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/101/101-cover.png',
    galleryImages: ['https://staticdelivery.nexusmods.com/mods/1303/images/101/101-gallery-1.png'],
    updatedAt: '2026-04-09T08:00:00.000Z',
    fileSize: 13_107_200,
    ...overrides,
  }
}

describe('LauncherUpdatesPage', () => {
  afterEach(() => {
    cleanup()
    clearNotifications()
    eventListeners.clear()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  beforeEach(() => {
    checkLauncherUpdatesMock.mockReset()
    loadCachedLauncherUpdatesMock.mockReset()
    loadLauncherNexusDiagnosticsMock.mockReset()
    loadLauncherRemoteModDetailMock.mockReset()
    subscribeLauncherUpdatesMock.mockReset()
    loadCachedLauncherUpdatesMock.mockResolvedValue(null)
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(createLauncherDiagnosticsResult())
    subscribeLauncherUpdatesMock.mockReturnValue(() => {})
    launcherPort = createMockLauncherPort({
      checkUpdates: checkLauncherUpdatesMock,
      loadCachedUpdates: loadCachedLauncherUpdatesMock,
      loadNexusDiagnostics: loadLauncherNexusDiagnosticsMock,
      loadRemoteModDetail: loadLauncherRemoteModDetailMock,
      listenToUpdateProgress: vi.fn(async (listener: (payload: LauncherUpdateProgressPayload) => void) => {
        eventListeners.set('launcher://update-check-progress', (event: { payload: unknown }) => {
          listener(event.payload as LauncherUpdateProgressPayload)
        })
        return () => {
          eventListeners.delete('launcher://update-check-progress')
        }
      }),
      subscribeUpdates: subscribeLauncherUpdatesMock,
    })
  })

  it('opens the shared mod detail panel when clicking view details', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-12T08:00:00.000Z').getTime())

    checkLauncherUpdatesMock.mockResolvedValue(
      createResult([
        createUpdate(),
        createUpdate({
          modId: 202,
          name: 'Horse Overhaul',
          author: 'FlashShifter',
          latestVersion: '3.1.0',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Horse Overhaul',
          modUrl: 'https://www.nexusmods.com/stardewvalley/mods/202',
          updatedAt: '2026-04-11T08:00:00.000Z',
          fileSize: 2_097_152,
        }),
      ]),
    )
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteDetail())

    renderWithProviders(<LauncherUpdatesPage settings={createSettings()} onQueueDownload={vi.fn()} />)

    await screen.findByText('模组更新')

    expect(screen.getByText('(2个可用更新)')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新检查' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消全选' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '一键更新所有勾选项' })).toBeTruthy()
    expect(document.body.querySelector('.launcher-mod-detail-panel')).toBeNull()
    expect(loadLauncherRemoteModDetailMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: '查看详情' })[0]!)

    await waitFor(() => {
      expect(document.body.querySelector('.launcher-mod-detail-panel')).toBeTruthy()
    })
    expect(document.body.querySelector('[role="dialog"]')).toHaveAttribute('aria-label', 'NPC Adventures')
    await waitFor(() => {
      expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledWith({ modId: 101, includeFiles: false })
    })
  })

  it('shows diagnostics details when automatic update checks are blocked by unavailable routes', async () => {
    const onRetryDiagnostics = vi.fn().mockResolvedValue(undefined)
    const onNavigateToDiagnostics = vi.fn()
    loadLauncherNexusDiagnosticsMock
      .mockResolvedValueOnce(
        createLauncherDiagnosticsResult({
          publicGraphql: {
            status: 'warning',
            available: false,
            message: 'Forced offline by debug override.',
          },
          nexusImages: {
            status: 'warning',
            available: false,
            message: 'Forced offline by debug override.',
          },
          smapi: {
            status: 'warning',
            available: false,
            message: 'Forced offline by debug override.',
          },
        }),
      )
      .mockResolvedValue(createLauncherDiagnosticsResult())
    checkLauncherUpdatesMock.mockResolvedValue(createResult([]))

    const { container } = renderWithProviders(
      <LauncherUpdatesPage
        settings={createSettings()}
        onQueueDownload={vi.fn()}
        onRetryDiagnostics={onRetryDiagnostics}
        onNavigateToDiagnostics={onNavigateToDiagnostics}
      />,
    )

    await waitFor(() => {
      expect(loadLauncherNexusDiagnosticsMock).toHaveBeenCalledTimes(1)
    })

    expect(checkLauncherUpdatesMock).not.toHaveBeenCalled()
    expect(container.querySelector('.launcher-updates-content-blocked')).toBeTruthy()
    expect(container.querySelector('.launcher-blocked-state')).toBeTruthy()
    expect(await screen.findByText('自动更新检查已暂停')).toBeTruthy()
    expect(screen.getByText('更新通路连续失败后，后台自动检查会先暂停，避免反复发送同样会失败的请求。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新检查' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '前往通路诊断' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '复制日志' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '展开详情' }))
    await waitFor(() => {
      const details = container.querySelector('.launcher-blocked-pre')
      expect(details?.textContent ?? '').toContain('SMAPI: Forced offline by debug override.')
      expect(details?.textContent ?? '').toContain('Nexus Public GraphQL: Forced offline by debug override.')
    })

    fireEvent.click(screen.getByRole('button', { name: '前往通路诊断' }))
    fireEvent.click(screen.getByRole('button', { name: '重新检查' }))

    await waitFor(() => {
      expect(onNavigateToDiagnostics).toHaveBeenCalledTimes(1)
      expect(onRetryDiagnostics).toHaveBeenCalledTimes(1)
      expect(checkLauncherUpdatesMock).toHaveBeenCalledTimes(1)
      expect(checkLauncherUpdatesMock).toHaveBeenCalledWith({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
        forceRefresh: false,
      })
    })
  })

  it('renders a centered error card while keeping raw request details in notifications', async () => {
    const onNavigateToDiagnostics = vi.fn()
    const onRetryDiagnostics = vi.fn().mockResolvedValue(undefined)
    const rawError = 'Nexus Public GraphQL: timeout'
    checkLauncherUpdatesMock.mockRejectedValueOnce(new Error(rawError)).mockResolvedValueOnce(createResult([]))

    const { container } = renderWithProviders(
      <LauncherUpdatesPage
        settings={createSettings()}
        onQueueDownload={vi.fn()}
        onRetryDiagnostics={onRetryDiagnostics}
        onNavigateToDiagnostics={onNavigateToDiagnostics}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.launcher-updates-content-error')).toBeTruthy()
    })
    expect(container.querySelector('.launcher-blocked-state')).toBeTruthy()
    expect(screen.getByText('这次检查没有完成，请重试。详细原因已通过通知显示。')).toBeTruthy()
    const notificationToast = (await screen.findByText(rawError)).closest('.notification-toast')
    expect(notificationToast).toBeTruthy()
    expect(container.querySelector('.launcher-blocked-highlight')).toBeNull()
    expect(container.querySelector('.launcher-blocked-details')).toBeNull()
    expect(screen.queryByRole('button', { name: '查看详情' })).toBeNull()
    expect(screen.queryByRole('button', { name: '复制日志' })).toBeNull()
    expect(screen.getByRole('button', { name: '前往通路诊断' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新检查' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '前往通路诊断' }))
    fireEvent.click(screen.getByRole('button', { name: '重新检查' }))

    await waitFor(() => {
      expect(onNavigateToDiagnostics).toHaveBeenCalledTimes(1)
      expect(onRetryDiagnostics).toHaveBeenCalledTimes(1)
      expect(checkLauncherUpdatesMock).toHaveBeenCalledTimes(2)
    })
  })

  it('queues checked updates as one batch when updating all selected items', async () => {
    checkLauncherUpdatesMock.mockResolvedValue(
      createResult([
        createUpdate(),
        createUpdate({
          modId: 202,
          name: 'Horse Overhaul',
          latestVersion: '3.1.0',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Horse Overhaul',
          modUrl: 'https://www.nexusmods.com/stardewvalley/mods/202',
        }),
      ]),
    )
    const onQueueDownload = vi.fn()
    const onQueueDownloads = vi.fn()

    renderWithProviders(
      <LauncherUpdatesPage settings={createSettings()} onQueueDownload={onQueueDownload} onQueueDownloads={onQueueDownloads} />,
    )

    const firstCheckbox = await screen.findByRole('checkbox', { name: 'NPC Adventures' })
    const secondCheckbox = await screen.findByRole('checkbox', { name: 'Horse Overhaul' })

    expect(firstCheckbox).toHaveProperty('checked', true)
    expect(secondCheckbox).toHaveProperty('checked', true)

    fireEvent.click(secondCheckbox)
    expect(secondCheckbox).toHaveProperty('checked', false)

    fireEvent.click(screen.getByRole('button', { name: '一键更新所有勾选项' }))

    expect(onQueueDownload).not.toHaveBeenCalled()
    expect(onQueueDownloads).toHaveBeenCalledTimes(1)
    expect(onQueueDownloads).toHaveBeenCalledWith([
      {
        modId: 101,
        title: 'NPC Adventures',
        imageUrl: null,
        version: '1.2.0',
        source: 'updates',
      },
    ])
  })

  it('toggles between select all and clear selection from the console control', async () => {
    checkLauncherUpdatesMock.mockResolvedValue(
      createResult([
        createUpdate(),
        createUpdate({
          modId: 202,
          name: 'Horse Overhaul',
          latestVersion: '3.1.0',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Horse Overhaul',
          modUrl: 'https://www.nexusmods.com/stardewvalley/mods/202',
        }),
      ]),
    )

    renderWithProviders(<LauncherUpdatesPage settings={createSettings()} onQueueDownload={vi.fn()} />)

    const firstCheckbox = await screen.findByRole('checkbox', { name: 'NPC Adventures' })
    const secondCheckbox = await screen.findByRole('checkbox', { name: 'Horse Overhaul' })

    fireEvent.click(screen.getByRole('button', { name: '取消全选' }))
    expect(firstCheckbox).toHaveProperty('checked', false)
    expect(secondCheckbox).toHaveProperty('checked', false)

    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    expect(firstCheckbox).toHaveProperty('checked', true)
    expect(secondCheckbox).toHaveProperty('checked', true)
  })

  it('shows update-check progress in the global notification viewport', async () => {
    checkLauncherUpdatesMock.mockImplementation(() => new Promise(() => {}))

    const { container } = renderWithProviders(<LauncherUpdatesPage settings={createSettings()} onQueueDownload={vi.fn()} />)

    await act(async () => {
      eventListeners.get('launcher://update-check-progress')?.({
        payload: {
          modsPath: 'E:\\Games\\Stardew Valley\\Mods',
          checked: 2,
          total: 4,
          currentModName: 'Horse Overhaul',
        },
      })
    })

    expect(screen.getByText('检查模组更新')).toBeTruthy()
    expect(screen.getByText(/Horse Overhaul/)).toBeTruthy()
    expect(container.querySelector('.notification-toast-progress')?.getAttribute('style')).toContain('width: 50%')
  })

  it('keeps update progress notifications alive and updating after the page unmounts', async () => {
    checkLauncherUpdatesMock.mockImplementation(() => new Promise(() => {}))

    const { container, rerender } = render(
      <LauncherTestWrapper port={launcherPort}>
        <LocaleProvider locale="zh-CN">
          <NotificationProvider>
            <UpdateProgressNotificationBridge />
            <LauncherUpdatesPage settings={createSettings()} onQueueDownload={vi.fn()} />
          </NotificationProvider>
        </LocaleProvider>
      </LauncherTestWrapper>,
    )

    await waitFor(() => {
      expect(eventListeners.has('launcher://update-check-progress')).toBe(true)
    })

    await act(async () => {
      eventListeners.get('launcher://update-check-progress')?.({
        payload: {
          modsPath: 'E:\\Games\\Stardew Valley\\Mods',
          checked: 1,
          total: 4,
          currentModName: 'NPC Adventures',
        },
      })
      await Promise.resolve()
    })

    expect(screen.getByText(/NPC Adventures/)).toBeTruthy()

    rerender(
      <LauncherTestWrapper port={launcherPort}>
        <LocaleProvider locale="zh-CN">
          <NotificationProvider>
            <UpdateProgressNotificationBridge />
            <div>Another page</div>
          </NotificationProvider>
        </LocaleProvider>
      </LauncherTestWrapper>,
    )

    expect(screen.getByText('Another page')).toBeTruthy()
    expect(screen.getByText(/NPC Adventures/)).toBeTruthy()

    await act(async () => {
      eventListeners.get('launcher://update-check-progress')?.({
        payload: {
          modsPath: 'E:\\Games\\Stardew Valley\\Mods',
          checked: 3,
          total: 4,
          currentModName: 'Horse Overhaul',
        },
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByText(/NPC Adventures/)).toBeNull()
      expect(screen.getByText(/Horse Overhaul/)).toBeTruthy()
    })

    expect(container.querySelector('.notification-toast-progress')?.getAttribute('style')).toContain('width: 75%')
  })

  it('ignores trailing completed progress events after the update check promise already resolved', async () => {
    const pendingCheck = createDeferred<LauncherUpdatesResult>()
    checkLauncherUpdatesMock.mockImplementation(() => pendingCheck.promise)

    const { container } = renderWithProviders(<LauncherUpdatesPage settings={createSettings()} onQueueDownload={vi.fn()} />)

    await waitFor(() => {
      expect(checkLauncherUpdatesMock).toHaveBeenCalledTimes(1)
    })
    expect(container.querySelector('.notification-toast-progress')).toBeTruthy()

    await act(async () => {
      pendingCheck.resolve(createResult([createUpdate()]))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(container.querySelector('.notification-toast-progress')).toBeNull()
    })

    await act(async () => {
      eventListeners.get('launcher://update-check-progress')?.({
        payload: {
          modsPath: 'E:\\Games\\Stardew Valley\\Mods',
          checked: 140,
          total: 140,
          currentModName: 'NPC Adventures',
        },
      })
      await Promise.resolve()
    })

    expect(container.querySelector('.notification-toast-progress')).toBeNull()
  })
})
