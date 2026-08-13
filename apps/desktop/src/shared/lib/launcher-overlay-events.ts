const LAUNCHER_MOD_DETAIL_DISMISS_EVENT = 'modforge:launcher-mod-detail-dismiss'

/**
 * Announces that a global launcher overlay (the downloads manager) opened.
 * Mod detail drawers render through a body portal above in-frame floats, so
 * launcher pages close their detail state on this event instead of importing
 * the top navigation widget.
 */
export function requestLauncherModDetailDismiss() {
  window.dispatchEvent(new CustomEvent(LAUNCHER_MOD_DETAIL_DISMISS_EVENT))
}

/** Subscribes a launcher page to close its mod detail drawer on the event. */
export function listenForLauncherModDetailDismiss(listener: () => void) {
  const receive = () => listener()
  window.addEventListener(LAUNCHER_MOD_DETAIL_DISMISS_EVENT, receive)
  return () => window.removeEventListener(LAUNCHER_MOD_DETAIL_DISMISS_EVENT, receive)
}
