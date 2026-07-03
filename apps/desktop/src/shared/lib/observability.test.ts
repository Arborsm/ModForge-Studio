import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { publishNotification } from '@shared/ui/notifications'
import { configureObservability, reportAppEvent, syncDebugDiagnosticsEnabled } from './observability'

vi.mock('@shared/ui/notifications', () => ({
  publishNotification: vi.fn(),
}))

describe('observability', () => {
  const setDebugLoggingEnabled = vi.fn(async () => undefined)
  const writeFrontendLog = vi.fn(async () => undefined)

  beforeEach(async () => {
    configureObservability({ setDebugLoggingEnabled, writeFrontendLog })
    await syncDebugDiagnosticsEnabled(false)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await syncDebugDiagnosticsEnabled(false)
    configureObservability({})
    vi.restoreAllMocks()
  })

  it('suppresses debug events while debug diagnostics are disabled', () => {
    expect(
      reportAppEvent({
        level: 'debug',
        title: 'Simulation context updated',
      }),
    ).toBeNull()

    expect(publishNotification).not.toHaveBeenCalled()
    expect(writeFrontendLog).not.toHaveBeenCalled()
  })

  it('publishes notifications and persists logs for visible non-debug events', () => {
    reportAppEvent({
      level: 'info',
      title: 'Launcher settings loaded',
      description: 'Using detected game directory.',
    })

    expect(publishNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        title: 'Launcher settings loaded',
      }),
    )
    expect(writeFrontendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        message: expect.stringContaining('Launcher settings loaded'),
      }),
    )
  })

  it('maps success notifications to info-level persistent logs', () => {
    reportAppEvent({
      level: 'success',
      title: 'Project saved',
    })

    expect(writeFrontendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        message: 'Project saved',
      }),
    )
  })

  it('syncs the debug diagnostics flag into the backend logger', async () => {
    await syncDebugDiagnosticsEnabled(true)
    await syncDebugDiagnosticsEnabled(false)

    expect(setDebugLoggingEnabled).toHaveBeenNthCalledWith(1, true)
    expect(setDebugLoggingEnabled).toHaveBeenNthCalledWith(2, false)
  })

  it('emits debug notifications and logs once debug diagnostics are enabled', async () => {
    await syncDebugDiagnosticsEnabled(true)

    reportAppEvent({
      level: 'debug',
      title: 'Simulation target selected',
    })

    expect(publishNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
      }),
    )
    expect(writeFrontendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
      }),
    )
  })

  it('allows debug events when the caller explicitly confirms debug diagnostics are enabled', () => {
    reportAppEvent({
      level: 'debug',
      title: 'Launcher debug button test',
      debugDiagnosticsEnabled: true,
    })

    expect(publishNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
        title: 'Launcher debug button test',
      }),
    )
    expect(writeFrontendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
      }),
    )
  })

  it('forces warning and error notifications while debug diagnostics are enabled', async () => {
    await syncDebugDiagnosticsEnabled(true)

    reportAppEvent({
      level: 'warning',
      title: 'Rate limit approaching',
      notify: false,
    })
    reportAppEvent({
      level: 'error',
      title: 'Catalog refresh failed',
      notify: false,
    })

    expect(publishNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        level: 'warning',
        title: 'Rate limit approaching',
      }),
    )
    expect(publishNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        level: 'error',
        title: 'Catalog refresh failed',
      }),
    )
  })

  it('still allows non-critical notifications to stay muted in debug mode', async () => {
    await syncDebugDiagnosticsEnabled(true)

    expect(
      reportAppEvent({
        level: 'info',
        title: 'Background refresh complete',
        notify: false,
      }),
    ).toBeNull()

    expect(publishNotification).not.toHaveBeenCalled()
    expect(writeFrontendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        message: 'Background refresh complete',
      }),
    )
  })

  it('forwards direct console warnings through the observability adapter', () => {
    console.warn('Failed to sample palette preview row.', new Error('canvas unavailable'))

    expect(writeFrontendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warning',
        message: expect.stringContaining('Failed to sample palette preview row.'),
        keyValues: {
          source: 'console',
          method: 'warn',
        },
      }),
    )
  })

  it('does not forward frontend log console mirrors back into the adapter', () => {
    window.__MODFORGE_MIRRORING_FRONTEND_LOG__ = true

    try {
      console.warn('[webview][WARN] Launcher settings save failed source=launcher-settings')
    } finally {
      window.__MODFORGE_MIRRORING_FRONTEND_LOG__ = false
    }

    expect(writeFrontendLog).not.toHaveBeenCalled()
  })
})
