import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { appEvent, configureObservability, setNotificationDispatcher, syncDebugDiagnosticsEnabled } from '@platform/observability'

describe('observability', () => {
  const setDebugLoggingEnabled = vi.fn(async () => undefined)
  const writeFrontendLog = vi.fn(async () => undefined)
  const publishNotification = vi.fn()

  beforeEach(async () => {
    configureObservability({ setDebugLoggingEnabled, writeFrontendLog })
    setNotificationDispatcher(publishNotification)
    await syncDebugDiagnosticsEnabled(false)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await syncDebugDiagnosticsEnabled(false)
    setNotificationDispatcher(null)
    configureObservability({})
    vi.restoreAllMocks()
  })

  it('preserves debug suppression and visible event behavior', async () => {
    expect(appEvent('debug', 'Simulation context updated').emit()).toBeNull()
    expect(writeFrontendLog).not.toHaveBeenCalled()
    await syncDebugDiagnosticsEnabled(true)
    appEvent('info', 'Launcher settings loaded').description('Using detected game directory.').emit()
    expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({ level: 'info', title: 'Launcher settings loaded' }))
    expect(writeFrontendLog).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Launcher settings loaded') }))
  })

  it('supports success mapping and caller debug override', () => {
    appEvent('success', 'Project saved').emit()
    expect(writeFrontendLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'info', message: 'Project saved' }))
    appEvent('debug', 'Launcher debug button test').debugDiagnostics(true).emit()
    expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({ level: 'debug' }))
  })

  it('forces warning and error notifications in debug mode while info stays muted', async () => {
    await syncDebugDiagnosticsEnabled(true)
    appEvent('warning', 'Rate limit approaching').emit({ notify: false })
    appEvent('error', 'Catalog refresh failed').emit({ notify: false })
    appEvent('info', 'Background refresh complete').emit({ notify: false })
    expect(publishNotification).toHaveBeenCalledTimes(2)
  })

  it('preserves error metadata and fallback messages', () => {
    const cause = new Error('root cause')
    const error = new Error('failed', { cause })
    error.name = 'CustomError'
    appEvent('error', 'Operation failed').error(error).context({ errorName: undefined }).emit({ notify: false })
    expect(writeFrontendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        message: error.stack,
        keyValues: expect.objectContaining({ errorName: undefined, errorCause: 'root cause' }),
      }),
    )
    appEvent('error', 'Non-error').error('bad value').emit({ notify: false })
    expect(writeFrontendLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyValues: expect.objectContaining({ errorMessage: 'bad value' }) }),
    )
  })

  it('deduplicates within the window and resets on configure', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(6000)
    appEvent('warning', 'Repeated').dedupe('same', 5000).emit({ notify: false })
    appEvent('warning', 'Repeated').dedupe('same', 5000).emit({ notify: false })
    appEvent('warning', 'Repeated').dedupe('same', 5000).emit({ notify: false })
    expect(writeFrontendLog).toHaveBeenCalledTimes(2)
    configureObservability({ setDebugLoggingEnabled, writeFrontendLog })
    appEvent('warning', 'Repeated').dedupe('same', 5000).emit({ notify: false })
    expect(writeFrontendLog).toHaveBeenCalledTimes(3)
  })

  it('passes a pinned noticeId through to the notification dispatcher', () => {
    appEvent('error', 'Save failed').noticeId('ai-settings-save').emit()
    expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({ id: 'ai-settings-save', level: 'error' }))
    appEvent('error', 'No pinned id').emit()
    expect(publishNotification).toHaveBeenLastCalledWith(expect.objectContaining({ id: undefined }))
  })

  it('passes progress, loading, and pinned auto-dismiss through to the notification dispatcher', () => {
    appEvent('info', 'Checking updates').noticeId('updates-progress').progress(42).loading().autoDismiss(null).emit()
    expect(publishNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'updates-progress', progress: 42, loading: true, autoDismissMs: null }),
    )
    appEvent('info', 'Done').progress(null).loading(false).emit()
    expect(publishNotification).toHaveBeenLastCalledWith(expect.objectContaining({ progress: null, loading: false }))
  })

  it('keeps rejected frontend log writes fire-and-forget', async () => {
    const failingLog = vi.fn(async () => {
      throw new Error('Task was superseded.')
    })
    configureObservability({ setDebugLoggingEnabled, writeFrontendLog: failingLog })
    expect(() => appEvent('info', 'Launcher debug event').emit({ notify: false })).not.toThrow()
    await Promise.resolve()
    expect(failingLog).toHaveBeenCalled()
  })

  it('forwards console warnings and ignores mirrored console logs', () => {
    console.warn('Failed to sample palette preview row.', new Error('canvas unavailable'))
    expect(writeFrontendLog).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warning', keyValues: { source: 'console', method: 'warn' } }),
    )
    vi.clearAllMocks()
    window.__MODFORGE_MIRRORING_FRONTEND_LOG__ = true
    console.warn('mirrored')
    window.__MODFORGE_MIRRORING_FRONTEND_LOG__ = false
    expect(writeFrontendLog).not.toHaveBeenCalled()
  })
})
