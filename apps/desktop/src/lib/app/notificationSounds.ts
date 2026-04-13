import successSoundUrl from '../../assets/notifications/success.mp3'
import infoSoundUrl from '../../assets/notifications/info.mp3'
import debugSoundUrl from '../../assets/notifications/debug.mp3'
import warningSoundUrl from '../../assets/notifications/warning.mp3'
import errorSoundUrl from '../../assets/notifications/error.mp3'
import type { NotificationLevel } from './notifications'

let notificationSoundEnabled = true

const NOTIFICATION_SOUND_URLS: Record<NotificationLevel, string> = {
  success: successSoundUrl,
  info: infoSoundUrl,
  debug: debugSoundUrl,
  warning: warningSoundUrl,
  error: errorSoundUrl,
}

const NOTIFICATION_SOUND_VOLUMES: Record<NotificationLevel, number> = {
  success: 0.5,
  info: 0.45,
  debug: 0.35,
  warning: 0.5,
  error: 0.55,
}

export function setNotificationSoundEnabled(enabled: boolean) {
  notificationSoundEnabled = enabled
}

export function playNotificationSound(level: NotificationLevel) {
  if (typeof Audio === 'undefined' || !notificationSoundEnabled) {
    return
  }

  const url = NOTIFICATION_SOUND_URLS[level]
  if (!url) {
    return
  }

  const audio = new Audio(url)
  audio.volume = NOTIFICATION_SOUND_VOLUMES[level] ?? 0.45

  try {
    const playback = audio.play()
    if (playback && typeof playback.catch === 'function') {
      void playback.catch(() => {})
    }
  } catch {
    // Ignore playback failures when autoplay is blocked or the environment has no media backend.
  }
}
