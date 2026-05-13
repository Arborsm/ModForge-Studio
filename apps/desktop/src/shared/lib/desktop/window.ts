import { canUseDesktopHost, getPlatformPorts } from './runtime'

export async function minimizeCurrentWindow() {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.minimize()
}

export async function toggleMaximizeCurrentWindow() {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.toggleMaximize()
}

export async function isCurrentWindowFullscreen() {
  if (!canUseDesktopHost()) {
    return false
  }

  return getPlatformPorts().desktopWindow.isFullscreen()
}

export async function setFullscreenCurrentWindow(fullscreen: boolean) {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.setFullscreen(fullscreen)
}

export async function toggleFullscreenCurrentWindow() {
  if (!canUseDesktopHost()) {
    return false
  }

  return getPlatformPorts().desktopWindow.toggleFullscreen()
}

export async function closeCurrentWindow() {
  if (!canUseDesktopHost()) {
    return
  }

  await getPlatformPorts().desktopWindow.close()
}

