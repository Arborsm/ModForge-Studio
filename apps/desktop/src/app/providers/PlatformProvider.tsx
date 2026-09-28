/**
 * @file Platform Provider: selects the Android, Electron or Tauri platform ports based on the runtime environment and injects them into PlatformContext.
 */
import { useEffect, useMemo, type ReactNode } from 'react'
import { isAndroidHost, createAndroidPlatformPorts, installAndroidSystemBarSync } from '@platform/android'
import { createElectronPlatformPorts, isElectronHost } from '@platform/electron'
import { createTauriPlatformPorts } from '@platform/tauri'
import type { PlatformPorts } from '@shared/contracts'
import { configureDesktopPlatformPorts } from '@platform/host'
import { PlatformContext } from './platformContext'

/** Props for PlatformProvider. */
export type PlatformProviderProps = {
  children: ReactNode
  ports?: PlatformPorts
}

/** Platform Provider component: creates or receives platform ports and injects them into PlatformContext. */
export function PlatformProvider({ children, ports }: PlatformProviderProps) {
  const defaultPorts = useMemo(
    () =>
      ports ??
      (isAndroidHost() ? createAndroidPlatformPorts() : isElectronHost() ? createElectronPlatformPorts() : createTauriPlatformPorts()),
    [ports],
  )
  configureDesktopPlatformPorts(defaultPorts)

  // Android host: keep the native status/nav bar strip in sync with the app theme.
  useEffect(() => {
    if (isAndroidHost()) {
      installAndroidSystemBarSync()
    }
  }, [])

  return <PlatformContext.Provider value={defaultPorts}>{children}</PlatformContext.Provider>
}
