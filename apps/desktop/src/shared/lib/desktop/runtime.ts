import type { PlatformPorts } from '@shared/contracts'

let platformPorts: PlatformPorts | null = null

/** Installs the platform ports used by desktop infrastructure helpers. */
export function configureDesktopPlatformPorts(ports: PlatformPorts) {
  platformPorts = ports
}

/** Returns configured platform ports or throws when the app has not mounted a provider. */
export function getPlatformPorts() {
  if (!platformPorts) {
    throw new Error('Desktop platform ports have not been configured.')
  }

  return platformPorts
}

/** Reports whether the current runtime can call desktop host capabilities. */
export function canUseDesktopHost() {
  return platformPorts?.hostEvents.canUseHost() ?? false
}

/** Invokes a typed desktop command through the configured file system port. */
export async function invokeDesktop<T>(command: string, args?: Record<string, unknown>) {
  if (!canUseDesktopHost()) {
    throw new Error('This feature is only available in the desktop host.')
  }

  return getPlatformPorts().fileSystem.invokeCommand<T>(command, args)
}

/** Converts a local path into a webview-safe asset URL. */
export function toDesktopAssetUrl(path: string, protocol?: string) {
  return getPlatformPorts().fileSystem.toAssetUrl(path, protocol)
}
