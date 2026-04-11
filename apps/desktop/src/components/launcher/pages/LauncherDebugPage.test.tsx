import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../../../lib/editor-shell'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherDebugPage } from './LauncherDebugPage'

const reportAppEvent = vi.fn()
const clearLauncherImageCache = vi.fn()

vi.mock('../../../lib/app/observability', () => ({
  reportAppEvent: (...args: unknown[]) => reportAppEvent(...args),
}))

vi.mock('../../../lib/desktop', () => ({
  clearLauncherImageCache: (...args: unknown[]) => clearLauncherImageCache(...args),
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
    downloads.startDebugSimulation.mockReset()
  })

  it('renders localized debug tool sections', () => {
    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

    expect(screen.getByRole('heading', { name: copy.debug.title })).toBeTruthy()
    expect(screen.getByText(copy.debug.notificationsOverviewTitle)).toBeTruthy()
    expect(screen.getByText(copy.debug.logsOverviewTitle)).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.debug.notificationsTitle, level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.debug.logsTitle, level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: copy.debug.simulationTitle, level: 2 })).toBeTruthy()
  })

  it('renders a debug mode switch and calls the toggle handler', () => {
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
    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

    fireEvent.click(screen.getByRole('button', { name: copy.debug.simulationButtonIdle }))

    expect(downloads.startDebugSimulation).toHaveBeenCalledTimes(1)
  })

  it('clears the launcher image cache from the debug page', () => {
    clearLauncherImageCache.mockResolvedValue(undefined)

    renderWithLocale(<LauncherDebugPage debugEnabled={true} onToggleDebugMode={vi.fn()} downloads={downloads as never} />, 'zh-CN')

    fireEvent.click(screen.getByRole('button', { name: copy.debug.clearImageCacheButton }))

    expect(clearLauncherImageCache).toHaveBeenCalledTimes(1)
  })
})
