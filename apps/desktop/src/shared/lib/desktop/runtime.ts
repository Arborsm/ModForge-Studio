import type { PlatformPorts } from '@shared/contracts'

let platformPorts: PlatformPorts | null = null

export function configureDesktopPlatformPorts(ports: PlatformPorts) {
  platformPorts = ports
}

export function getPlatformPorts() {
  if (!platformPorts) {
    throw new Error('Desktop platform ports have not been configured.')
  }

  return platformPorts
}

export function canUseDesktopHost() {
  return platformPorts?.hostEvents.canUseHost() ?? false
}

export async function invokeDesktop<T>(command: string, args?: Record<string, unknown>) {
  if (!canUseDesktopHost()) {
    throw new Error('This feature is only available in the Tauri desktop host.')
  }

  return getPlatformPorts().fileSystem.invokeCommand<T>(command, args)
}

export function toDesktopAssetUrl(path: string, protocol?: string) {
  return getPlatformPorts().fileSystem.toAssetUrl(path, protocol)
}