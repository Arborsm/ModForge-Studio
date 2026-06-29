import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { playNotificationSound, setNotificationSoundEnabled } from '@shared/ui/notifications/notificationSounds'

describe('notificationSounds', () => {
  beforeEach(() => {
    setNotificationSoundEnabled(true)
    vi.unstubAllGlobals()
  })

  it('does not create an audio element while notification sounds are disabled', () => {
    const audioConstructor = vi.fn(() => ({
      volume: 0,
      play: vi.fn(async () => undefined),
    }))
    vi.stubGlobal('Audio', audioConstructor)

    setNotificationSoundEnabled(false)
    playNotificationSound('success')

    expect(audioConstructor).not.toHaveBeenCalled()
  })
})
