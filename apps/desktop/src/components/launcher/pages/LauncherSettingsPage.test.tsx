import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../../../lib/editor-shell'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherSettingsPage } from './LauncherSettingsPage'

const reportAppEvent = vi.fn()

vi.mock('../../../lib/app/observability', () => ({
  reportAppEvent: (...args: unknown[]) => reportAppEvent(...args),
}))

const copy = editorCopy['zh-CN'].launcher

describe('LauncherSettingsPage', () => {
  afterEach(() => {
    cleanup()
    reportAppEvent.mockReset()
  })

  it('renders localized debug tool sections', () => {
    renderWithLocale(<LauncherSettingsPage />, 'zh-CN')

    expect(screen.getByRole('heading', { name: copy.debug.title })).toBeTruthy()
    expect(screen.getAllByText(copy.debug.notificationsTitle).length).toBeGreaterThan(0)
    expect(screen.getAllByText(copy.debug.logsTitle).length).toBeGreaterThan(0)
  })

  it('emits a debug notification test event', () => {
    renderWithLocale(<LauncherSettingsPage />, 'zh-CN')

    fireEvent.click(screen.getByRole('button', { name: copy.debug.notificationButtons.debug }))

    expect(reportAppEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
        title: copy.debug.notificationButtons.debug,
      }),
    )
  })

  it('emits a warning log test event without showing a notification', () => {
    renderWithLocale(<LauncherSettingsPage />, 'zh-CN')

    fireEvent.click(screen.getByRole('button', { name: copy.debug.logButtons.warning }))

    expect(reportAppEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warning',
        title: copy.debug.logButtons.warning,
        notify: false,
      }),
    )
  })
})
