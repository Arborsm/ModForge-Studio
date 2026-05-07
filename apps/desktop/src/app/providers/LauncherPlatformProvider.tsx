import { type ReactNode, useMemo } from 'react'
import { createLauncherPortAdapter } from './launcherPortAdapter'
import { LauncherProvider } from '@features/launcher/model/launcherProvider'

export type LauncherPlatformProviderProps = {
  children: ReactNode
}

export function LauncherPlatformProvider({ children }: LauncherPlatformProviderProps) {
  const port = useMemo(() => createLauncherPortAdapter(), [])
  return <LauncherProvider port={port}>{children}</LauncherProvider>
}
