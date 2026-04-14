import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNotifications, dismissNotification, publishNotification } from './notifications'
import { playNotificationSound } from './notificationSounds'

vi.mock('./notificationSounds', () => ({
  playNotificationSound: vi.fn(),
}))

describe('publishNotification', () => {
  beforeEach(() => {
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
})
