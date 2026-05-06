import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherDebugPage } from './LauncherDebugPage'

const reportAppEvent = vi.fn()
const clearLauncherImageCache = vi.fn()
const loadLauncherNexusDiagnostics = vi.fn()
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

describe('LauncherDebugPage', () => {
  afterEach(() => {
    cleanup()
    reportAppEvent.mockReset()
    clearLauncherImageCache.mockReset()
    loadLauncherNexusDiagnostics.mockReset()
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
    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

    expect(screen.getByRole('heading', { name: copy.debug.title })).toBeTruthy()
    expect(screen.getByText(copy.debug.notificationsOverviewTitle)).toBeTruthy()
    expect(screen.getByText(copy.debug.logsOverviewTitle)).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.debug.notificationsTitle, level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.debug.logsTitle, level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.debug.simulationTitle, level: 2 })).toBeTruthy()
  })

  it('renders a debug mode switch and calls the toggle handler', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    const onToggleDebugMode = vi.fn()

    renderWithLocale(
      <LauncherDebugPage debugEnabled={true} onToggleDebugMode={onToggleDebugMode} downloads={downloads as never} />,
      'zh-CN',
    )

    const toggle = screen.getByRole('switch', { name: copy.debug.debugOnlyTitle })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)

    expect(onToggleDebugMode).toHaveBeenCalledTimes(1)
  })

  it('emits a debug notification test event', () => {
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())
    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

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
    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

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
    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

    fireEvent.click(screen.getByRole('button', { name: copy.debug.simulationButtonIdle }))

    expect(downloads.startDebugSimulation).toHaveBeenCalledTimes(1)
  })

  it('clears the launcher image cache from the debug page', () => {
    clearLauncherImageCache.mockResolvedValue(undefined)
    loadLauncherNexusDiagnostics.mockReturnValue(createNeverSettledPromise())

    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

    fireEvent.click(screen.getByRole('button', { name: copy.debug.clearImageCacheButton }))

    expect(clearLauncherImageCache).toHaveBeenCalledTimes(1)
  })

  it('shows a loading message while Nexus diagnostics are still pending', () => {
    const pending = createDeferred<{ routes: never[] }>()
    loadLauncherNexusDiagnostics.mockReturnValue(pending.promise)

    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

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
          routeId: 'publicHtml',
          label: 'Nexus Public HTML',
          endpoint: 'https://www.nexusmods.com/stardewvalley',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })

    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

    expect(await screen.findByText('Nexus Public GraphQL')).toBeTruthy()
    expect(screen.getByText('warning')).toBeTruthy()
    expect(screen.getByText('success')).toBeTruthy()
    expect(screen.getByText('Failed after 3 attempts: timeout')).toBeTruthy()
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
          routeId: 'publicHtml',
          label: 'Nexus Public HTML',
          endpoint: 'https://www.nexusmods.com/stardewvalley',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })

    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

    const warningLabel = await screen.findByText('warning')
    const successLabel = screen.getByText('success')

    expect(warningLabel.className).toContain('launcher-debug-route-status-warning')
    expect(successLabel.className).toContain('launcher-debug-route-status-success')
    expect(warningLabel.querySelector('.launcher-debug-route-status-copy')).toBeNull()
    expect(successLabel.querySelector('.launcher-debug-route-status-copy')).toBeNull()
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

    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

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
