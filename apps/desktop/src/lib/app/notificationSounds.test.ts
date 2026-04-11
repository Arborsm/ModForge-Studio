import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playNotificationSound, setNotificationSoundEnabled } from './notificationSounds'

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
