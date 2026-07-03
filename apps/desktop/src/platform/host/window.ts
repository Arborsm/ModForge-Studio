import { canUseDesktopHost, getPlatformPorts } from './runtime'

/** Minimizes the current desktop window when running inside Tauri. */
export async function minimizeCurrentWindow() {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.minimize()
}

/** Toggles maximize state for the current desktop window. */
export async function toggleMaximizeCurrentWindow() {
  if (!canUseDesktopHost()) {
    return false
  }

  return getPlatformPorts().desktopWindow.toggleMaximize()
}

/** Reads maximized state for the current desktop window. */
export async function isCurrentWindowMaximized() {
  if (!canUseDesktopHost()) {
    return false
  }

  return getPlatformPorts().desktopWindow.isMaximized()
}

/** Reads fullscreen state for the current desktop window. */
export async function isCurrentWindowFullscreen() {
  if (!canUseDesktopHost()) {
    return false
  }

  return getPlatformPorts().desktopWindow.isFullscreen()
}

/** Sets fullscreen state for the current desktop window. */
export async function setFullscreenCurrentWindow(fullscreen: boolean) {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.setFullscreen(fullscreen)
}

/** Toggles fullscreen state and returns the next fullscreen value. */
export async function toggleFullscreenCurrentWindow() {
  if (!canUseDesktopHost()) {
    return false
  }

  return getPlatformPorts().desktopWindow.toggleFullscreen()
}

/** Closes the current desktop window when running inside Tauri. */
export async function closeCurrentWindow() {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.close()
}

/** Closes the current desktop window without re-emitting a host close request. */
export async function forceCloseCurrentWindow() {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.forceClose()
}

/** Hides the current desktop window to the background without exiting the app. */
export async function hideCurrentWindow() {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.hide()
}

/** Shows and focuses the current desktop window after it was hidden. */
export async function showCurrentWindow() {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.show()
}

/** Hides the current desktop window so it can be restored from the system tray. */
export async function minimizeCurrentWindowToTray() {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.hide()
}

/** Listens for native host close requests such as Alt-F4 or window manager close. */
export async function listenToWindowCloseRequest(listener: () => boolean | Promise<boolean>) {
  if (!canUseDesktopHost()) {
    return () => {}
  }

  return getPlatformPorts().hostEvents.listenWindowCloseRequest(listener)
}
