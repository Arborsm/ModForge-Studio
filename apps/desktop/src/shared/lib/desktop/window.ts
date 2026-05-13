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
    return
  }

  await getPlatformPorts().desktopWindow.toggleMaximize()
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

