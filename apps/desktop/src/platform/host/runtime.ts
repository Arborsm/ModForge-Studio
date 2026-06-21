import type { PlatformPorts } from '@shared/contracts'
import { createHostCommandClient, type HostCommandClient, type HostCommandPolicy } from '@platform/host-command-client'
import type { HostCommandName } from '@platform/host-commands'

let platformPorts: PlatformPorts | null = null
let hostCommandClient: HostCommandClient | null = null

/** Installs the platform ports used by desktop infrastructure helpers. */
export function configureDesktopPlatformPorts(ports: PlatformPorts) {
  platformPorts = ports
  hostCommandClient = createHostCommandClient(ports)
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
export async function invokeDesktop<T>(command: HostCommandName, args: Record<string, unknown> | undefined, policy: HostCommandPolicy) {
  if (!canUseDesktopHost()) {
    throw new Error('This feature is only available in the desktop host.')
  }

  const client = hostCommandClient ?? createHostCommandClient(getPlatformPorts())
  return client.invoke<Record<string, unknown>, T>({
    command,
    args,
    policy,
  })
}

/** Converts a local path into a webview-safe asset URL. */
export function toDesktopAssetUrl(path: string, protocol?: string) {
  return getPlatformPorts().fileSystem.toAssetUrl(path, protocol)
}
