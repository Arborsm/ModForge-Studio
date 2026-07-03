import { act, cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { LocaleProvider } from '@locales/provider'
import { clearNotifications, dismissNotification, NotificationProvider, publishNotification } from './notifications'
import { playNotificationSound } from './notificationSounds'

vi.mock('./notificationSounds', () => ({
  playNotificationSound: vi.fn(),
}))

describe('publishNotification', () => {
  beforeEach(() => {
    cleanup()
    clearNotifications()
    vi.clearAllMocks()
  })

  it('plays the level sound when a notification is first published', () => {
    publishNotification({
      id: 'library-refresh',
      level: 'info',
      title: 'Refreshing library',
    })

    expect(playNotificationSound).toHaveBeenCalledWith('info')
  })

  it('does not replay the sound when updating an existing notification id', () => {
    publishNotification({
      id: 'cover-fetch',
      level: 'info',
      title: 'Fetching covers',
      progress: 10,
      autoDismissMs: null,
    })
    vi.mocked(playNotificationSound).mockClear()

    publishNotification({
      id: 'cover-fetch',
      level: 'info',
      title: 'Fetching covers',
      progress: 70,
      autoDismissMs: null,
    })

    expect(playNotificationSound).not.toHaveBeenCalled()
  })

  it('plays again after the previous notification id has been dismissed', () => {
    const id = publishNotification({
      id: 'gallery-load',
      level: 'warning',
      title: 'Loading gallery',
    })
    dismissNotification(id)
    vi.mocked(playNotificationSound).mockClear()

    publishNotification({
      id: 'gallery-load',
      level: 'warning',
      title: 'Loading gallery',
    })

    expect(playNotificationSound).toHaveBeenCalledWith('warning')
  })

  it('does not rerender provider children when updating notification progress', () => {
    const childRenderSpy = vi.fn()

    function StableChild() {
      childRenderSpy()
      return <div>Stable app</div>
    }

    render(
      <LocaleProvider locale="en-US">
        <NotificationProvider>
          <StableChild />
        </NotificationProvider>
      </LocaleProvider>,
    )

    expect(screen.getByText('Stable app')).toBeTruthy()
    expect(childRenderSpy).toHaveBeenCalledTimes(1)

    act(() => {
      publishNotification({
        id: 'launcher-updates-progress',
        level: 'info',
        title: 'Checking updates',
        description: '1 of 100',
        autoDismissMs: null,
        progress: 1,
      })
    })

    act(() => {
      publishNotification({
        id: 'launcher-updates-progress',
        level: 'info',
        title: 'Checking updates',
        description: '2 of 100',
        autoDismissMs: null,
        progress: 2,
      })
    })

    expect(childRenderSpy).toHaveBeenCalledTimes(1)
  })
})
