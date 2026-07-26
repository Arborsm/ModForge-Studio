import type { SettingsWindowCategory, SettingsWindowTarget } from '@shared/contracts'

const OPEN_SETTINGS_EVENT = 'modforge:open-settings'

/** Requests a settings destination without coupling lower FSD layers to app state. */
export function requestAppSettings(target: SettingsWindowCategory | SettingsWindowTarget) {
  const detail = typeof target === 'string' ? { category: target } : target
  window.dispatchEvent(new CustomEvent<SettingsWindowTarget>(OPEN_SETTINGS_EVENT, { detail }))
}

/** Subscribes the app shell to typed settings requests from lower FSD layers. */
export function listenForAppSettingsRequests(listener: (target: SettingsWindowTarget) => void) {
  const receive = (event: Event) => listener((event as CustomEvent<SettingsWindowTarget>).detail)
  window.addEventListener(OPEN_SETTINGS_EVENT, receive)
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, receive)
}
