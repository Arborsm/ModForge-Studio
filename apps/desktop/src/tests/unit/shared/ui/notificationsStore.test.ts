import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

vi.mock('@shared/ui/notifications/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
}))

import type * as NotificationsModule from '@shared/ui/notifications/notifications'

type Notifications = typeof NotificationsModule

async function loadModule(): Promise<Notifications> {
  vi.resetModules()
  return (await import('@shared/ui/notifications/notifications')) as Notifications
}

describe('notification store log', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('keeps a bounded recent log of published notifications', async () => {
    const notifications = await loadModule()
    for (let index = 0; index < 55; index += 1) {
      notifications.publishNotification({ id: `log-${index}`, level: 'info', title: `t${index}` })
    }

    // 55 unique records published, log capped at 50 → 50 unread records remain.
    expect(notifications.getUnreadNotificationCount()).toBe(50)
  })

  it('expires a toast without deleting its record and dismiss deletes it', async () => {
    const notifications = await loadModule()
    notifications.publishNotification({ id: 'pin', level: 'warning', title: 'kept' })
    notifications.expireNotificationToast('pin')

    notifications.publishNotification({ id: 'temp', level: 'info', title: 'gone' })
    notifications.dismissNotification('temp')

    expect(notifications.getUnreadNotificationCount()).toBe(1)
  })

  it('marks all notifications seen on demand', async () => {
    const notifications = await loadModule()
    notifications.publishNotification({ id: 'a', level: 'info', title: 'a' })
    notifications.publishNotification({ id: 'b', level: 'error', title: 'b' })
    expect(notifications.getUnreadNotificationCount()).toBe(2)

    notifications.markNotificationsSeen()
    expect(notifications.getUnreadNotificationCount()).toBe(0)

    notifications.markNotificationRead('a')
    expect(notifications.getUnreadNotificationCount()).toBe(0)
  })
})
