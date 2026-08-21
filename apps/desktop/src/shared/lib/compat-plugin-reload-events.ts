/** @file Typed CustomEvent bridge that lets lower FSD layers request a compat-plugin hot-reload without importing app state. */

const RELOAD_COMPAT_PLUGINS_EVENT = 'modforge:reload-compat-plugins'

/** Requests a compat-plugin hot-reload from any FSD layer. Fire-and-forget; observers read the result from the compat plugin store. */
export function requestCompatPluginReload(): void {
  window.dispatchEvent(new CustomEvent(RELOAD_COMPAT_PLUGINS_EVENT))
}

/** Subscribes the app shell to compat-plugin reload requests from lower FSD layers. */
export function listenCompatPluginReloadRequests(handler: () => void): () => void {
  const receive = () => handler()
  window.addEventListener(RELOAD_COMPAT_PLUGINS_EVENT, receive)
  return () => window.removeEventListener(RELOAD_COMPAT_PLUGINS_EVENT, receive)
}
