import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publishNotification } from './notifications'
import { setDesktopDebugLoggingEnabled, writeFrontendLog } from '../desktop'
import { reportAppEvent, syncDebugDiagnosticsEnabled } from './observability'

vi.mock('./notifications', () => ({
  publishNotification: vi.fn(),
}))

vi.mock('../desktop', () => ({
  setDesktopDebugLoggingEnabled: vi.fn(async () => undefined),
  writeFrontendLog: vi.fn(async () => undefined),
}))

describe('observability', () => {
  beforeEach(async () => {
    await syncDebugDiagnosticsEnabled(false)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await syncDebugDiagnosticsEnabled(false)
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

    expect(setDesktopDebugLoggingEnabled).toHaveBeenNthCalledWith(1, true)
    expect(setDesktopDebugLoggingEnabled).toHaveBeenNthCalledWith(2, false)
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
})
