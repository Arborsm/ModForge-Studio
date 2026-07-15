import type { SettingsWindowCategory } from '@shared/contracts'

const OPEN_SETTINGS_EVENT = 'modforge:open-settings'

/** Requests the app shell to open a settings category without coupling lower FSD layers to app state. */
export function requestAppSettings(category: SettingsWindowCategory) {
  window.dispatchEvent(new CustomEvent<SettingsWindowCategory>(OPEN_SETTINGS_EVENT, { detail: category }))
}

/** Subscribes the app shell to typed settings requests from lower FSD layers. */
export function listenForAppSettingsRequests(listener: (category: SettingsWindowCategory) => void) {
  const receive = (event: Event) => listener((event as CustomEvent<SettingsWindowCategory>).detail)
  window.addEventListener(OPEN_SETTINGS_EVENT, receive)
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, receive)
}
